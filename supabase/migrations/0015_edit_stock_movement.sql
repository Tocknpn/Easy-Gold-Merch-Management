-- ============================================================
-- Easy Gold Merch - 0015_edit_stock_movement.sql
-- Part 15 (run AFTER 0014_approved_qty_propagation.sql)
--
-- Editable Stock Movements (Ticket Tracking → Stock Movements)
--
-- Problem: a wrong refill / wrong issue amount could only be balanced with a
-- compensating Stock In / Stock Out row, which pollutes Stock In / Stock Out
-- reporting and makes the finance numbers inaccurate.
--
-- Fix: privileged users can EDIT a wrong ledger row at the source (by item +
-- transaction). The edit re-syncs the SKU baseline (current_stock, and
-- total_inflow for additions) by the same delta, so the backend numbers and
-- every report show the right values immediately. Every edit is stamped with
-- the editor's real name (resolved from the JWT), role, timestamp and reason.
--
-- Who may edit what:
--   admin            → MKT + CS rows
--   warehouse        → MKT rows
--   customer_service → CS rows
--
-- Guardrails:
--   * OPENING rows are NOT editable here — the opening baseline is managed by
--     Manage Stock → SKU Setup (migration 0013 keeps ledger + baseline in sync).
--   * Cancelled bookings ('Booking Cancelled' / 'Cancelled' / 'Reversed') are
--     audit-only and cannot be edited.
--   * `type` (addition/deduction) and `status` are never editable — fixing a
--     wrong direction goes through Manage Stock → Stock In / Out.
--   * The reason is mandatory.
--
-- Every statement is `create or replace` / `if not exists` -> safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. SCHEMA additions — who corrected the row, and when
-- ------------------------------------------------------------------
alter table public.stock_transactions add column if not exists edited_by text;
alter table public.stock_transactions add column if not exists edited_at timestamptz;
alter table public.cs_transactions   add column if not exists edited_by text;
alter table public.cs_transactions   add column if not exists edited_at timestamptz;
-- ------------------------------------------------------------------
-- 2. edit_stock_movement(p_warehouse, p_tx_id, p_patch, p_reason)
--
--    p_warehouse: 'mkt' | 'cs'
--    p_tx_id:     stock_transactions.id / cs_transactions.id
--    p_patch:     { qty?, qty_broken?, date?, action_by? }
--                   * qty         — the corrected amount (stock re-synced)
--                   * qty_broken  — informational loss qty (MKT only)
--                   * date        — movement date (report period attribution)
--                   * action_by   — the "By" name on the row
--    p_reason:    WHY the row is corrected (mandatory, goes into the stamp)
--
--    The caller is resolved from the JWT (never trusted from the payload).
-- ------------------------------------------------------------------
create or replace function public.edit_stock_movement(
  p_warehouse text,
  p_tx_id     bigint,
  p_patch     jsonb,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_caller_name text;
  v_wh          text;
  v_tx          record;
  v_old_qty     numeric;
  v_new_qty     numeric;
  v_delta       numeric;
  v_new_broken  numeric;
  v_new_date    date;
  v_new_by      text;
  v_stamp       text;
  v_base_cmt    text;
  v_stock_after numeric;
begin
  -- ── resolve the REAL caller from the JWT (same pattern as 0013) ──
  select u.role, coalesce(nullif(btrim(coalesce(u.full_name, '')), ''), u.email)
    into v_caller_role, v_caller_name
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  if v_caller_role is null or v_caller_role = '' then
    return jsonb_build_object('success', false,
      'error', 'Account not found for this sign-in session — please sign in again');
  end if;

  -- ── normalize the caller role (mirror of the frontend roleFromRaw) ──
  v_caller_role := lower(btrim(v_caller_role));
  v_caller_role := case
    when v_caller_role in ('warehouse', 'warehouse manager') then 'warehouse'
    when v_caller_role in ('customer_service', 'customer service') then 'customer_service'
    when v_caller_role in ('line_manager', 'line manager') then 'line_manager'
    else v_caller_role
  end;

  v_wh := lower(coalesce(nullif(btrim(coalesce(p_warehouse, '')), ''), ''));
  if v_wh not in ('mkt', 'cs') then
    return jsonb_build_object('success', false, 'error', 'Unknown warehouse: ' || coalesce(p_warehouse, ''));
  end if;

  -- ── authorization: admin = both, warehouse = MKT, customer_service = CS ──
  if not (
    v_caller_role = 'admin'
    or (v_caller_role = 'warehouse' and v_wh = 'mkt')
    or (v_caller_role = 'customer_service' and v_wh = 'cs')
  ) then
    return jsonb_build_object('success', false,
      'error', 'Not authorized: ' || v_caller_role || ' cannot edit ' || upper(v_wh) || ' stock movements');
  end if;

  if coalesce(nullif(btrim(coalesce(p_reason, '')), ''), '') = '' then
    return jsonb_build_object('success', false, 'error', 'An edit reason is required');
  end if;

  -- ── load the ledger row ──
  if v_wh = 'mkt' then
    select * into v_tx from public.stock_transactions where id = p_tx_id;
  else
    select * into v_tx from public.cs_transactions where id = p_tx_id;
  end if;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Stock movement row not found');
  end if;

  -- ── guardrails ──
  if coalesce(v_tx.ticket_id, '') = 'OPENING' then
    return jsonb_build_object('success', false,
      'error', 'Opening rows follow the SKU opening balance — edit it in Manage Stock → SKU Setup');
  end if;
  if lower(coalesce(v_tx.status, '')) in ('booking cancelled', 'cancelled', 'reversed') then
    return jsonb_build_object('success', false,
      'error', 'Cancelled bookings are audit-only and cannot be edited');
  end if;


  -- ── normalize the patch ──
  v_old_qty := coalesce(v_tx.qty, 0);
  if p_patch ? 'qty' then
    v_new_qty := coalesce((p_patch->>'qty')::numeric, -1);
    if v_new_qty < 0 then
      return jsonb_build_object('success', false, 'error', 'Quantity must be 0 or greater');
    end if;
  else
    v_new_qty := v_old_qty;
  end if;

  if p_patch ? 'qty_broken' and v_wh = 'mkt' then
    v_new_broken := greatest(coalesce((p_patch->>'qty_broken')::numeric, 0), 0);
  end if;

  if p_patch ? 'date' then
    if coalesce(nullif(btrim(coalesce(p_patch->>'date', '')), ''), '') <> '' then
      if p_patch->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('success', false, 'error', 'Date must be in YYYY-MM-DD format');
      end if;
      v_new_date := (p_patch->>'date')::date;
    end if;
  end if;

  if p_patch ? 'action_by' then
    v_new_by := nullif(btrim(coalesce(p_patch->>'action_by', '')), '');
  end if;

  -- ── re-sync the SKU baseline by the delta (the core fix) ──
  --   addition row:  current_stock += delta, total_inflow += delta
  --   deduction row: current_stock -= delta
  -- clamped at 0 exactly like manage_sku restock/destock (0013).
  v_delta := v_new_qty - v_old_qty;
  if v_delta <> 0 and coalesce(v_tx.sku_id, '') <> '' then
    if v_wh = 'mkt' then
      if v_tx.type = 'addition' then
        update public.skus set
          current_stock = greatest(current_stock + v_delta, 0),
          total_inflow  = greatest(total_inflow  + v_delta, 0)
         where id = v_tx.sku_id;
      else
        update public.skus set
          current_stock = greatest(current_stock - v_delta, 0)
         where id = v_tx.sku_id;
      end if;
      select current_stock into v_stock_after from public.skus where id = v_tx.sku_id;
    else
      if v_tx.type = 'addition' then
        update public.cs_skus set
          current_stock = greatest(current_stock + v_delta, 0),
          total_inflow  = greatest(total_inflow  + v_delta, 0)
         where id = v_tx.sku_id;
      else
        update public.cs_skus set
          current_stock = greatest(current_stock - v_delta, 0)
         where id = v_tx.sku_id;
      end if;
      select current_stock into v_stock_after from public.cs_skus where id = v_tx.sku_id;
    end if;
  end if;

  -- ── audit stamp: who, when, why (and the qty move when it changed) ──
  v_stamp := 'Edited by ' || coalesce(v_caller_name, 'unknown') || ' (' || v_caller_role
           || ') on ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
           || ' — ' || btrim(coalesce(p_reason, ''));
  if v_delta <> 0 then
    v_stamp := v_stamp || ' · qty ' || v_old_qty || ' → ' || v_new_qty;
  end if;
  v_base_cmt := coalesce(nullif(btrim(coalesce(v_tx.comment, '')), ''), '');
  v_stamp := case when v_base_cmt = '' then v_stamp else v_base_cmt || ' | ' || v_stamp end;

  -- ── apply the edit (type / status never change) ──
  if v_wh = 'mkt' then
    update public.stock_transactions set
      qty        = v_new_qty,
      qty_broken = coalesce(v_new_broken, coalesce(qty_broken, 0)),
      date       = coalesce(v_new_date, date),
      action_by  = coalesce(v_new_by, action_by),
      comment    = v_stamp,
      edited_by  = v_caller_name,
      edited_at  = now()
     where id = p_tx_id;
  else
    update public.cs_transactions set
      qty        = v_new_qty,
      date       = coalesce(v_new_date, date),
      action_by  = coalesce(v_new_by, action_by),
      comment    = v_stamp,
      edited_by  = v_caller_name,
      edited_at  = now()
     where id = p_tx_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Movement updated' || (case when v_delta <> 0 then ' — stock adjusted ' || v_delta end),
    'qty', v_new_qty,
    'delta', v_delta,
    'stock_after', v_stock_after
  );
end;
$$;

-- ------------------------------------------------------------------
-- 3. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.edit_stock_movement from public;
grant execute on function public.edit_stock_movement to authenticated;

