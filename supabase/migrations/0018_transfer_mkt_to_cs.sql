-- ============================================================
-- Easy Gold Merch — 0018: MKT <-> CS transfers run inside the RPC engine
-- ============================================================
-- Fixes: "I transferred 1 item from MKT to CS via Manage Stock -> Transfer
-- (Warehouse Manager), but the CS account never sees the item."
--
-- Cause: the Transfer tab (src/lib/apiMutations.ts) wrote to cs_skus /
-- cs_transactions (and, on the return trip, to skus / stock_transactions)
-- DIRECTLY from the browser with plain PostgREST inserts/updates. Every app
-- table has ROW LEVEL SECURITY enabled and only SELECT policies exist
-- (0001_schema.sql + 0006_ensure_reads.sql), so those writes were REJECTED —
-- and because supabase-js returns `{ error }` instead of throwing, the
-- unchecked awaits swallowed the RLS error. The MKT side worked only because it
-- went through the `manage_sku` RPC (security definer) — exactly the failure
-- the warehouse saw: MKT debited (-1 MKT_TRANSFER) and nothing at all in CS.
--
-- Both directions are now ONE RPC call, so a transfer is a single transaction:
-- either both warehouses move or neither does. The old code could debit MKT and
-- still leave CS empty — see the diagnostic query at the bottom of this file.
--
-- First arrival (the item is not in the CS catalog yet):
--   * the CS item is auto-created from the MKT master data (name / category /
--     unit / photo / low-stock level / cost), and
--   * its receipt is stamped `ticket_id = 'OPENING'` — that quantity IS the
--     item's opening balance, so the Dashboard shows it under Opening ONLY.
--     Stamping it with a real reference made the dashboard count the same
--     quantity twice (Opening 40 + Stock In +40 for a 40 pc item — the ticket
--     flavour of this bug is fixed in 0019).
-- Later arrivals of the same item are real movements (`MKT_TRANSFER`) = Stock In.
--
-- Item identity: the shared SKU id first, then the trimmed/lowercased name —
-- the same rule the app uses to pair MKT and CS rows

-- ------------------------------------------------------------------
-- 1. transfer_mkt_to_cs — debit MKT, credit (or create) the CS item
-- ------------------------------------------------------------------
create or replace function public.transfer_mkt_to_cs(
  p_sku_id    text,
  p_qty       numeric,
  p_action_by text default null,
  p_comment   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_mkt     record;
  v_cs      record;
  v_cs_id   text;
  v_created boolean := false;
  v_unit    text;
  v_note    text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  -- ── caller must be the warehouse team / admin (same rule as the UI tab) ──
  select u.role into v_role
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  v_role := lower(btrim(coalesce(v_role, '')));
  v_role := case
    when v_role in ('warehouse', 'warehouse manager') then 'warehouse'
    when v_role = 'customer service'                 then 'customer_service'
    else v_role end;
  if v_role not in ('warehouse', 'admin') then
    return jsonb_build_object('success', false, 'error',
      'Not authorized: ' || coalesce(nullif(v_role, ''), 'unknown') || ' cannot transfer MKT stock to CS');
  end if;

  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('success', false, 'error', 'Transfer quantity must be greater than 0');
  end if;

  -- ── lock the source row: two transfers can never overdraw the same SKU ──
  perform 1 from public.skus where id = p_sku_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'SKU not found');
  end if;
  select * into v_mkt from public.skus where id = p_sku_id;
  v_unit := coalesce(v_mkt.unit, 'pcs');
  if p_qty > coalesce(v_mkt.current_stock, 0) then
    return jsonb_build_object('success', false, 'error',
      'Only ' || coalesce(v_mkt.current_stock, 0) || ' ' || v_unit || ' in MKT stock');
  end if;

  -- ── destination: the CS catalog row for this item (id first, then name) ──
  select * into v_cs from public.cs_skus where id = p_sku_id;
  if not found then
    select * into v_cs
      from public.cs_skus c
     where lower(btrim(coalesce(c.name, ''))) = lower(btrim(coalesce(v_mkt.name, '')))
     order by c.created_at nulls last
     limit 1;
  end if;
  v_cs_id := coalesce(v_cs.id, p_sku_id);

  -- ── 1) debit MKT (ledger row identical to manage_sku 'destock') ──
  update public.skus
     set current_stock = greatest(coalesce(current_stock, 0) - p_qty, 0)
   where id = p_sku_id;
  insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                         action_by, status, comment)
  values ('MKT_TRANSFER', p_sku_id, v_mkt.name, p_qty, 'deduction', current_date,
          coalesce(p_action_by, 'MKT Warehouse'), 'Transferred to CS',
          coalesce(v_note, 'Transferred to CS warehouse'));

  -- ── 2) credit CS (auto-create the item on its first arrival) ──
  if v_cs.id is null then
    insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock,
                                total_inflow, image_url, low_stock_threshold, cost_per_unit, status)
    values (p_sku_id, v_mkt.name, coalesce(v_mkt.category, 'General'), v_unit,
            p_qty, p_qty, p_qty, v_mkt.image_url,
            coalesce(v_mkt.low_stock_threshold, 0), coalesce(v_mkt.cost_per_unit, 0), 'active');
    v_created := true;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('OPENING', p_sku_id, v_mkt.name, p_qty, 'addition', current_date,
            'MKT Warehouse',
            'Auto-transferred from MKT WH - opening balance' ||
            case when v_note is null then '' else ' - ' || v_note end);
  else
    update public.cs_skus
       set current_stock = coalesce(current_stock, 0) + p_qty,
           total_inflow  = coalesce(total_inflow, 0)  + p_qty
     where id = v_cs_id;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('MKT_TRANSFER', v_cs_id, coalesce(v_cs.name, v_mkt.name), p_qty, 'addition', current_date,
            coalesce(p_action_by, 'MKT Warehouse'),
            'Transferred from MKT warehouse' ||
            case when v_note is null then '' else ' - ' || v_note end);
  end if;

  return jsonb_build_object(
    'success', true, 'id', v_cs_id, 'created', v_created, 'qty', p_qty,
    'message', 'Transferred ' || p_qty || ' ' || v_unit || ' to CS warehouse' ||
               case when v_created then ' (new CS item created)' else '' end);
end;
$$;


-- ------------------------------------------------------------------
-- 2. transfer_cs_to_mkt — debit CS, credit (or create) the MKT item
--    (same class of bug: the old code inserted into `skus` /
--     `stock_transactions` straight from the browser and was blocked by RLS)
-- ------------------------------------------------------------------
create or replace function public.transfer_cs_to_mkt(
  p_sku_id    text,
  p_qty       numeric,
  p_action_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_cs      record;
  v_mkt     record;
  v_mkt_id  text;
  v_created boolean := false;
  v_unit    text;
begin
  select u.role into v_role
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  v_role := lower(btrim(coalesce(v_role, '')));
  v_role := case
    when v_role in ('warehouse', 'warehouse manager') then 'warehouse'
    when v_role = 'customer service'                 then 'customer_service'
    else v_role end;
  if v_role not in ('warehouse', 'admin') then
    return jsonb_build_object('success', false, 'error',
      'Not authorized: ' || coalesce(nullif(v_role, ''), 'unknown') || ' cannot transfer CS stock to MKT');
  end if;

  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('success', false, 'error', 'Transfer quantity must be greater than 0');
  end if;

  perform 1 from public.cs_skus where id = p_sku_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'CS SKU not found');
  end if;
  select * into v_cs from public.cs_skus where id = p_sku_id;
  v_unit := coalesce(v_cs.unit, 'pcs');
  if p_qty > coalesce(v_cs.current_stock, 0) then
    return jsonb_build_object('success', false, 'error',
      'Only ' || coalesce(v_cs.current_stock, 0) || ' ' || v_unit || ' in CS stock');
  end if;

  -- destination: the MKT catalog row for this item (id first, then name)
  select * into v_mkt from public.skus where id = p_sku_id;
  if not found then
    select * into v_mkt
      from public.skus s
     where lower(btrim(coalesce(s.name, ''))) = lower(btrim(coalesce(v_cs.name, '')))
     order by s.created_at nulls last
     limit 1;
  end if;
  v_mkt_id := coalesce(v_mkt.id, p_sku_id);

  -- ── 1) debit CS (CS_TRANSFER_OUT so Ticket Tracking reads a warehouse move) ──
  update public.cs_skus
     set current_stock = greatest(coalesce(current_stock, 0) - p_qty, 0)
   where id = p_sku_id;
  insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                      action_by, comment)
  values ('CS_TRANSFER_OUT', p_sku_id, v_cs.name, p_qty, 'deduction', current_date,
          coalesce(p_action_by, 'CS Warehouse'), 'Transferred back to MKT warehouse');

  -- ── 2) credit MKT (auto-create the item on its first arrival) ──
  if v_mkt.id is null then
    insert into public.skus (id, name, category, unit, opening_balance, current_stock,
                             total_inflow, image_url, low_stock_threshold, cost_per_unit, status)
    values (p_sku_id, v_cs.name, coalesce(v_cs.category, 'General'), v_unit,
            p_qty, p_qty, p_qty, v_cs.image_url,
            coalesce(v_cs.low_stock_threshold, 0), coalesce(v_cs.cost_per_unit, 0), 'active');
    v_created := true;
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values ('OPENING', p_sku_id, v_cs.name, p_qty, 'addition', current_date,
            'CS Warehouse', 'Opening', 'Auto-transferred from CS WH - opening balance');
  else
    update public.skus
       set current_stock = coalesce(current_stock, 0) + p_qty,
           total_inflow  = coalesce(total_inflow, 0)  + p_qty
     where id = v_mkt_id;
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values ('CS_TRANSFER', v_mkt_id, coalesce(v_mkt.name, v_cs.name), p_qty, 'addition', current_date,
            coalesce(p_action_by, 'CS Warehouse'), 'Returned to MKT', 'Transferred from CS warehouse');
  end if;

  return jsonb_build_object(
    'success', true, 'id', v_mkt_id, 'created', v_created, 'qty', p_qty,
    'message', 'Transferred ' || p_qty || ' ' || v_unit || ' back to MKT warehouse' ||
               case when v_created then ' (new MKT item created)' else '' end);
end;
$$;

-- ------------------------------------------------------------------
-- 3. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.transfer_mkt_to_cs(text, numeric, text, text) from public;
revoke execute on function public.transfer_cs_to_mkt(text, numeric, text) from public;

grant execute on function public.transfer_mkt_to_cs(text, numeric, text, text) to authenticated;
grant execute on function public.transfer_cs_to_mkt(text, numeric, text) to authenticated;

-- ------------------------------------------------------------------
-- 4. Diagnostic — transfers lost by the old (RLS-blocked) client code
-- ------------------------------------------------------------------
-- The MKT debit always went through the manage_sku RPC, so every historical
-- MKT -> CS transfer left a `MKT_TRANSFER` deduction even when the CS side was
-- rejected. Run this SELECT to list them, then re-do each one in
-- Manage Stock -> Transfer (the destination item is now created automatically)
-- or create the CS item via SKU Setup -> Import from MKT + Stock In.
--
-- select st.id, st.action_at::date as transferred_on, st.sku_id, st.sku_name,
--        st.qty as debited_from_mkt, st.action_by
--   from public.stock_transactions st
--  where st.ticket_id = 'MKT_TRANSFER'
--    and st.type = 'deduction'
--    and not exists (select 1 from public.cs_skus c where c.id = st.sku_id)
--  order by st.action_at desc;

-- Destination rows that were credited but never linked to a CS ledger row
-- (same root cause, when the CS item existed already):
--
-- select st.id, st.action_at::date as transferred_on, st.sku_id, st.sku_name, st.qty
--   from public.stock_transactions st
--  where st.ticket_id = 'MKT_TRANSFER'
--    and st.type = 'deduction'
--    and exists (select 1 from public.cs_skus c where c.id = st.sku_id)
--    and not exists (
--      select 1 from public.cs_transactions ct
--       where ct.sku_id = st.sku_id
--         and ct.type = 'addition'
--         and ct.ticket_id in ('MKT_TRANSFER', 'OPENING')
--    )
--  order by st.action_at desc;

-- (src/lib/warehouseMerge.ts). A CS item typed in by hand keeps its own
-- `CS-SKU-...` id and only the name matches.
--
-- Idempotent (create or replace). Run AFTER 0014 (and after 0017 for the
-- warehouse-manager routing). Paste into the Supabase SQL Editor and run.
-- ============================================================
