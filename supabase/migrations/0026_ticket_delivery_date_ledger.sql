-- ============================================================
-- Easy Gold Merch — 0026: ticket stock movements are dated on the DELIVERY date
-- ============================================================
-- Month End Report rule (agreed with the business):
--   A ticket's stock movement belongs to the month of the ticket's requested
--   delivery date — not the day the ticket was created, reviewed, approved,
--   finalized or edited. `tickets.delivery_date` is set on creation and never
--   changes afterwards, so a month looked at today shows the same numbers when
--   it is looked at again in the future.
--
--   ledger date = coalesce(tickets.delivery_date, ticket created day)
--
-- Applies to every ledger row a ticket writes:
--   * MKT booking at submission ('Booked' → 'Deducted' on finalize) — the
--     booking (accrual) counts as Stock Out from the moment it is made, in the
--     delivery month, whether the ticket is pending, reviewed or approved;
--   * the legacy "booked on review" row;
--   * the CS receipt of a cs_transfer (incl. the OPENING row of a CS item the
--     transfer creates) — MKT Stock Out and CS Stock In land in one month;
--   * Admin ticket edits ('Edit Issue' / 'Edit Return' / 'Edit Receipt').
-- NOT changed: borrow returns ('Returned') stay on the real return day.
-- Rejected / recalled tickets stay excluded from every report (unchanged).
--
-- Guard: a movement dated in the PAST (a ticket created with a past delivery
-- date, or an edit of an older ticket) is refused when it would push the
-- balance below zero at the end of ANY day from that date on — the same strict
-- rule as a dated Stock Out (0025 `sku_min_balance_from`). A delivery date in a
-- future month is fine: the stock is still reserved immediately.
--
-- Section 5 re-dates the existing ticket rows (idempotent) and section 6
-- LISTS any SKU / day whose balance is now negative so it can be fixed by hand
-- (it never raises).
--
-- Bodies = 0017 create_ticket, 0019 update_ticket_status, 0024 edit_ticket;
-- only the ledger dates and the dated guards changed.
-- Idempotent. Run AFTER 0025. Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Helper: the ledger date of a ticket's movements.
-- ------------------------------------------------------------------
create or replace function public.ticket_ledger_date(p_ticket_id text)
returns date
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select coalesce(t.delivery_date, (t.created_at at time zone 'Asia/Vientiane')::date)
       from public.tickets t where t.id = p_ticket_id),
    current_date);
$$;
revoke execute on function public.ticket_ledger_date(text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Helper: may a deduction of p_qty be dated p_day without any day's
--    balance going negative? Returns null when OK, else the error text.
--    p_cur = the item's current_stock BEFORE this deduction.
-- ------------------------------------------------------------------
create or replace function public.dated_out_error(p_cs boolean, p_sku_id text, p_sku_name text,
                                                  p_cur numeric, p_day date, p_qty numeric)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_min numeric;
  v_at  date;
begin
  if p_day is null or p_qty is null or p_qty <= 0 then
    return null;
  end if;
  select b.min_bal, b.at_day into v_min, v_at
    from public.sku_min_balance_from(p_cs, p_sku_id, p_cur, p_day) b;
  if coalesce(v_min, 0) < p_qty then
    return 'Not enough stock of "' || coalesce(p_sku_name, p_sku_id) || '" on ' || v_at
        || ': only ' || public.nice_num(coalesce(v_min, 0)) || ' left that day — '
        || public.nice_num(p_qty) || ' dated ' || p_day || ' (delivery date) would make it negative';
  end if;
  return null;
end;
$$;
revoke execute on function public.dated_out_error(boolean, text, text, numeric, date, numeric)
  from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 3. create_ticket — 0017 body; the booking is dated on the delivery date
--    and a PAST delivery date must not push any day negative.
-- ------------------------------------------------------------------
create or replace function public.create_ticket(
  p_created_by text,
  p_created_by_name text,
  p_department text,
  p_delivery_date date,
  p_remark text,
  p_type text default 'request',
  p_return_date date default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id text := public.next_id('TKT-');
  v_item      jsonb;
  v_count     int := 0;
  v_sku_id    text;
  v_sku_name  text;
  v_qty       numeric;
  v_available numeric;
  v_unbooked  numeric;
  v_creator_role text;
  v_auto      boolean := false;
  v_auto_note text := 'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager';
  -- 0026: every movement of this ticket is dated on its delivery date
  v_ledger_date date := coalesce(p_delivery_date, (now() at time zone 'Asia/Vientiane')::date);
  v_dated_err text;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('success', false, 'error', 'Ticket must have at least one item');
  end if;

  -- ── availability guard ─────────────────────────────────────────
  for v_sku_id in
    select distinct e->>'sku_id' as sid
      from jsonb_array_elements(p_items) e
     where coalesce((e->>'qty_requested')::numeric, 0) > 0
     order by sid
  loop
    perform 1 from public.skus where id = v_sku_id for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Unknown item: ' || v_sku_id);
    end if;

    select s.current_stock into v_available from public.skus s where s.id = v_sku_id;

    -- Pending tickets submitted BEFORE booking-at-creation went live
    -- have not deducted anything yet — count them against availability.
    select coalesce(sum(ti.qty_requested), 0) into v_unbooked
      from public.ticket_items ti
      join public.tickets t on t.id = ti.ticket_id
     where ti.sku_id = v_sku_id
       and t.status = 'pending'
       and not exists (
         select 1 from public.stock_transactions st
          where st.ticket_id = t.id and st.sku_id = ti.sku_id
            and st.type = 'deduction' and st.status = 'Booked'
       );

    select coalesce(sum((e->>'qty_requested')::numeric), 0) into v_qty
      from jsonb_array_elements(p_items) e
     where e->>'sku_id' = v_sku_id
       and coalesce((e->>'qty_requested')::numeric, 0) > 0;

    if v_qty > v_available - v_unbooked then
      select s.name into v_sku_name from public.skus s where s.id = v_sku_id;
      return jsonb_build_object(
        'success', false,
        'error', 'Insufficient stock for "' || coalesce(v_sku_name, v_sku_id) || '" — available: '
                 || (v_available - v_unbooked) || ', requested: ' || v_qty
                 || '. Someone may have just booked it — please refresh and try again.'
      );
    end if;

    -- 0026: a PAST delivery date puts this Stock Out in an earlier month —
    -- refuse it when it would push any day's balance below zero.
    if v_ledger_date < (now() at time zone 'Asia/Vientiane')::date then
      select s.name into v_sku_name from public.skus s where s.id = v_sku_id;
      v_dated_err := public.dated_out_error(false, v_sku_id, v_sku_name, v_available, v_ledger_date, v_qty);
      if v_dated_err is not null then
        return jsonb_build_object('success', false, 'error', v_dated_err);
      end if;
    end if;
  end loop;

  -- ── who is really asking? (drives the routing rule) ────────────
  select lower(btrim(u.role)) into v_creator_role
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  if v_creator_role is null or v_creator_role = '' then
    -- No JWT (seed / demo imports) → fall back to the passed-in identity.
    select lower(btrim(u.role)) into v_creator_role
      from public.users u
     where u.email = p_created_by or u.id::text = p_created_by
     limit 1;
  end if;
  v_auto := v_creator_role in ('warehouse', 'warehouse manager');


  -- ── create the ticket ──────────────────────────────────────────
  insert into public.tickets (id, created_by, created_by_name, department, delivery_date,
                              remark, status, type, return_date,
                              wh_comment, wh_comment_at,
                              last_action_at, last_action_by, last_action_status, last_action_comment)
  values (v_ticket_id, p_created_by, p_created_by_name, p_department, p_delivery_date,
          coalesce(p_remark, ''),
          case when v_auto then 'reviewed' else 'pending' end,
          p_type, p_return_date,
          case when v_auto then v_auto_note else null end,
          case when v_auto then now() else null end,
          now(), p_created_by_name,
          case when v_auto then 'Reviewed' else 'Pending' end,
          case when v_auto then v_auto_note else 'Ticket submitted' end);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'qty_requested')::numeric, 0) <= 0 then
      continue;
    end if;
    v_count := v_count + 1;
    insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric,
            -- the requester reviews their own booking → qty is confirmed as-is
            case when v_auto then (v_item->>'qty_requested')::numeric else null end,
            coalesce(v_item->>'unit', 'pcs'));

    -- ── BOOK the requested qty right away (accrual) ──────────────
    update public.skus
       set current_stock = current_stock - (v_item->>'qty_requested')::numeric
     where id = v_item->>'sku_id';

    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric, 'deduction', v_ledger_date,
            p_created_by_name, 'Booked', 'Stock booked on ticket submission');
  end loop;

  if v_count = 0 then
    delete from public.tickets where id = v_ticket_id;
    return jsonb_build_object('success', false, 'error', 'No items with a quantity greater than 0');
  end if;

  -- Submission row (pipeline step 1) — always written, so the pipeline can show
  -- the requester's own role as the submitter.
  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (v_ticket_id, 'Created', 'pending', p_created_by_name,
          (select role from public.users u
            where u.email = p_created_by or u.id::text = p_created_by limit 1),
          'Ticket submitted');

  -- Warehouse Manager request → the review step is complete on arrival and is
  -- credited to the requester, so the trail and the pipeline stay truthful.
  if v_auto then
    insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
    values (v_ticket_id, 'Reviewed', 'reviewed', p_created_by_name, 'warehouse', v_auto_note);
  end if;

  return jsonb_build_object('success', true, 'id', v_ticket_id);
end;
$$;

-- ------------------------------------------------------------------
-- 4. update_ticket_status — 0019 body; the legacy review booking and the
--    cs_transfer CS receipt are dated on the delivery date.
-- ------------------------------------------------------------------
create or replace function public.update_ticket_status(
  p_ticket_id text,
  p_status text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
  v_actor text := coalesce(p_meta->>'actor_name', 'System');
  v_comment text := coalesce(p_meta->>'comment', '');
  -- p_meta JSON arrays arrive as text; coalescing text with '[]'::jsonb
  -- raises SQLSTATE 42804, so normalise them type-safely up front.
  v_items   jsonb := case when jsonb_typeof(p_meta->'items')   = 'array'
                          then p_meta->'items'   else '[]'::jsonb end;
  v_returns jsonb := case when jsonb_typeof(p_meta->'returns') = 'array'
                          then p_meta->'returns' else '[]'::jsonb end;
  v_item record;
  v_qty numeric;
  v_ret numeric;
  v_broken numeric;
  v_mkt record;
  v_cs record;
  -- Ledger reference for a CS receipt: the real ticket id for a movement,
  -- 'OPENING' when this arrival created the CS item (its opening balance).
  v_ledger_ref text;
  v_status_label text;
  v_allowed boolean := false;
  v_role_ok boolean := false;
  v_book_id bigint;
  v_booked numeric;
  v_stock numeric := 0;
  v_note text := '';
  v_cancel_note text;
  v_dated_err text;   -- 0026
  v_caller_role text;
  v_caller_email text;
  v_caller_name text;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ticket not found');
  end if;

  -- ── resolve the REAL caller from the JWT (never trust p_meta) ──
  select u.role, u.email, u.full_name into v_caller_role, v_caller_email, v_caller_name
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  if v_caller_role is null or v_caller_role = '' then
    return jsonb_build_object('success', false,
      'error', 'Account not found for this sign-in session — please sign in again');
  end if;
  v_actor := coalesce(v_caller_name, v_actor);

  -- ── normalize the caller role (mirror of frontend roleFromRaw) ──
  v_caller_role := lower(btrim(v_caller_role));
  v_caller_role := case
    when v_caller_role in ('warehouse', 'warehouse manager') then 'warehouse'
    when v_caller_role in ('line manager', 'line_manager')   then 'line_manager'
    when v_caller_role = 'customer service'                  then 'customer_service'
    else v_caller_role
  end;

  -- ── role authorization per transition ──────────────────────────
  v_role_ok :=
    (p_status = 'reviewed'    and v_caller_role in ('warehouse','admin')) or
    (p_status = 'lm_approved' and v_caller_role = 'line_manager') or
    (p_status = 'finalized'   and v_caller_role in ('director','admin')) or
    (p_status = 'rejected'    and v_caller_role in ('warehouse','line_manager','director','admin')) or
    (p_status = 'recalled'    and (v_caller_role in ('warehouse','admin')
                                   or v_caller_email = v_ticket.created_by)) or
    (p_status = 'returned'    and v_caller_role in ('warehouse','admin'));
  if not v_role_ok then
    return jsonb_build_object('success', false,
      'error', 'Not authorized: ' || coalesce(v_caller_role, 'unknown') || ' cannot ' || p_status);
  end if;

  -- ── validate the transition ────────────────────────────────────
  if p_status = 'reviewed' then
    v_allowed := v_ticket.status = 'pending';
  elsif p_status = 'lm_approved' then
    v_allowed := v_ticket.status = 'reviewed';
  elsif p_status = 'finalized' then
    v_allowed := v_ticket.status = 'lm_approved'
      or (coalesce((p_meta->>'force_finalize')::boolean, false) and v_ticket.status in ('pending','reviewed'));
  elsif p_status = 'rejected' then
    v_allowed := v_ticket.status in ('pending','reviewed','lm_approved');
  elsif p_status = 'recalled' then
    v_allowed := v_ticket.status in ('pending','reviewed','lm_approved');
  elsif p_status = 'returned' then
    v_allowed := v_ticket.status = 'finalized' and v_ticket.type = 'borrow';
  end if;

  if not v_allowed then
    return jsonb_build_object('success', false,
      'error', 'Illegal transition: ' || v_ticket.status || ' -> ' || p_status);
  end if;

  -- ═══ EFFECTS (each transition block is an independent sibling) ═══
  -- 1) PENDING → REVIEWED : confirm the booking made at submission.
  --    Only true-up to the approved qty (never deduct twice).
  if p_status in ('reviewed','lm_approved','finalized') then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_requested, ti.qty_approved, ti.unit
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_qty := coalesce((select (e->>'qty_approved')::numeric
                          from jsonb_array_elements(v_items) e
                         where e->>'sku_id' = v_item.sku_id), nullif(v_item.qty_approved, 0), v_item.qty_requested);
      -- (the over-approval cap is applied below, once the booked qty is known)

      select st.id, st.qty into v_book_id, v_booked
        from public.stock_transactions st
       where st.ticket_id = p_ticket_id and st.sku_id = v_item.sku_id
         and st.type = 'deduction' and st.status = 'Booked'
       order by st.id desc limit 1;

      -- Ceiling = current stock + what this item already booked (the booking is
      -- already deducted from current_stock). Over-approval beyond the request
      -- is allowed up to that ceiling — never more than exists in stock.
      select greatest(coalesce(current_stock, 0), 0) into v_stock
        from public.skus where id = v_item.sku_id;
      v_stock := coalesce(v_stock, 0);
      v_qty := least(greatest(coalesce(v_qty, 0), 0), v_stock + coalesce(v_booked, 0));

      if v_qty is null or v_qty <= 0 then
        -- nothing approved → release whatever was booked
        update public.ticket_items set qty_approved = 0
         where ticket_id = p_ticket_id and sku_id = v_item.sku_id;
        if v_book_id is not null then
          update public.skus set current_stock = current_stock + v_booked
           where id = v_item.sku_id;
          update public.stock_transactions
             set status = 'Booking Cancelled',
                 comment = 'Booking released - nothing approved at review'
           where id = v_book_id;
        end if;
        v_book_id := null;
        continue;
      end if;

      update public.ticket_items set qty_approved = v_qty
       where ticket_id = p_ticket_id and sku_id = v_item.sku_id;

      if v_book_id is not null then
        -- 0026: approving MORE than booked adds Stock Out on the delivery date
        -- — refuse it if any day from then on would go negative (raise → the
        -- whole review rolls back, no half-applied items).
        if v_qty > v_booked then
          v_dated_err := public.dated_out_error(false, v_item.sku_id, v_item.sku_name,
                                                v_stock, public.ticket_ledger_date(p_ticket_id),
                                                  v_qty - v_booked);
          if v_dated_err is not null then
            raise exception '%', v_dated_err;
          end if;
        end if;
        if v_qty <> v_booked then
          update public.skus
             set current_stock = greatest(current_stock - (v_qty - v_booked), 0)
           where id = v_item.sku_id;
          update public.stock_transactions
             set qty = v_qty, comment = 'Stock booked - confirmed at review'
           where id = v_book_id;
        end if;
      else
        -- legacy ticket submitted before booking-at-creation: deduct now
        select * into v_mkt from public.skus where id = v_item.sku_id;
        if found then
          update public.skus set current_stock = greatest(current_stock - v_qty, 0)
           where id = v_item.sku_id;
        end if;
        insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                               action_by, status, comment)
        values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_qty, 'deduction', public.ticket_ledger_date(p_ticket_id),
                v_actor, 'Booked', 'Stock booked on review');
      end if;
      if v_qty is not null and v_qty > 0 and v_qty <> v_booked then
        v_note := v_note || case when v_note = '' then '' else '; ' end
               || v_item.sku_name || ' ' || coalesce(v_booked::text, '0') || ' -> ' || v_qty::text;
      end if;
      v_book_id := null;
    end loop;
  end if;

  -- 2) LM_APPROVED → FINALIZED:
  --      a) convert the MKT booking from 'Booked' → 'Deducted'
  --      b) for cs_transfer, auto-restock the CS warehouse
  if p_status = 'finalized' then
    -- (a) Book → Deduct on the confirmed MKT booking
    update public.stock_transactions
       set status = 'Deducted',
           comment = 'Stock deducted on finalize'
     where ticket_id = p_ticket_id
       and type = 'deduction' and status = 'Booked';

    -- (b) CS warehouse receives the stock
    if v_ticket.type = 'cs_transfer' then
      for v_item in
        select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
          from public.ticket_items ti where ti.ticket_id = p_ticket_id
      loop
        v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
        if v_qty <= 0 then continue; end if;

        -- The CS catalog row for this item: shared SKU id first, then the
        -- trimmed/lowercased name (a hand-typed CS item only matches by name).
        select * into v_cs from public.cs_skus where id = v_item.sku_id;
        if not found then
          select * into v_cs
            from public.cs_skus c
           where lower(btrim(coalesce(c.name, ''))) = lower(btrim(coalesce(v_item.sku_name, '')))
           order by c.created_at nulls last
           limit 1;
        end if;

        if v_cs.id is null then
          -- FIRST arrival for this item → the quantity IS its opening balance,
          -- so the ledger row is stamped OPENING (never counted as Stock In —
          -- otherwise the Dashboard shows Opening AND Stock In for one receipt).
          select * into v_mkt from public.skus where id = v_item.sku_id;
          insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock,
                                      total_inflow, image_url, low_stock_threshold, cost_per_unit, status)
          values (v_item.sku_id, v_item.sku_name,
                  coalesce(v_mkt.category, 'General'),
                  coalesce(v_mkt.unit, 'pcs'),
                  v_qty, v_qty, v_qty,
                  v_mkt.image_url,
                  coalesce(v_mkt.low_stock_threshold, 0),
                  coalesce(v_mkt.cost_per_unit, 0),
                  'active');
          v_ledger_ref := 'OPENING';
        else
          -- the item is already in the CS catalog → a normal Stock In
          update public.cs_skus
             set current_stock = coalesce(current_stock, 0) + v_qty,
                 total_inflow  = coalesce(total_inflow, 0)  + v_qty
           where id = v_cs.id;
          v_ledger_ref := v_ticket.id;
        end if;

        insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                            action_by, comment)
        values (v_ledger_ref, coalesce(v_cs.id, v_item.sku_id), v_item.sku_name, v_qty,
                'addition', public.ticket_ledger_date(p_ticket_id),
                'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: ' || v_ticket.id);
      end loop;
    end if;
  end if;

  -- 3) REJECTED / RECALLED : return the booked stock to the MKT WH
  --    CHANGED (0013): the booking is CANCELLED and the stock is restored,
  --    but no reversal `addition` row is written any more. The report maths
  --    treats a cancelled booking as non-existent, so a rejected/recalled
  --    ticket no longer shows a phantom Stock In (and the paired Stock Out
  --    of the booking disappears with it), keeping Stock In / Stock Out
  --    reporting clean. The cancelled row keeps the audit trail.
  if p_status in ('rejected','recalled') and v_ticket.status in ('pending','reviewed','lm_approved') then
    v_cancel_note := case when p_status = 'rejected' then 'ticket rejected' else 'ticket recalled' end;
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      if v_ticket.status = 'pending' then
        -- rejected/recalled before review → release the booking made at submission
        select st.id, st.qty into v_book_id, v_booked
          from public.stock_transactions st
         where st.ticket_id = p_ticket_id and st.sku_id = v_item.sku_id
           and st.type = 'deduction' and st.status = 'Booked'
         order by st.id desc limit 1;
        v_qty := coalesce(v_booked, 0);
        update public.stock_transactions
           set status = 'Booking Cancelled',
               comment = 'Booking released - ' || v_cancel_note
         where id = v_book_id;
        v_book_id := null;
      else
        -- reviewed/lm_approved → qty is already deducted from stock;
        -- cancel the confirmed booking and return the stock
        v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
        update public.stock_transactions
           set status = 'Booking Cancelled',
               comment = 'Booking cancelled - ' || v_cancel_note
         where ticket_id = p_ticket_id and sku_id = v_item.sku_id
           and type = 'deduction' and status = 'Booked';
        if not found then
          -- ledger rows written by an older engine (other status labels)
          update public.stock_transactions
             set status = 'Booking Cancelled',
                 comment = 'Booking cancelled - ' || v_cancel_note
           where ticket_id = p_ticket_id and sku_id = v_item.sku_id
             and type = 'deduction'
             and coalesce(status, '') not in ('Booking Cancelled', 'Deducted');
        end if;
      end if;
      if v_qty is null or v_qty <= 0 then continue; end if;
      update public.skus set current_stock = current_stock + v_qty
       where id = v_item.sku_id;
    end loop;
  end if;

  -- 4) FINALIZED → RETURNED (borrow only): return items recorded
  if p_status = 'returned' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_ret   := coalesce((select (e->>'qty_returned')::numeric
                            from jsonb_array_elements(v_returns) e
                           where e->>'sku_id' = v_item.sku_id), v_item.qty_approved, v_item.qty_requested, 0);
      v_broken := coalesce((select (e->>'qty_broken')::numeric
                             from jsonb_array_elements(v_returns) e
                            where e->>'sku_id' = v_item.sku_id), 0);
      v_ret := least(v_ret, coalesce(v_item.qty_approved, v_item.qty_requested, 0));  -- cap at approved
      if v_ret <= 0 then continue; end if;
      update public.skus set current_stock = current_stock + v_ret
       where id = v_item.sku_id;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type,
                                             date, action_by, status, comment)
      values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_ret, v_broken, 'addition',
              current_date, v_actor, 'Returned',
              coalesce(v_comment, '') || case when v_broken > 0 then ' (' || v_broken || ' broken/lost)' else '' end);
    end loop;
  end if;

  -- ── 5) Stamp the ticket row + audit trail ────────────────────────
  -- Record any approved-qty changes in the comment so the trail (and the
  -- requester) can see why the final number differs from the request.
  if v_note <> '' then
    v_comment := v_comment || case when coalesce(v_comment, '') = '' then '' else ' · ' end
                || 'approved qty: ' || v_note;
  end if;

  v_status_label := case p_status
    when 'reviewed' then 'Reviewed'
    when 'lm_approved' then 'LM Approved'
    when 'finalized' then 'Finalized'
    when 'rejected' then 'Rejected'
    when 'recalled' then 'Recalled'
    when 'returned' then 'Returned'
    else p_status end;

  update public.tickets
     set status = p_status,
         last_action_at = now(),
         last_action_by = v_actor,
         last_action_status = v_status_label,
         last_action_comment = coalesce(v_comment, ''),
         wh_comment = case when p_status = 'reviewed' then coalesce(v_comment, wh_comment) else wh_comment end,
         -- per-level comment timestamps (My Ticket modal shows these)
         wh_comment_at = case when p_status = 'reviewed' and coalesce(v_comment, '') <> ''
                              then now() else wh_comment_at end,
         lm_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'line_manager'
                           then coalesce(v_comment, lm_comment) else lm_comment end,
         lm_comment_at = case when p_status in ('lm_approved','finalized') and v_caller_role = 'line_manager'
                               and coalesce(v_comment, '') <> ''
                              then now() else lm_comment_at end,
         director_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'director'
                                 then coalesce(v_comment, director_comment) else director_comment end,
         director_comment_at = case when p_status in ('lm_approved','finalized') and v_caller_role = 'director'
                                     and coalesce(v_comment, '') <> ''
                                    then now() else director_comment_at end,
         actual_delivery_date = coalesce(
           nullif(p_meta->>'actual_delivery_date', '')::date, actual_delivery_date),
         actual_return_date = case when p_status = 'returned' then current_date else actual_return_date end
   where id = p_ticket_id;

  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (p_ticket_id, v_status_label, p_status, v_actor, v_caller_role, coalesce(v_comment, ''));

  return jsonb_build_object('success', true, 'id', p_ticket_id, 'status', p_status,
                            'message', 'Ticket ' || p_ticket_id || ' → ' || v_status_label);
end;
$$;

-- ------------------------------------------------------------------
-- 4b. edit_ticket — 0024 body; edit rows are dated on the delivery date
--     (a correction belongs to the month the ticket delivered in).
-- ------------------------------------------------------------------
create or replace function public.edit_ticket(
  p_ticket_id text,
  p_items jsonb,      -- [{sku_id, qty, expected_qty}] — the FULL desired item list
  p_remark text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket   record;
  v_item     record;
  v_mkt      record;
  v_cs_stock numeric;
  v_uid      uuid;
  v_role     text;
  v_email    text;
  v_name     text;
  v_remark   text := btrim(coalesce(p_remark, ''));
  v_e        jsonb;
  v_ch       jsonb;
  v_changes  jsonb := '[]'::jsonb;
  v_sku_id   text;
  v_sku_name text;
  v_unit     text;
  v_exists   boolean;
  v_cur      numeric;
  v_new      numeric;
  v_delta    numeric;
  v_qty      numeric;
  v_cs_id    text;
  v_edit_id  bigint;
  v_note     text;
  v_summary  text := '';
  v_kind     text;
  v_ledger_date date;   -- 0026: edit rows land on the ticket's delivery date
  v_dated_err   text;
begin
  -- ── caller from the JWT (never trust the payload) ──────────────────
  select u.id, u.role, u.email, u.full_name into v_uid, v_role, v_email, v_name
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  if v_role is null or v_role = '' then
    return jsonb_build_object('success', false,
      'error', 'Account not found for this sign-in session — please sign in again');
  end if;
  if lower(btrim(v_role)) <> 'admin' then
    return jsonb_build_object('success', false,
      'error', 'Not authorized: only an Admin can edit a ticket');
  end if;
  v_name := coalesce(nullif(btrim(v_name), ''), v_email, 'Admin');

  -- ── payload validation ─────────────────────────────────────────────
  if length(v_remark) < 5 then
    return jsonb_build_object('success', false,
      'error', 'A remark (at least 5 characters) is required to edit a ticket');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('success', false, 'error', 'The edit has no items');
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where coalesce(btrim(e->>'sku_id'), '') = ''
                 -- CASE: SQL does not short-circuit OR, never cast a non-number
                 or case when jsonb_typeof(e->'qty') = 'number'
                         then (e->>'qty')::numeric < 0 else true end) then
    return jsonb_build_object('success', false,
      'error', 'Every line needs an item and a quantity of 0 or more');
  end if;
  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct e->>'sku_id') from jsonb_array_elements(p_items) e) then
    return jsonb_build_object('success', false, 'error', 'The same item appears twice in the edit');
  end if;

  -- ── lock + state checks ────────────────────────────────────────────
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ticket not found');
  end if;
  if v_ticket.status <> 'finalized' then
    return jsonb_build_object('success', false,
      'error', 'Only finalized tickets can be edited (this ticket is ' || v_ticket.status || ')');
  end if;
  v_ledger_date := coalesce(v_ticket.delivery_date,
                            (v_ticket.created_at at time zone 'Asia/Vientiane')::date,
                            current_date);

  -- ── optimistic concurrency: the client must have seen the current lines ──
  for v_item in
    select ti.sku_id, coalesce(ti.qty_approved, ti.qty_requested, 0) as cur
      from public.ticket_items ti where ti.ticket_id = p_ticket_id
  loop
    select e into v_e from jsonb_array_elements(p_items) e where e->>'sku_id' = v_item.sku_id;
    -- the CASE is parenthesised: PL/pgSQL ends an IF condition at the first
    -- top-level THEN, so a bare CASE…THEN would cut the condition short
    if v_e is null
       or (case when jsonb_typeof(v_e->'expected_qty') = 'number'
                then (v_e->>'expected_qty')::numeric <> v_item.cur else true end) then
      return jsonb_build_object('success', false,
        'error', 'This ticket was changed by someone else — please reload it and try again');
    end if;
    v_e := null;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where not exists (select 1 from public.ticket_items ti
                                 where ti.ticket_id = p_ticket_id and ti.sku_id = e->>'sku_id')
                and case when jsonb_typeof(e->'expected_qty') = 'number'
                         then (e->>'expected_qty')::numeric <> 0 else false end) then
    return jsonb_build_object('success', false,
      'error', 'This ticket was changed by someone else — please reload it and try again');
  end if;

  if not exists (select 1 from jsonb_array_elements(p_items) e where (e->>'qty')::numeric > 0) then
    return jsonb_build_object('success', false,
      'error', 'A ticket must keep at least one item — use Reject / Recall to cancel a ticket');
  end if;

  -- ── lock the MKT SKUs in a stable order (no deadlock between editors) ──
  perform 1 from public.skus
   where id in (select e->>'sku_id' from jsonb_array_elements(p_items) e)
   order by id
   for update;

  -- ═══ PHASE 1: validate every line, build the change list (no writes) ═══
  for v_e in
    select e from jsonb_array_elements(p_items) e order by e->>'sku_id'
  loop
    v_sku_id := v_e->>'sku_id';
    v_new    := (v_e->>'qty')::numeric;

    select coalesce(ti.qty_approved, ti.qty_requested, 0), ti.sku_name
      into v_cur, v_sku_name
      from public.ticket_items ti
     where ti.ticket_id = p_ticket_id and ti.sku_id = v_sku_id;
    v_exists := found;
    if not v_exists then v_cur := 0; v_sku_name := null; end if;

    v_delta := v_new - v_cur;
    -- unchanged line (or a new line left at 0) — nothing to do
    if v_delta = 0 then continue; end if;

    select * into v_mkt from public.skus where id = v_sku_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Unknown item: ' || v_sku_id);
    end if;
    v_sku_name := coalesce(v_sku_name, v_mkt.name);
    if not v_exists and lower(coalesce(v_mkt.status, 'active')) <> 'active' then
      return jsonb_build_object('success', false,
        'error', '"' || v_mkt.name || '" is inactive and cannot be added');
    end if;

    if v_delta > 0 and coalesce(v_mkt.current_stock, 0) < v_delta then
      return jsonb_build_object('success', false,
        'error', 'Not enough stock for "' || v_sku_name || '": need ' || public.nice_num(v_delta)
                 || ', available ' || public.nice_num(coalesce(v_mkt.current_stock, 0)));
    end if;
    -- 0026: the extra Stock Out is dated on the delivery date — no day from
    -- then on may go negative.
    if v_delta > 0 then
      v_dated_err := public.dated_out_error(false, v_sku_id, v_sku_name,
                                            coalesce(v_mkt.current_stock, 0), v_ledger_date, v_delta);
      if v_dated_err is not null then
        return jsonb_build_object('success', false, 'error', v_dated_err);
      end if;
    end if;

    if v_ticket.type = 'cs_transfer' and v_delta < 0 then
      v_cs_id := public.edit_ticket_cs_id(v_sku_id, v_sku_name);
      select coalesce(c.current_stock, 0) into v_cs_stock from public.cs_skus c where c.id = v_cs_id;
      if v_cs_id is null or coalesce(v_cs_stock, 0) < -v_delta then
        return jsonb_build_object('success', false,
          'error', 'CS warehouse has only ' || public.nice_num(coalesce(v_cs_stock, 0))
                   || ' of "' || v_sku_name || '" — cannot take back ' || public.nice_num(-v_delta));
      end if;
      v_dated_err := public.dated_out_error(true, v_cs_id, v_sku_name,
                                            coalesce(v_cs_stock, 0), v_ledger_date, -v_delta);
      if v_dated_err is not null then
        return jsonb_build_object('success', false, 'error', v_dated_err);
      end if;
    end if;

    v_changes := v_changes || jsonb_build_object(
      'sku_id', v_sku_id, 'sku_name', v_sku_name,
      'from', v_cur, 'to', v_new, 'delta', v_delta,
      'action', case when not v_exists then 'added' when v_new = 0 then 'removed' else 'adjusted' end);
  end loop;

  if jsonb_array_length(v_changes) = 0 then
    return jsonb_build_object('success', false, 'error', 'Nothing changed — adjust a quantity first');
  end if;

  -- ═══ PHASE 2: apply (any surprise raises → the whole edit rolls back) ═══
  insert into public.ticket_edits (ticket_id, actor_id, actor_name, actor_role, remark, changes)
  values (p_ticket_id, v_uid, v_name, 'admin', v_remark, v_changes)
  returning id into v_edit_id;

  for v_ch in select * from jsonb_array_elements(v_changes)
  loop
    v_sku_id   := v_ch->>'sku_id';
    v_sku_name := v_ch->>'sku_name';
    v_cur      := (v_ch->>'from')::numeric;
    v_new      := (v_ch->>'to')::numeric;
    v_delta    := (v_ch->>'delta')::numeric;
    v_kind     := v_ch->>'action';
    v_qty      := abs(v_delta);
    v_note     := 'Ticket edit #' || v_edit_id || ' by ' || v_name || ' — ' || v_remark
                  || ' · qty ' || public.nice_num(v_cur) || ' → ' || public.nice_num(v_new);

    -- (a) the ticket line
    if v_kind = 'added' then
      select unit into v_unit from public.skus where id = v_sku_id;
      insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
      values (p_ticket_id, v_sku_id, v_sku_name, 0, v_new, coalesce(v_unit, 'pcs'));
    elsif v_kind = 'removed' then
      delete from public.ticket_items where ticket_id = p_ticket_id and sku_id = v_sku_id;
    else
      update public.ticket_items set qty_approved = v_new
       where ticket_id = p_ticket_id and sku_id = v_sku_id;
    end if;

    v_summary := v_summary || case when v_summary = '' then '' else '; ' end
                 || v_sku_name || ' ' || public.nice_num(v_cur) || ' → ' || public.nice_num(v_new)
                 || case v_kind when 'added' then ' (added)' when 'removed' then ' (removed)' else '' end;

    if v_qty = 0 then continue; end if;

    -- (b) MKT stock + ledger
    if v_delta > 0 then
      update public.skus set current_stock = current_stock - v_qty
       where id = v_sku_id and coalesce(current_stock, 0) >= v_qty;
      if not found then
        raise exception 'Not enough stock for "%" — please reload and try again', v_sku_name;
      end if;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_sku_id, v_sku_name, v_qty, 'deduction', v_ledger_date,
              v_name, 'Edit Issue', v_note);
    else
      update public.skus set current_stock = coalesce(current_stock, 0) + v_qty where id = v_sku_id;
      if not found then raise exception 'Unknown item %', v_sku_id; end if;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_sku_id, v_sku_name, v_qty, 'addition', v_ledger_date,
              v_name, 'Edit Return', v_note);
    end if;

    -- (c) cs_transfer: mirror on the CS warehouse
    if v_ticket.type = 'cs_transfer' then
      v_cs_id := public.edit_ticket_cs_id(v_sku_id, v_sku_name);

      if v_delta > 0 then
        if v_cs_id is null then
          -- first time this item reaches CS through an edit: created empty and
          -- then received, so the arrival is a normal (ticket-referenced) Stock In
          select * into v_mkt from public.skus where id = v_sku_id;
          insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock,
                                      total_inflow, image_url, low_stock_threshold, cost_per_unit, status)
          values (v_sku_id, v_sku_name, coalesce(v_mkt.category, 'General'), coalesce(v_mkt.unit, 'pcs'),
                  0, v_qty, v_qty, v_mkt.image_url, coalesce(v_mkt.low_stock_threshold, 0),
                  coalesce(v_mkt.cost_per_unit, 0), 'active');
          v_cs_id := v_sku_id;
        else
          update public.cs_skus
             set current_stock = coalesce(current_stock, 0) + v_qty,
                 total_inflow  = coalesce(total_inflow, 0)  + v_qty
           where id = v_cs_id;
        end if;
        insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                            action_by, status, comment)
        values (p_ticket_id, v_cs_id, v_sku_name, v_qty, 'addition', v_ledger_date,
                v_name, 'Edit Receipt', v_note);
      else
        if v_cs_id is null then
          raise exception 'CS warehouse has no "%" to take back', v_sku_name;
        end if;
        update public.cs_skus
           set current_stock = current_stock - v_qty,
               total_inflow  = coalesce(total_inflow, 0) - v_qty
         where id = v_cs_id and coalesce(current_stock, 0) >= v_qty;
        if not found then
          raise exception 'CS warehouse does not have enough "%" to take back — please reload', v_sku_name;
        end if;
        insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                            action_by, status, comment)
        values (p_ticket_id, v_cs_id, v_sku_name, v_qty, 'deduction', v_ledger_date,
                v_name, 'Edit Return', v_note);
      end if;
    end if;
  end loop;

  -- ── trail (ticket row itself is deliberately NOT touched) ────────────
  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (p_ticket_id, 'Edited', 'edited', v_name, 'admin',
          'Edit #' || v_edit_id || ' — ' || v_remark || ' · ' || v_summary);

  return jsonb_build_object('success', true, 'id', p_ticket_id, 'edit_id', v_edit_id,
                            'changes', v_changes,
                            'message', 'Ticket ' || p_ticket_id || ' edited');
end;
$$;

-- ------------------------------------------------------------------
-- 4c. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.create_ticket from public;
grant execute on function public.create_ticket to authenticated;
revoke execute on function public.update_ticket_status from public;
grant execute on function public.update_ticket_status to authenticated;
revoke execute on function public.edit_ticket(text, jsonb, text) from public, anon;
grant execute on function public.edit_ticket(text, jsonb, text) to authenticated;

-- ------------------------------------------------------------------
-- 5. Backfill — re-date every existing ticket movement to its ticket's
--    delivery date (idempotent: rows already on that date are not touched).
--    Borrow returns ('Returned') keep their real return day.
-- ------------------------------------------------------------------
-- 5a. MKT ledger (bookings, deductions, cancelled bookings, edit rows)
update public.stock_transactions st
   set date = coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date)
  from public.tickets k
 where k.id = st.ticket_id
   and coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date) is not null
   and coalesce(st.status, '') <> 'Returned'
   and st.date is distinct from coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date);

-- 5b. CS ledger rows referencing a ticket (cs_transfer receipts, edit rows)
update public.cs_transactions ct
   set date = coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date)
  from public.tickets k
 where k.id = ct.ticket_id
   and coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date) is not null
   and coalesce(ct.status, '') <> 'Returned'
   and ct.date is distinct from coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date);

-- 5c. CS OPENING rows written by a cs_transfer that CREATED the CS item
--     (0019 stamps them OPENING; the ticket id survives in the comment
--     'Auto-transferred from MKT WH - Ticket: TKT-…').
update public.cs_transactions ct
   set date = coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date)
  from public.tickets k
 where ct.ticket_id = 'OPENING'
   and coalesce(ct.comment, '') like 'Auto-transferred from MKT WH - Ticket: %'
   and k.id = substring(ct.comment from 'Ticket: (\S+)')
   and coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date) is not null
   and ct.date is distinct from coalesce(k.delivery_date, (k.created_at at time zone 'Asia/Vientiane')::date);

-- ------------------------------------------------------------------
-- 6. Check — every SKU / day whose end-of-day balance is NEGATIVE after the
--    re-dating (balance = current_stock − Σ counted movements after that day;
--    same roll-back as the Month End Report). Empty result = all good.
--    Rows here need a manual fix (e.g. a dated Stock In / a corrected
--    delivery date). Re-run this SELECT on its own any time.
-- ------------------------------------------------------------------
with led as (
  select 'MKT'::text as wh, t.sku_id, t.date as d,
         sum(case when t.type = 'addition' then t.qty else -t.qty end) as q
    from public.stock_transactions t
   where t.date is not null
     and lower(coalesce(t.status, '')) not in ('booking cancelled', 'cancelled', 'reversed')
     and not exists (select 1 from public.tickets k
                      where k.id = t.ticket_id and k.status in ('rejected', 'recalled'))
   group by t.sku_id, t.date
  union all
  select 'CS'::text, t.sku_id, t.date,
         sum(case when t.type = 'addition' then t.qty else -t.qty end)
    from public.cs_transactions t
   where t.date is not null
     and lower(coalesce(t.status, '')) not in ('booking cancelled', 'cancelled', 'reversed')
     and not exists (select 1 from public.tickets k
                      where k.id = t.ticket_id and k.status in ('rejected', 'recalled'))
   group by t.sku_id, t.date
), cur as (
  select 'MKT'::text as wh, s.id, s.name, coalesce(s.current_stock, 0) as c from public.skus s
  union all
  select 'CS'::text, s.id, s.name, coalesce(s.current_stock, 0) from public.cs_skus s
), bal as (
  select l.wh, l.sku_id, c.name, l.d,
         c.c - coalesce((select sum(l2.q) from led l2
                          where l2.wh = l.wh and l2.sku_id = l.sku_id and l2.d > l.d), 0) as balance
    from led l
    join cur c on c.wh = l.wh and c.id = l.sku_id
)
select wh as warehouse, sku_id, name as item, d as day, balance
  from bal
 where balance < 0
 order by wh, name, d;
