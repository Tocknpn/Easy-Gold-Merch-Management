-- ============================================================
-- Easy Gold Merch — Ticket stock lifecycle fixes
-- Part 10 (run AFTER 0008_workflow_hardening.sql)
--
-- Repairs the broken/legacy stock accounting so every transition
-- is correct, independent of which earlier version of these
-- functions is currently installed on the live database:
--
--   1) update_ticket_status is re-created as a FLAT (non-nested)
--      state machine. 0007 accidentally nested the finalized /
--      rejected / recalled / returned effect blocks inside the
--      PENDING→REVIEWED branch, so on the live DB they only ran
--      when the transition was 'reviewed' — reject/recall never
--      returned stock and cs_transfer never credited the CS WH.
--   2) Every coalesce is type-safe (explicit casts on
--      p_meta->>'...'), so the old "COALESCE types text and
--      jsonb cannot be matched" error on Review & Book Stock is
--      gone. Caller role still comes from the signed-in JWT
--      (mirrors 0008 hardening).
--   3) Creator recall is now allowed from 'pending' too, so a
--      submitter can pull back a not-yet-reviewed ticket.
--   4) On FINALIZED the MKT booking transaction changes from
--      'Booked' → 'Deducted' (the requested Book→Deduct step).
--   5) manage_sku gains a 'destock' branch so MKT destock and
--      MKT→CS transfer no longer fail with "Unknown action:
--      destock".
--
-- Every function uses `create or replace` → safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- create_ticket — reserves (books) stock the moment a ticket is
-- submitted. Re-asserted unchanged so this file is a coherent,
-- complete definition of the booking lifecycle.
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
  end loop;
-- ── create the ticket ──────────────────────────────────────────
  insert into public.tickets (id, created_by, created_by_name, department, delivery_date,
                              remark, status, type, return_date)
  values (v_ticket_id, p_created_by, p_created_by_name, p_department, p_delivery_date,
          coalesce(p_remark, ''), 'pending', p_type, p_return_date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'qty_requested')::numeric, 0) <= 0 then
      continue;
    end if;
    v_count := v_count + 1;
    insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, unit)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric, coalesce(v_item->>'unit', 'pcs'));

    -- ── BOOK the requested qty right away (accrual) ──────────────
    update public.skus
       set current_stock = current_stock - (v_item->>'qty_requested')::numeric
     where id = v_item->>'sku_id';

    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric, 'deduction', current_date,
            p_created_by_name, 'Booked', 'Stock booked on ticket submission');
  end loop;

  if v_count = 0 then
    delete from public.tickets where id = v_ticket_id;
    return jsonb_build_object('success', false, 'error', 'No items with a quantity greater than 0');
  end if;

  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (v_ticket_id, 'Created', 'pending', p_created_by_name,
          (select role from public.users u where u.email = p_created_by or u.id::text = p_created_by),
          'Ticket submitted');

  return jsonb_build_object('success', true, 'id', v_ticket_id);
end;
$$;
-- ------------------------------------------------------------------
-- update_ticket_status — booking-aware, FLAT state machine.
--   p_meta: jsonb {
--     actor_name, actor_role, comment,
--     actual_delivery_date,            -- set at review
--     items:  [{ sku_id, qty_approved }],   -- review may change qty
--     returns:[{ sku_id, qty_returned, qty_broken }], -- borrow return
--     force_finalize: true             -- admin emergency finalize
--   }
-- All coalesce() calls use explicit casts — never text + jsonb.
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
  v_item record;
  v_qty numeric;
  v_ret numeric;
  v_broken numeric;
  v_mkt record;
  v_cs record;
  v_status_label text;
  v_allowed boolean := false;
  v_role_ok boolean := false;
  v_book_id bigint;
  v_booked numeric;
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
  -- users.role historically stored title-case/spaced labels
  -- ('Warehouse', 'Line Manager', 'Director', ...) while the checks
  -- below compare against stable lowercase values. Canonicalize so a
  -- Warehouse review / Line Manager approve / Director finalize works
  -- regardless of the stored spelling.
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
  -- (creator recall is now allowed from 'pending' too)
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
  --    qty_approved is capped at qty_requested (no over-approval).
  if p_status = 'reviewed' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_requested, ti.qty_approved, ti.unit
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_qty := coalesce((select (e->>'qty_approved')::numeric
                          from jsonb_array_elements(coalesce(p_meta->>'items', '[]'::jsonb)) e
                         where e->>'sku_id' = v_item.sku_id), nullif(v_item.qty_approved, 0), v_item.qty_requested);
      v_qty := least(v_qty, v_item.qty_requested);   -- cap at requested

      select st.id, st.qty into v_book_id, v_booked
        from public.stock_transactions st
       where st.ticket_id = p_ticket_id and st.sku_id = v_item.sku_id
         and st.type = 'deduction' and st.status = 'Booked'
       order by st.id desc limit 1;

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

        select * into v_cs from public.cs_skus where id = v_item.sku_id;
        if found then
          update public.cs_skus
             set current_stock = current_stock + v_qty,
                 total_inflow  = total_inflow  + v_qty
           where id = v_item.sku_id;
        else
          select * into v_mkt from public.skus where id = v_item.sku_id;
          insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock,
                                      total_inflow, image_url, low_stock_threshold, cost_per_unit)
          values (v_item.sku_id, v_item.sku_name,
                  coalesce(v_mkt.category, 'General'),
                  coalesce(v_mkt.unit, 'pcs'),
                  v_qty, v_qty, v_qty,
                  v_mkt.image_url,
                  coalesce(v_mkt.low_stock_threshold, 0),
                  coalesce(v_mkt.cost_per_unit, 0));
        end if;
        insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                            action_by, comment)
        values (v_ticket.id, v_item.sku_id, v_item.sku_name, v_qty, 'addition', current_date,
                'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: ' || v_ticket.id);
      end loop;
    end if;
  end if;
-- 3) REJECTED / RECALLED : return the booked stock to the MKT WH
  if p_status in ('rejected','recalled') and v_ticket.status in ('pending','reviewed','lm_approved') then
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
        update public.stock_transactions set status = 'Booking Cancelled'
         where id = v_book_id;
        v_book_id := null;
      else
        -- reviewed/lm_approved → qty is already deducted from stock;
        -- cancel the confirmed booking and return the stock
        v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
        update public.stock_transactions
           set status = 'Booking Cancelled'
         where ticket_id = p_ticket_id and sku_id = v_item.sku_id
           and type = 'deduction' and status = 'Booked';
      end if;
      if v_qty <= 0 then continue; end if;
      update public.skus set current_stock = current_stock + v_qty
       where id = v_item.sku_id;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_qty, 'addition', current_date,
              v_actor,
              case
                when p_status = 'rejected' and v_ticket.status = 'pending' then 'Rejected - Booking Released'
                when p_status = 'recalled' and v_ticket.status = 'pending' then 'Recalled - Booking Released'
                when p_status = 'rejected' then 'Rejected - Stock Returned'
                else 'Recalled - Stock Returned'
              end,
              coalesce(v_comment, ''));
    end loop;
  end if;
-- 4) FINALIZED → RETURNED (borrow only): return items recorded
  if p_status = 'returned' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_ret   := coalesce((select (e->>'qty_returned')::numeric
                            from jsonb_array_elements(coalesce(p_meta->>'returns', '[]'::jsonb)) e
                           where e->>'sku_id' = v_item.sku_id), v_item.qty_approved, v_item.qty_requested, 0);
      v_broken := coalesce((select (e->>'qty_broken')::numeric
                             from jsonb_array_elements(coalesce(p_meta->>'returns', '[]'::jsonb)) e
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
         lm_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'line_manager'
                           then coalesce(v_comment, lm_comment) else lm_comment end,
         director_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'director'
                                 then coalesce(v_comment, director_comment) else director_comment end,
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
-- manage_sku — add the missing 'destock' branch so MKT direct
-- destock and MKT→CS transfer work. Mirrors manage_cs_sku's destock.
-- p_sku.ticket_id is optional (defaults to 'DIRECT_DESTOCK');
-- the MKT→CS transfer passes 'MKT_TRANSFER' for proper reporting.
-- ------------------------------------------------------------------
create or replace function public.manage_sku(
  p_action text,        -- 'add' | 'update' | 'delete' | 'restock' | 'destock'
  p_sku jsonb,
  p_remark text default null,
  p_action_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_qty numeric;
  v_row record;
  v_tx_id text;
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', public.next_id('sku-'));
    insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
                             image_url, low_stock_threshold, cost_per_unit)
    values (v_id,
            p_sku->>'name',
            p_sku->>'category',
            coalesce(p_sku->>'unit', 'pcs'),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            coalesce((p_sku->>'current_stock')::numeric, coalesce((p_sku->>'opening_balance')::numeric, 0)),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            p_sku->>'image_url',
            coalesce((p_sku->>'low_stock_threshold')::numeric, 0),
            coalesce((p_sku->>'cost_per_unit')::numeric, 0));
    if coalesce((p_sku->>'opening_balance')::numeric, 0) > 0 then
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values ('OPENING', v_id, p_sku->>'name', (p_sku->>'opening_balance')::numeric, 'addition',
              current_date, p_action_by, 'Opening', 'Opening balance on SKU creation');
    end if;
    return jsonb_build_object('success', true, 'id', v_id, 'message', 'SKU added');
elsif p_action = 'restock' then
    v_id := p_sku->>'id';
    v_qty := (p_sku->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('success', false, 'error', 'Restock quantity must be greater than 0');
    end if;
    select * into v_row from public.skus where id = v_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'SKU not found');
    end if;
    update public.skus
       set current_stock = current_stock + v_qty,
           total_inflow  = total_inflow  + v_qty
     where id = v_id;
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values ('RESTOCK', v_id, v_row.name, v_qty, 'addition', current_date, p_action_by,
            'Restock', coalesce(p_remark, 'Manual restock'));
    return jsonb_build_object('success', true, 'message', 'Restocked +' || v_qty);

  elsif p_action = 'destock' then
    v_id := p_sku->>'id';
    v_qty := (p_sku->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('success', false, 'error', 'Destock quantity must be greater than 0');
    end if;
    select * into v_row from public.skus where id = v_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'SKU not found');
    end if;
    update public.skus
       set current_stock = greatest(current_stock - v_qty, 0)
     where id = v_id;
    v_tx_id := coalesce(p_sku->>'ticket_id', 'DIRECT_DESTOCK');
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values (v_tx_id, v_id, v_row.name, v_qty, 'deduction', current_date, p_action_by,
            'Destock', coalesce(p_remark, 'Direct destock'));
    return jsonb_build_object('success', true, 'message', 'Destocked -' || v_qty);
elsif p_action = 'update' then
    update public.skus
       set name = coalesce(p_sku->>'name', name),
           category = coalesce(p_sku->>'category', category),
           unit = coalesce(p_sku->>'unit', unit),
           opening_balance = coalesce((p_sku->>'opening_balance')::numeric, opening_balance),
           current_stock = coalesce((p_sku->>'current_stock')::numeric, current_stock),
           total_inflow = coalesce((p_sku->>'total_inflow')::numeric, total_inflow),
           image_url = coalesce(p_sku->>'image_url', image_url),
           low_stock_threshold = coalesce((p_sku->>'low_stock_threshold')::numeric, low_stock_threshold),
           cost_per_unit = coalesce((p_sku->>'cost_per_unit')::numeric, cost_per_unit)
     where id = p_sku->>'id';
    if not found then
      return jsonb_build_object('success', false, 'error', 'SKU not found');
    end if;
    return jsonb_build_object('success', true, 'message', 'SKU updated');

  elsif p_action = 'delete' then
    delete from public.skus where id = p_sku->>'id';
    return jsonb_build_object('success', true, 'message', 'SKU deleted');
  end if;
  return jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action);
end;
$$;

-- ── Restrict write RPCs to authenticated sessions only (re-asserted) ─────
revoke execute on function public.create_ticket from public;
revoke execute on function public.update_ticket_status from public;
revoke execute on function public.manage_sku from public;

grant execute on function public.create_ticket to authenticated;
grant execute on function public.update_ticket_status to authenticated;
grant execute on function public.manage_sku to authenticated;