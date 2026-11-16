-- ============================================================
-- Easy Gold Merch — 0025: SKU create date + Stock In / Out movement date
-- ============================================================
-- The Add SKU modal now sends an optional `created_at` ('YYYY-MM-DD') in
-- p_sku. On 'add' only, manage_sku / manage_cs_sku:
--   * reject a date after today (Asia/Vientiane);
--   * store skus.created_at / cs_skus.created_at = that date + the current
--     Vientiane clock time (keeps same-day creation order);
--   * date the OPENING ledger row on that date, so Month End shows the item
--     (and its opening balance) from the chosen month.
-- No `created_at` key → exactly the old behaviour (today / current_date), so
-- the frontend can ship before or after this migration.
-- Backdating DOES change already-reported months — there is no month lock.
--
-- Stock In / Out (Manage Stock tab) also sends an optional `date`
-- ('YYYY-MM-DD') with 'restock' / 'destock':
--   * no future date, and never before the item existed (the earlier of its
--     created_at and its first ledger row — same rule as the reports'
--     skuBirthDate);
--   * the ledger row is dated on that day (the audit log keeps the real
--     entry time);
--   * a dated 'destock' is STRICT: refused if it would push the balance below
--     zero at the end of ANY day from that date to today (balance at day d =
--     current_stock − Σ counted rows dated after d, the Month End roll-back).
--   No `date` key → old behaviour (current_date, no extra checks).
--
-- Body = 0013 versions; only 'add', 'restock' and 'destock' changed.
-- Idempotent. Run AFTER 0024. Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- Helper: parse + validate the requested create date.
--   returns null when absent; raises on a malformed or future date.
-- ------------------------------------------------------------------
create or replace function public.sku_created_at_from(p_sku jsonb)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw   text := btrim(coalesce(p_sku->>'created_at', ''));
  v_day   date;
  v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if v_raw = '' then
    return null;
  end if;
  if v_raw !~ '^\d{4}-\d{2}-\d{2}' then
    raise exception 'Create date must be YYYY-MM-DD (got "%")', v_raw;
  end if;
  v_day := substr(v_raw, 1, 10)::date;
  if v_day > v_today then
    raise exception 'Create date cannot be in the future (% > %)', v_day, v_today;
  end if;
  -- chosen day + current Vientiane wall-clock time, back to an instant
  return (v_day + (now() at time zone 'Asia/Vientiane')::time) at time zone 'Asia/Vientiane';
end;
$$;
revoke execute on function public.sku_created_at_from(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Helper: first day an item existed (warehouse ledger + master date).
-- ------------------------------------------------------------------
create or replace function public.sku_birth_day(p_cs boolean, p_sku_id text, p_created timestamptz)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_first date;
  v_created date := (p_created at time zone 'Asia/Vientiane')::date;
begin
  if p_cs then
    select min(t.date) into v_first from public.cs_transactions t where t.sku_id = p_sku_id;
  else
    select min(t.date) into v_first from public.stock_transactions t where t.sku_id = p_sku_id;
  end if;
  -- least() ignores nulls; both null → null (= no lower limit)
  return least(v_created, v_first);
end;
$$;
revoke execute on function public.sku_birth_day(boolean, text, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Helper: parse + validate a Stock In / Out movement date.
--   absent → current_date (old behaviour); raises on malformed / future /
--   before the item existed.
-- ------------------------------------------------------------------
create or replace function public.sku_move_date(p_sku jsonb, p_birth date)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw   text := btrim(coalesce(p_sku->>'date', ''));
  v_day   date;
  v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if v_raw = '' then
    return current_date;
  end if;
  if v_raw !~ '^\d{4}-\d{2}-\d{2}' then
    raise exception 'Date must be YYYY-MM-DD (got "%")', v_raw;
  end if;
  v_day := substr(v_raw, 1, 10)::date;
  if v_day > v_today then
    raise exception 'Date cannot be in the future (% > %)', v_day, v_today;
  end if;
  if p_birth is not null and v_day < p_birth then
    raise exception 'Date is before this item was created (%)', p_birth;
  end if;
  return v_day;
end;
$$;
revoke execute on function public.sku_move_date(jsonb, date) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Helper: lowest end-of-day balance from p_from to today, rolled back from
-- current_stock over COUNTED ledger rows (cancelled bookings and rows of
-- rejected / recalled tickets excluded — same as reportableTransactions).
-- ------------------------------------------------------------------
create or replace function public.sku_min_balance_from(p_cs boolean, p_sku_id text, p_cur numeric, p_from date)
returns table (min_bal numeric, at_day date)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_cs then
    return query
    with mv as (
      select t.date as d, case when t.type = 'addition' then t.qty else -t.qty end as q
        from public.cs_transactions t
       where t.sku_id = p_sku_id and t.date is not null
         and lower(coalesce(t.status, '')) not in ('booking cancelled', 'cancelled', 'reversed')
         and not exists (select 1 from public.tickets k
                          where k.id = t.ticket_id and k.status in ('rejected', 'recalled'))
    ), days as (
      select p_from as d union select mv.d from mv where mv.d > p_from
    )
    select (coalesce(p_cur, 0) - coalesce((select sum(mv.q) from mv where mv.d > days.d), 0))::numeric, days.d
      from days order by 1, 2 limit 1;
  else
    return query
    with mv as (
      select t.date as d, case when t.type = 'addition' then t.qty else -t.qty end as q
        from public.stock_transactions t
       where t.sku_id = p_sku_id and t.date is not null
         and lower(coalesce(t.status, '')) not in ('booking cancelled', 'cancelled', 'reversed')
         and not exists (select 1 from public.tickets k
                          where k.id = t.ticket_id and k.status in ('rejected', 'recalled'))
    ), days as (
      select p_from as d union select mv.d from mv where mv.d > p_from
    )
    select (coalesce(p_cur, 0) - coalesce((select sum(mv.q) from mv where mv.d > days.d), 0))::numeric, days.d
      from days order by 1, 2 limit 1;
  end if;
end;
$$;
revoke execute on function public.sku_min_balance_from(boolean, text, numeric, date) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2. manage_sku - MKT SKU master (0013 body; 'add' honours created_at,
--    'restock' / 'destock' honour date)
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
  v_created timestamptz;
  v_date date;
  v_min numeric;
  v_min_at date;
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', public.next_id('sku-'));
    v_created := public.sku_created_at_from(p_sku);
    insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
                             image_url, low_stock_threshold, cost_per_unit, status, created_at)
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
            coalesce(nullif(p_sku->>'status', ''), 'active'),
            coalesce(v_created, now()));
    if coalesce((p_sku->>'opening_balance')::numeric, 0) > 0 then
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values ('OPENING', v_id, p_sku->>'name', (p_sku->>'opening_balance')::numeric, 'addition',
              coalesce((v_created at time zone 'Asia/Vientiane')::date, current_date),
              p_action_by, 'Opening', 'Opening balance on SKU creation');
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
    v_date := public.sku_move_date(p_sku, public.sku_birth_day(false, v_id, v_row.created_at));
    update public.skus
       set current_stock = current_stock + v_qty,
           total_inflow  = total_inflow  + v_qty
     where id = v_id;
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values ('RESTOCK', v_id, v_row.name, v_qty, 'addition', v_date, p_action_by,
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
    v_date := public.sku_move_date(p_sku, public.sku_birth_day(false, v_id, v_row.created_at));
    if p_sku ? 'date' then
      select b.min_bal, b.at_day into v_min, v_min_at
        from public.sku_min_balance_from(false, v_id, v_row.current_stock, v_date) b;
      if coalesce(v_min, 0) < v_qty then
        return jsonb_build_object('success', false, 'error',
          'Not enough stock on ' || v_min_at || ': only ' || public.nice_num(coalesce(v_min, 0))
          || ' left that day — a Stock Out of ' || public.nice_num(v_qty) || ' dated ' || v_date
          || ' would make it negative');
      end if;
    end if;
    update public.skus
       set current_stock = greatest(current_stock - v_qty, 0)
     where id = v_id;
    v_tx_id := coalesce(p_sku->>'ticket_id', 'DIRECT_DESTOCK');
    insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                           action_by, status, comment)
    values (v_tx_id, v_id, v_row.name, v_qty, 'deduction', v_date, p_action_by,
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
-- 3. manage_cs_sku - CS warehouse SKU master (0013 body; 'add' honours created_at,
--    'restock' / 'destock' honour date)
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
  v_created timestamptz;
  v_date date;
  v_min numeric;
  v_min_at date;
begin
  if p_action = 'add' then
    v_id := coalesce(p_sku->>'id', 'CS-SKU-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text);
    v_created := public.sku_created_at_from(p_sku);
    insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow,
                                image_url, low_stock_threshold, cost_per_unit, status, created_at)
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
            coalesce(nullif(p_sku->>'status', ''), 'active'),
            coalesce(v_created, now()));
    if coalesce((p_sku->>'opening_balance')::numeric, 0) > 0 then
      insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                          action_by, comment)
      values ('OPENING', v_id, p_sku->>'name', (p_sku->>'opening_balance')::numeric, 'addition',
              coalesce((v_created at time zone 'Asia/Vientiane')::date, current_date),
              p_action_by, 'Opening balance on SKU creation');
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
    v_date := public.sku_move_date(p_sku, public.sku_birth_day(true, v_id, v_row.created_at));
    update public.cs_skus
       set current_stock = current_stock + v_qty,
           total_inflow  = total_inflow  + v_qty
     where id = v_id;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('RESTOCK', v_id, v_row.name, v_qty, 'addition', v_date, p_action_by,
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
    v_date := public.sku_move_date(p_sku, public.sku_birth_day(true, v_id, v_row.created_at));
    if p_sku ? 'date' then
      select b.min_bal, b.at_day into v_min, v_min_at
        from public.sku_min_balance_from(true, v_id, v_row.current_stock, v_date) b;
      if coalesce(v_min, 0) < v_qty then
        return jsonb_build_object('success', false, 'error',
          'Not enough stock on ' || v_min_at || ': only ' || public.nice_num(coalesce(v_min, 0))
          || ' left that day — a Stock Out of ' || public.nice_num(v_qty) || ' dated ' || v_date
          || ' would make it negative');
      end if;
    end if;
    update public.cs_skus
       set current_stock = greatest(current_stock - v_qty, 0)
     where id = v_id;
    insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                        action_by, comment)
    values ('DIRECT_DESTOCK', v_id, v_row.name, v_qty, 'deduction', v_date, p_action_by,
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

grant execute on function public.manage_sku to authenticated;
grant execute on function public.manage_cs_sku to authenticated;
