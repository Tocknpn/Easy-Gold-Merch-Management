-- ============================================================
-- Easy Gold Merch — 0019: the arrival that CREATES a CS item is its Opening
-- ============================================================
-- Fixes: "When CS requests a new item, the system auto-creates the SKU and then
-- stamps BOTH Opening and Stock In with the same 40 — the dashboard reads weird
-- (Opening 40 · Stock In +40 · Current 40)."
--
-- Cause: the cs_transfer auto-restock in `update_ticket_status` created the CS
-- item with `opening_balance = current_stock = total_inflow = qty` AND wrote a
-- `cs_transactions` row stamped with the real ticket id. The Dashboard shows
-- Opening from the stored `opening_balance` and Stock In from the ledger, where
-- only `ticket_id = 'OPENING'` rows are excluded (src/lib/stockMovement.ts), so
-- the same quantity was counted in both columns.
--
-- Rule now (as documented in APP_MASTER_SPEC §5.5 and already used by the
-- legacy data in supabase/seed.sql):
--   * the arrival that CREATES the CS item  -> ticket_id 'OPENING'
--     (it IS the opening balance: Opening = qty, Stock In stays empty)
--   * every later arrival for the same item -> the real ticket id (Stock In)
--
-- The CS item is resolved by the shared SKU id first and then by the
-- trimmed/lowercased name — the same identity rule the app uses to pair rows
-- (src/lib/warehouseMerge.ts). A CS item typed in by hand keeps its own
-- `CS-SKU-...` id and only the name matches, so it is topped up instead of
-- being duplicated.
--
-- Section 3 repairs the rows the old engine already mis-stamped (idempotent).
--
-- `engine_version` deliberately stays '0014': the approval logic — and with it
-- the UI's stock-based over-approval switch — is untouched.
--
-- Idempotent (create or replace). Run AFTER 0014 (and 0018, which fixes the
-- manual transfers). Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. update_ticket_status — identical to 0014 apart from block (b):
--    the genesis arrival is stamped OPENING and the CS item is matched
--    by id or by name.
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
        values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_qty, 'deduction', current_date,
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
                'addition', current_date,
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
-- 2. Data repair — genesis rows the old engine stamped with a ticket id
-- ------------------------------------------------------------------
-- The old block (b) credited `cs_skus.opening_balance` with the qty AND wrote
-- the same qty to `cs_transactions` under the real ticket id, so the Dashboard
-- counted it twice (Opening 40 + Stock In +40 · Current 40). Re-stamp those
-- first-arrival rows to OPENING. Idempotent: a row that is already OPENING is
-- never touched, and a SKU that already HAS an OPENING row is skipped entirely.
--
-- What counts as a genesis row here:
--   * an `addition` row whose reference is a `cs_transfer` ticket,
--   * it is the SKU's EARLIEST ledger row (lowest id = insertion order),
--   * its qty equals the SKU's stored `opening_balance` (the old engine set
--     both from the same v_qty), and
--   * the SKU has no OPENING row yet.
-- Rows that fed a normal Stock In (the item already existed in the CS catalog)
-- keep their ticket reference and stay Stock In.
--
-- Optional: run this SELECT first to see exactly what the UPDATE will touch.
--   select t.id, t.sku_id, t.sku_name, t.qty, t.ticket_id, t.date, t.comment
--     from public.cs_transactions t
--     join public.cs_skus s  on s.id  = t.sku_id
--     join public.tickets tk on tk.id = t.ticket_id
--    where t.type = 'addition'
--      and tk.type = 'cs_transfer'
--      and t.qty = s.opening_balance
--      and coalesce(t.comment, '') like 'Auto-transferred%'
--      and not exists (select 1 from public.cs_transactions o
--                       where o.sku_id = t.sku_id and o.ticket_id = 'OPENING')
--      and t.id = (select min(x.id) from public.cs_transactions x
--                   where x.sku_id = t.sku_id);

update public.cs_transactions t
   set ticket_id = 'OPENING'
  from public.cs_skus s,
       public.tickets tk
 where t.sku_id = s.id
   and tk.id = t.ticket_id
   and tk.type = 'cs_transfer'
   and t.type = 'addition'
   and t.qty = s.opening_balance
   and coalesce(t.comment, '') like 'Auto-transferred%'
   and not exists (select 1 from public.cs_transactions o
                    where o.sku_id = t.sku_id and o.ticket_id = 'OPENING')
   and t.id = (select min(x.id) from public.cs_transactions x
                where x.sku_id = t.sku_id);

-- ------------------------------------------------------------------
-- 3. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
-- `system_config.engine_version` stays '0014' on purpose: the approval logic
-- (and the UI's stock-based over-approval switch) did not change here.
revoke execute on function public.update_ticket_status from public;
grant execute on function public.update_ticket_status to authenticated;
