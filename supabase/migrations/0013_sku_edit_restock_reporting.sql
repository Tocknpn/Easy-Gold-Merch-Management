-- ============================================================
-- Easy Gold Merch - 0013_sku_edit_restock_reporting.sql
-- Part 13 (run AFTER 0012_fix_jsonb_coalesce_types.sql)
--
-- Workflow fixes requested from the live web app:
--
--   1) SKU Setup edit (Manage Stock -> SKU Setup -> Edit SKU)
--      * Name / Cost per unit are always editable (already true) and the
--        STATUS field now really persists (skus / cs_skus gained a `status`
--        column - activate/deactivate used to be a silent no-op).
--      * Opening balance is always editable and behaves like a plain EDIT,
--        never like a Stock In / Stock Out movement:
--          opening_balance = new value
--          current_stock  += (new - old)
--          total_inflow   += (new - old)
--          the OPENING ledger row is kept in sync (OPENING rows are already
--          excluded from Stock In by the reports, so Opening / Closing /
--          Usage % / Total value stay consistent).
--        No addition/deduction row is written, so the edit no longer shows
--        up as a phantom Stock In / Stock Out in Reporting.
--   2) Restock has a single channel (Manage Stock -> Stock In / Out). The
--      frontend removed the Restock button from the Dashboard SKU modal.
--   3) Reject / Recall no longer pollute Stock In / Out reporting. The
--      engine cancels the booking ('Booking Cancelled') and restores the
--      stock, but does NOT insert the old reversal `addition` row
--      ('Rejected - Booking Released' / 'Rejected - Stock Returned'),
--      which was counted as a Stock In for a ticket that never actually
--      moved stock after its original booking.
--   4) Renaming a SKU rewrites every place the old name was stored
--      (ticket_items, stock_transactions, cs_transactions, cs_skus) so all
--      reports, ticket views and ledgers show one single SKU name.
--   5) tickets gained wh_comment_at / lm_comment_at / director_comment_at
--      so the My Ticket modal can show WHEN each approval level commented.
--
-- Every statement is `create or replace` / `if not exists` -> safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. SCHEMA additions
-- ------------------------------------------------------------------
-- SKU active/inactive flag (the UI already reads/writes it)
alter table public.skus    add column if not exists status text default 'active';
alter table public.cs_skus add column if not exists status text default 'active';

-- Per-approval-level comment timestamps
alter table public.tickets add column if not exists wh_comment_at       timestamptz;
alter table public.tickets add column if not exists lm_comment_at       timestamptz;
alter table public.tickets add column if not exists director_comment_at timestamptz;

-- ------------------------------------------------------------------
-- 2. manage_sku - MKT SKU master
--    'add' | 'update' | 'delete' | 'restock' | 'destock'
--
--    'update' now:
--      * persists status
--      * treats `opening_balance` as a baseline EDIT (delta applied to
--        current_stock + total_inflow, OPENING ledger row kept in sync,
--        never a stock movement)
--      * cascades a name change to ticket_items / stock_transactions /
--        cs_transactions / cs_skus
-- ------------------------------------------------------------------
create or replace function public.manage_sku(
  p_action text,
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
  v_old_name text;
  v_new_name text;
  v_opening numeric;
  v_delta numeric := 0;
  v_has_opening boolean := false;
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', public.next_id('sku-'));
    insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
                             image_url, low_stock_threshold, cost_per_unit, status)
    values (v_id,
            p_sku->>'name',
            p_sku->>'category',
            coalesce(p_sku->>'unit', 'pcs'),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            coalesce((p_sku->>'current_stock')::numeric, coalesce((p_sku->>'opening_balance')::numeric, 0)),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            p_sku->>'image_url',
            coalesce((p_sku->>'low_stock_threshold')::numeric, 0),
            coalesce((p_sku->>'cost_per_unit')::numeric, 0),
            coalesce(nullif(p_sku->>'status', ''), 'active'));
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
    select * into v_row from public.skus where id = p_sku->>'id';
    if not found then
      return jsonb_build_object('success', false, 'error', 'SKU not found');
    end if;

    v_old_name := v_row.name;
    v_new_name := coalesce(nullif(btrim(coalesce(p_sku->>'name', '')), ''), v_row.name);

    -- opening balance = baseline EDIT (never a stock movement)
    v_has_opening := (p_sku ? 'opening_balance') and (p_sku->>'opening_balance') is not null;
    if v_has_opening then
      v_opening := greatest(coalesce((p_sku->>'opening_balance')::numeric, 0), 0);
      v_delta   := v_opening - coalesce(v_row.opening_balance, 0);
    else
      v_opening := coalesce(v_row.opening_balance, 0);
    end if;

    update public.skus
       set name = v_new_name,
           category = coalesce(nullif(p_sku->>'category', ''), category),
           unit = coalesce(nullif(p_sku->>'unit', ''), unit),
           opening_balance = v_opening,
           current_stock = greatest(coalesce(current_stock, 0) + case when v_has_opening then v_delta else 0 end, 0),
           total_inflow  = greatest(coalesce(total_inflow, 0)  + case when v_has_opening then v_delta else 0 end, 0),
           image_url = coalesce(p_sku->>'image_url', image_url),
           low_stock_threshold = coalesce((p_sku->>'low_stock_threshold')::numeric, low_stock_threshold),
           cost_per_unit = coalesce((p_sku->>'cost_per_unit')::numeric, cost_per_unit),
           status = coalesce(nullif(p_sku->>'status', ''), coalesce(status, 'active'))
     where id = v_row.id;

    -- keep the OPENING ledger row aligned with the new baseline
    if v_has_opening then
      if v_opening > 0 then
        update public.stock_transactions
           set qty = v_opening,
               sku_name = v_new_name,
               status = coalesce(status, 'Opening'),
               comment = 'Opening balance (updated via SKU Setup)'
         where ticket_id = 'OPENING' and sku_id = v_row.id;
        if not found then
          insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                                 action_by, status, comment)
          values ('OPENING', v_row.id, v_new_name, v_opening, 'addition',
                  coalesce(v_row.created_at::date, current_date), p_action_by, 'Opening',
                  'Opening balance (updated via SKU Setup)');
        end if;
      else
        delete from public.stock_transactions
         where ticket_id = 'OPENING' and sku_id = v_row.id;
      end if;
    end if;

    -- rename cascade: one SKU name everywhere
    if v_new_name is distinct from v_old_name then
      update public.ticket_items       set sku_name = v_new_name where sku_id = v_row.id;
      update public.stock_transactions set sku_name = v_new_name where sku_id = v_row.id;
      update public.cs_transactions    set sku_name = v_new_name where sku_id = v_row.id;
      update public.cs_skus            set name     = v_new_name where id      = v_row.id;
    end if;

    return jsonb_build_object('success', true, 'message', 'SKU updated',
                              'opening_delta', v_delta);

  elsif p_action = 'delete' then
    delete from public.skus where id = p_sku->>'id';
    return jsonb_build_object('success', true, 'message', 'SKU deleted');
  end if;
  return jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action);
end;
$$;

-- ------------------------------------------------------------------
-- 3. manage_cs_sku - CS (Customer Service) warehouse SKU master
--    'add' | 'update' | 'delete' | 'restock' | 'destock'
--
--    Same rules as manage_sku: status persists, opening_balance is a
--    baseline EDIT over the CS ledger (cs_transactions OPENING row kept in
--    sync), and a rename cascades to cs_skus / cs_transactions - plus to
--    the MKT side (skus, ticket_items, stock_transactions) when the same
--    SKU id exists in both warehouses, so one item keeps one name.
-- ------------------------------------------------------------------
create or replace function public.manage_cs_sku(
  p_action text,
  p_sku jsonb,
  p_comment text default null,
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
  v_old_name text;
  v_new_name text;
  v_opening numeric;
  v_delta numeric := 0;
  v_has_opening boolean := false;
  v_mkt record;
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', 'CS-SKU-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text);
    insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
                                image_url, low_stock_threshold, cost_per_unit, status)
    values (v_id,
            p_sku->>'name',
            p_sku->>'category',
            coalesce(p_sku->>'unit', 'pcs'),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            coalesce((p_sku->>'current_stock')::numeric, coalesce((p_sku->>'opening_balance')::numeric, 0)),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            p_sku->>'image_url',
            coalesce((p_sku->>'low_stock_threshold')::numeric, 0),
            coalesce((p_sku->>'cost_per_unit')::numeric, 0),
            coalesce(nullif(p_sku->>'status', ''), 'active'));
    if coalesce((p_sku->>'opening_balance')::numeric, 0) > 0 then
      insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                          action_by, comment)
      values ('OPENING', v_id, p_sku->>'name', (p_sku->>'opening_balance')::numeric, 'addition',
              current_date, p_action_by, 'Opening balance on SKU creation');
    end if;
    return jsonb_build_object('success', true, 'id', v_id, 'message', 'CS SKU added');

  elsif p_action = 'restock' then
    v_id := p_sku->>'id';
    v_qty := (p_sku->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('success', false, 'error', 'Restock quantity must be greater than 0');
    end if;
    select * into v_row from public.cs_skus where id = v_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'CS SKU not found');
    end if;
    update public.cs_skus
       set current_stock = current_stock + v_qty,
           total_inflow  = total_inflow  + v_qty
     where id = v_id;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('RESTOCK', v_id, v_row.name, v_qty, 'addition', current_date, p_action_by,
            coalesce(p_comment, 'Manual restock'));
    return jsonb_build_object('success', true, 'message', 'CS restocked +' || v_qty);

  elsif p_action = 'destock' then
    v_id := p_sku->>'id';
    v_qty := (p_sku->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('success', false, 'error', 'Destock quantity must be greater than 0');
    end if;
    select * into v_row from public.cs_skus where id = v_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'CS SKU not found');
    end if;
    update public.cs_skus
       set current_stock = greatest(current_stock - v_qty, 0)
     where id = v_id;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('DIRECT_DESTOCK', v_id, v_row.name, v_qty, 'deduction', current_date, p_action_by,
            coalesce(p_comment, 'Direct destock'));
    return jsonb_build_object('success', true, 'message', 'CS destocked -' || v_qty);

  elsif p_action = 'update' then
    select * into v_row from public.cs_skus where id = p_sku->>'id';
    if not found then
      return jsonb_build_object('success', false, 'error', 'CS SKU not found');
    end if;

    v_old_name := v_row.name;
    v_new_name := coalesce(nullif(btrim(coalesce(p_sku->>'name', '')), ''), v_row.name);

    v_has_opening := (p_sku ? 'opening_balance') and (p_sku->>'opening_balance') is not null;
    if v_has_opening then
      v_opening := greatest(coalesce((p_sku->>'opening_balance')::numeric, 0), 0);
      v_delta   := v_opening - coalesce(v_row.opening_balance, 0);
    else
      v_opening := coalesce(v_row.opening_balance, 0);
    end if;

    update public.cs_skus
       set name = v_new_name,
           category = coalesce(nullif(p_sku->>'category', ''), category),
           unit = coalesce(nullif(p_sku->>'unit', ''), unit),
           opening_balance = v_opening,
           current_stock = greatest(coalesce(current_stock, 0) + case when v_has_opening then v_delta else 0 end, 0),
           total_inflow  = greatest(coalesce(total_inflow, 0)  + case when v_has_opening then v_delta else 0 end, 0),
           image_url = coalesce(p_sku->>'image_url', image_url),
           low_stock_threshold = coalesce((p_sku->>'low_stock_threshold')::numeric, low_stock_threshold),
           cost_per_unit = coalesce((p_sku->>'cost_per_unit')::numeric, cost_per_unit),
           status = coalesce(nullif(p_sku->>'status', ''), coalesce(status, 'active'))
     where id = v_row.id;

    -- keep the CS OPENING ledger row aligned with the new baseline
    if v_has_opening then
      if v_opening > 0 then
        update public.cs_transactions
           set qty = v_opening,
               sku_name = v_new_name,
               comment = 'Opening balance (updated via SKU Setup)'
         where ticket_id = 'OPENING' and sku_id = v_row.id;
        if not found then
          insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                              action_by, comment)
          values ('OPENING', v_row.id, v_new_name, v_opening, 'addition',
                  coalesce(v_row.created_at::date, current_date), p_action_by,
                  'Opening balance (updated via SKU Setup)');
        end if;
      else
        delete from public.cs_transactions
         where ticket_id = 'OPENING' and sku_id = v_row.id;
      end if;
    end if;

    -- rename cascade (CS ledger, plus the MKT side when the id is shared)
    if v_new_name is distinct from v_old_name then
      update public.cs_transactions set sku_name = v_new_name where sku_id = v_row.id;
      select * into v_mkt from public.skus where id = v_row.id;
      if found then
        update public.skus               set name     = v_new_name where id     = v_row.id;
        update public.ticket_items       set sku_name = v_new_name where sku_id = v_row.id;
        update public.stock_transactions set sku_name = v_new_name where sku_id = v_row.id;
      end if;
    end if;

    return jsonb_build_object('success', true, 'message', 'CS SKU updated',
                              'opening_delta', v_delta);

  elsif p_action = 'delete' then
    delete from public.cs_skus where id = p_sku->>'id';
    return jsonb_build_object('success', true, 'message', 'CS SKU deleted');
  end if;
  return jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action);
end;
$$;

-- ------------------------------------------------------------------
-- 4. update_ticket_status - booking-aware FLAT state machine
--    (same as 0012, plus:)
--      * REJECT / RECALL cancels the booking and restores the stock but
--        NO LONGER writes a reversal `addition` row. That phantom row was
--        counted as Stock In for a ticket that never moved stock, which
--        made the Stock In / Stock Out reports look wrong.
--        The cancelled booking keeps the audit trail (status
--        'Booking Cancelled' + comment) and is ignored by the reports.
--      * wh_comment_at / lm_comment_at / director_comment_at are stamped
--        whenever that level writes its comment.
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
  v_status_label text;
  v_allowed boolean := false;
  v_role_ok boolean := false;
  v_book_id bigint;
  v_booked numeric;
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
  if p_status = 'reviewed' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_requested, ti.qty_approved, ti.unit
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_qty := coalesce((select (e->>'qty_approved')::numeric
                          from jsonb_array_elements(v_items) e
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
-- 5. OPTIONAL one-time tidy-up of LEGACY reject/recall rows
--
--    Older runs of this engine wrote a reversal `addition` row
--    ('Rejected - Booking Released' / 'Rejected - Stock Returned') on top
--    of cancelling the booking. The frontend now ignores those rows for
--    Stock In / Stock Out reporting, so nothing breaks if you leave them
--    (they stay visible in Ticket Tracking -> Stock Movements).
--
--    Run the block below ONLY if you want the ledger physically clean:
--    it drops those informational reversal rows. `current_stock` is not
--    touched, because the old engine had already restored it.
-- ------------------------------------------------------------------
-- delete from public.stock_transactions
--  where type = 'addition'
--    and (status like 'Rejected -%' or status like 'Recalled -%');

-- ------------------------------------------------------------------
-- 6. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.create_ticket from public;
revoke execute on function public.update_ticket_status from public;
revoke execute on function public.manage_sku from public;
revoke execute on function public.manage_cs_sku from public;

grant execute on function public.create_ticket to authenticated;
grant execute on function public.update_ticket_status to authenticated;
grant execute on function public.manage_sku to authenticated;
grant execute on function public.manage_cs_sku to authenticated;
