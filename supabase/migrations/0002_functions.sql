-- ============================================================
-- Easy Gold Merch — Business Engine (RPC functions)
-- Part 2A: SKU master, config, categories, remarks
-- Run AFTER 0001_schema.sql
-- ============================================================

-- ------------------------------------------------------------------
-- MKT SKU management
-- pending -> reviewed books stock; rejected/recalled returns it.
-- ------------------------------------------------------------------
create or replace function public.manage_sku(
  p_action text,        -- 'add' | 'update' | 'delete' | 'restock'
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
            -- current_stock defaults to opening balance when not provided
            coalesce((p_sku->>'current_stock')::numeric, coalesce((p_sku->>'opening_balance')::numeric, 0)),
            coalesce((p_sku->>'opening_balance')::numeric, 0),
            p_sku->>'image_url',
            coalesce((p_sku->>'low_stock_threshold')::numeric, 0),
            coalesce((p_sku->>'cost_per_unit')::numeric, 0));
    -- record opening balance as a real transaction (mirrors legacy addSku)
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
-- ------------------------------------------------------------------
-- CS (Customer Service) SKU management
-- ------------------------------------------------------------------
create or replace function public.manage_cs_sku(
  p_action text,        -- 'add' | 'update' | 'delete' | 'restock' | 'destock'
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
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', 'CS-SKU-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text);
    insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
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
    update public.cs_skus
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
    return jsonb_build_object('success', true, 'message', 'CS SKU updated');

  elsif p_action = 'delete' then
    delete from public.cs_skus where id = p_sku->>'id';
    return jsonb_build_object('success', true, 'message', 'CS SKU deleted');
  end if;
  return jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action);
end;
$$;
-- ------------------------------------------------------------------
-- Config / categories / remarks / settings log
-- ------------------------------------------------------------------
create or replace function public.manage_config(p_key text, p_value text, p_desc text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_config (key, value, description)
  values (p_key, p_value, p_desc)
  on conflict (key) do update set value = excluded.value, description = excluded.description;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.manage_category(p_action text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'add' then
    insert into public.categories (name) values (p_name) on conflict (name) do nothing;
  elsif p_action = 'delete' then
    delete from public.categories where name = p_name;
  end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.add_remark(p_sku_id text, p_remark text, p_user_name text, p_user_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sku_remarks (sku_id, remark, user_name, user_role)
  values (p_sku_id, p_remark, p_user_name, p_user_role);
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.log_setting_change(p_action text, p_done_by text, p_role text, p_details text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings_log (action, done_by, role, details)
  values (p_action, p_done_by, p_role, p_details);
  return jsonb_build_object('success', true);
end;
$$;