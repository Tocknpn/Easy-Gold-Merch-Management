-- ============================================================
-- Easy Gold Merch — 0028: Admin full ticket edit + reported-month override
-- ============================================================
-- Business decision (Admin, 2026-11-23): an Admin must be able to correct ANY
-- ticket in ANY month — even one already reported to Finance — and every
-- change must be recorded.
--
--   1. Admin (web) and the Supabase dashboard (Table Editor / SQL Editor) are
--      no longer stopped by the reported-month lock of 0027. Every other role
--      still is (Warehouse / CS Stock In / Out into an old month → refused).
--   2. New RPC admin_edit_ticket — Admin only, required remark. Can change:
--        created date, delivery date, delivered-on (actual delivery date),
--        return date, remark, department, requester, type, status, items
--      on a ticket of ANY status. Stock always follows:
--        * delivery date (or created date when no delivery date) moves ALL the
--          ticket's MKT + CS movements to the new date (borrow 'Returned' rows
--          keep their real day),
--        * status → rejected / recalled cancels the movements, stock returns;
--          back from rejected / recalled books it again,
--          pending/reviewed/approved ↔ finalized fixes Booked ↔ Deducted,
--          finalized → returned (borrow) returns everything today,
--        * type ↔ cs_transfer adds / removes the CS warehouse receipt,
--        * items: quantity / add / remove, as in 0024.
--      Warnings (month already reported to Finance changes, a day's balance
--      goes negative) → the RPC answers needs_confirm and saves NOTHING; the
--      Admin confirms and it saves. Stock below zero TODAY is always refused.
--   3. Supabase dashboard: always unlocked, always logged (actor
--      "Supabase dashboard"). Editing a ticket's delivery_date / created_at
--      there moves its stock rows too; inserting / deleting / changing qty of a
--      ledger row there also corrects current_stock.
--   4. Audit: every change is in Admin → Audit Trail (flags:
--      reported_month_changed / negative_balance_override) and on the
--      ticket's Edit history + Approval Trail.
--
-- Maintenance tip: a hand-written SQL script that ALREADY updates
-- current_stock itself (e.g. re-running seed.sql) should start with
--     set app.skip_stock_sync = 'on';
-- so the dashboard stock sync does not count its ledger rows twice.
--
-- Idempotent. Run AFTER 0027. Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Schema
-- ------------------------------------------------------------------
alter table public.audit_log    add column if not exists flags text[] not null default '{}';
alter table public.ticket_edits add column if not exists field_changes jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------------
-- 2. Who is writing?
--    'dashboard' = no signed-in user AND not an API request (Table Editor,
--                  SQL Editor — session user is postgres, never PostgREST's
--                  'authenticator', so anon / service-role API calls are not
--                  mistaken for it)
--    'admin'     = signed-in app user whose role is admin
--    'user'      = anyone else
-- ------------------------------------------------------------------
create or replace function public.ledger_write_context()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null and coalesce(auth.email(), '') = '' then
    return case when session_user = 'authenticator' then 'user' else 'dashboard' end;
  end if;
  select lower(btrim(coalesce(u.role, ''))) into v_role
    from public.users u
   where u.id = auth.uid() or lower(u.email) = lower(auth.email())
   order by (u.id = auth.uid()) desc
   limit 1;
  return case when v_role = 'admin' then 'admin' else 'user' end;
end;
$$;
revoke execute on function public.ledger_write_context() from public, anon, authenticated;

-- The 0027 guards return early when this is true → Admin + dashboard bypass
-- the reported-month lock; every other role keeps it.
create or replace function public.ledger_unlocked()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.ledger_unlock', true), '') = 'on'
      or public.ledger_write_context() in ('admin', 'dashboard');
$$;

-- ------------------------------------------------------------------
-- 3. Dashboard stock sync — a ledger row inserted / deleted / changed in the
--    Supabase dashboard also corrects the item's current_stock (the app's
--    RPCs do that themselves, so this runs for dashboard writes only).
--    Cancelled rows ('Booking Cancelled' / 'Cancelled' / 'Reversed') count 0.
-- ------------------------------------------------------------------
create or replace function public.ledger_row_effect(p_type text, p_qty numeric, p_status text)
returns numeric
language sql
immutable
as $$
  select case
    when lower(coalesce(p_status, '')) in ('booking cancelled', 'cancelled', 'reversed') then 0
    when p_type = 'addition' then coalesce(p_qty, 0)
    else -coalesce(p_qty, 0)
  end;
$$;

create or replace function public.dashboard_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric := 0;
  v_new numeric := 0;
  v_cs  boolean := tg_table_name = 'cs_transactions';
begin
  if pg_trigger_depth() > 1 then return null; end if;            -- row moved by another trigger
  if coalesce(current_setting('app.skip_stock_sync', true), '') = 'on' then return null; end if;
  if public.ledger_write_context() <> 'dashboard' then return null; end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := public.ledger_row_effect(old.type, old.qty, old.status);
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    v_new := public.ledger_row_effect(new.type, new.qty, new.status);
  end if;

  if tg_op = 'UPDATE' then
    if new.sku_id is not distinct from old.sku_id then
      if v_new <> v_old then
        if v_cs then
          update public.cs_skus set current_stock = coalesce(current_stock, 0) + (v_new - v_old) where id = new.sku_id;
        else
          update public.skus    set current_stock = coalesce(current_stock, 0) + (v_new - v_old) where id = new.sku_id;
        end if;
      end if;
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and v_old <> 0 then
    if v_cs then
      update public.cs_skus set current_stock = coalesce(current_stock, 0) - v_old where id = old.sku_id;
    else
      update public.skus    set current_stock = coalesce(current_stock, 0) - v_old where id = old.sku_id;
    end if;
  end if;
  if tg_op in ('UPDATE', 'INSERT') and v_new <> 0 then
    if v_cs then
      update public.cs_skus set current_stock = coalesce(current_stock, 0) + v_new where id = new.sku_id;
    else
      update public.skus    set current_stock = coalesce(current_stock, 0) + v_new where id = new.sku_id;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.dashboard_sync_stock() from public, anon, authenticated;

drop trigger if exists trg_dashboard_sync_stock on public.stock_transactions;
create trigger trg_dashboard_sync_stock
  after insert or update or delete on public.stock_transactions
  for each row execute function public.dashboard_sync_stock();

drop trigger if exists trg_dashboard_sync_stock on public.cs_transactions;
create trigger trg_dashboard_sync_stock
  after insert or update or delete on public.cs_transactions
  for each row execute function public.dashboard_sync_stock();

-- ------------------------------------------------------------------
-- 4. A ticket's movements follow its date (rule of 0026):
--      ledger date = coalesce(delivery_date, created day)
--    redate_ticket_ledger moves every MKT + CS row of one ticket (incl. the
--    CS OPENING row a cs_transfer wrote when it created the CS item). Borrow
--    returns ('Returned') keep their real day. Fired by a trigger whenever
--    delivery_date / created_at changes — from the app or the dashboard.
-- ------------------------------------------------------------------
create or replace function public.redate_ticket_ledger(p_ticket_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day  date;
  v_prev text := coalesce(current_setting('app.ledger_unlock', true), '');
  v_n    integer := 0;
  v_c    integer;
begin
  select coalesce(t.delivery_date, (t.created_at at time zone 'Asia/Vientiane')::date)
    into v_day
    from public.tickets t where t.id = p_ticket_id;
  if v_day is null then return 0; end if;

  perform set_config('app.ledger_unlock', 'on', true);

  update public.stock_transactions st
     set date = v_day
   where st.ticket_id = p_ticket_id
     and coalesce(st.status, '') <> 'Returned'
     and st.date is distinct from v_day;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  update public.cs_transactions ct
     set date = v_day
   where (ct.ticket_id = p_ticket_id
          or (ct.ticket_id = 'OPENING'
              and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id))
     and coalesce(ct.status, '') <> 'Returned'
     and ct.date is distinct from v_day;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  perform set_config('app.ledger_unlock', v_prev, true);
  return v_n;
end;
$$;
revoke execute on function public.redate_ticket_ledger(text) from public, anon, authenticated;

create or replace function public.tickets_redate_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.delivery_date, (new.created_at at time zone 'Asia/Vientiane')::date)
     is distinct from
     coalesce(old.delivery_date, (old.created_at at time zone 'Asia/Vientiane')::date) then
    perform public.redate_ticket_ledger(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.tickets_redate_ledger() from public, anon, authenticated;

drop trigger if exists trg_tickets_redate_ledger on public.tickets;
create trigger trg_tickets_redate_ledger
  after update of delivery_date, created_at on public.tickets
  for each row execute function public.tickets_redate_ledger();

-- ------------------------------------------------------------------
-- 5. No e-mail for an Admin correction (0020 body + one early return):
--    forcing a status back and forth must not mail the requester.
-- ------------------------------------------------------------------
create or replace function public.notify_ticket_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_result jsonb;
begin
  if coalesce(current_setting('app.suppress_ticket_email', true), '') = 'on' then
    return null;                                  -- 0028: Admin correction → no mail
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;                                  -- nothing changed → no mail
  end if;

  v_result := public.dispatch_ticket_email(new.id, false);

  if not coalesce((v_result->>'success')::boolean, false) then
    insert into public.email_log (ticket_id, stage, status, provider, ok, error, triggered_by)
    values (new.id, new.status, new.status, 'relay', false,
            coalesce(v_result->>'error', 'dispatch refused'), 'trigger');
  end if;

  return null;
exception when others then
  begin
    insert into public.email_log (ticket_id, stage, status, provider, ok, error, triggered_by)
    values (new.id, new.status, new.status, 'relay', false,
            'dispatch failed: ' || sqlerrm, 'trigger');
  exception when others then null;
  end;
  return null;
end $$;
revoke execute on function public.notify_ticket_email() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 6. Audit logger (0016 body) — changes:
--    * dashboard writes are LOGGED (actor "Supabase dashboard", origin
--      'dashboard') instead of skipped; their ledger diff also shows
--      status / type / item, and the ledger noise guard does not drop them,
--    * tickets / ticket_items are logged for dashboard writes (in the app,
--      ticket_actions + admin_edit_ticket already record them),
--    * a ledger row dated in a month already reported to Finance gets the
--      flag 'reported_month_changed',
--    * the 'Edited' ticket_actions row written by admin_edit_ticket is not
--      logged twice (admin_edit_ticket writes one detailed audit row itself).
-- ------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old        jsonb;
  v_new        jsonb;
  v_row        jsonb;
  v_actor      jsonb;
  v_actor_id   uuid;
  v_actor_name text;
  v_actor_mail text;
  v_actor_role text;
  v_module     text;
  v_action     text;
  v_entity_id  text;
  v_entity_nm  text;
  v_wh         text;
  v_ref        text;
  v_amount     numeric;
  v_summary    text;
  v_comment    text;
  v_changes    jsonb := '[]'::jsonb;
  v_fields     text[];
  v_nums       text[] := array['qty','qty_broken','opening_balance','current_stock',
                               'total_inflow','low_stock_threshold','cost_per_unit',
                               'qty_requested','qty_approved'];
  f            text;
  v_from       text;
  v_to         text;
  v_old_qty    numeric;
  v_new_qty    numeric;
  v_dir        text;
  v_origin     text := 'app';
  v_flags      text[] := '{}';
  v_start      date := public.reporting_period_start();
begin
  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
  else
    v_new := to_jsonb(NEW);
    if TG_OP = 'UPDATE' then v_old := to_jsonb(OLD); end if;
  end if;
  v_row := coalesce(v_new, v_old);

  v_actor := public.audit_actor();
  if v_actor is not null then
    v_actor_id   := nullif(v_actor->>'id', '')::uuid;
    v_actor_name := nullif(v_actor->>'name', '');
    v_actor_mail := nullif(v_actor->>'email', '');
    v_actor_role := nullif(v_actor->>'role', '');
  end if;

  if v_actor_id is null then
    -- 0028: the Supabase dashboard is a real editor — log it, never skip it.
    if public.ledger_write_context() <> 'dashboard' then return null; end if;
    v_origin := 'dashboard';
  end if;

  -- admin_edit_ticket writes its own detailed audit row
  if TG_TABLE_NAME = 'ticket_actions'
     and coalesce(current_setting('app.admin_ticket_edit', true), '') = 'on' then
    return null;
  end if;

  case TG_TABLE_NAME

    when 'ticket_actions' then
      v_module     := 'ticket';
      v_ref        := v_row->>'ticket_id';
      v_entity_id  := coalesce(v_row->>'id', v_ref);
      v_entity_nm  := v_ref;
      v_action     := regexp_replace(lower(coalesce(nullif(v_row->>'action',''), nullif(v_row->>'status',''), 'update')), '\s+', '_', 'g');
      v_comment    := nullif(btrim(coalesce(v_row->>'comment','')), '');
      v_actor_name := coalesce(nullif(btrim(coalesce(v_row->>'action_by','')), ''), v_actor_name);
      v_actor_role := coalesce(nullif(btrim(coalesce(v_row->>'role','')), ''), v_actor_role);
      v_summary    := 'Ticket ' || coalesce(v_ref, '?') || ' — ' ||
                      coalesce(nullif(v_row->>'action',''), nullif(v_row->>'status',''), 'updated');

    -- 0028: the ticket itself — dashboard writes only
    when 'tickets' then
      if v_origin <> 'dashboard' then return null; end if;
      v_module    := 'ticket';
      v_ref       := v_row->>'id';
      v_entity_id := v_ref;
      v_entity_nm := v_ref;
      v_comment   := nullif(btrim(coalesce(v_row->>'remark','')), '');
      v_fields    := array['created_at','delivery_date','actual_delivery_date','return_date',
                           'actual_return_date','remark','department','created_by',
                           'created_by_name','type','status'];
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'dashboard_edit' else 'delete' end;
      v_summary   := 'Ticket ' || coalesce(v_ref, '?') || case TG_OP
                       when 'INSERT' then ' added in the Supabase dashboard'
                       when 'DELETE' then ' deleted in the Supabase dashboard'
                       else ' edited in the Supabase dashboard' end;
      if coalesce(left(v_old->>'delivery_date', 10), left(v_old->>'created_at', 10))::date < v_start
         or coalesce(left(v_new->>'delivery_date', 10), left(v_new->>'created_at', 10))::date < v_start then
        v_flags := array['reported_month_changed'];
      end if;

    when 'ticket_items' then
      if v_origin <> 'dashboard' then return null; end if;
      v_module    := 'ticket';
      v_ref       := v_row->>'ticket_id';
      v_entity_id := coalesce(v_ref, '') || ':' || coalesce(v_row->>'sku_id', '');
      v_entity_nm := v_row->>'sku_name';
      v_amount    := coalesce((v_row->>'qty_approved')::numeric, (v_row->>'qty_requested')::numeric);
      v_fields    := array['sku_id','sku_name','qty_requested','qty_approved','unit'];
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'dashboard_edit' else 'delete' end;
      v_summary   := case TG_OP
                       when 'INSERT' then 'Item "' || coalesce(v_entity_nm, '') || '" added to '
                       when 'DELETE' then 'Item "' || coalesce(v_entity_nm, '') || '" removed from '
                       else 'Item "' || coalesce(v_entity_nm, '') || '" changed on ' end
                     || coalesce(v_ref, '?') || ' in the Supabase dashboard';

    when 'stock_transactions', 'cs_transactions' then
      v_module     := 'ledger';
      v_wh         := case when TG_TABLE_NAME = 'cs_transactions' then 'CS' else 'MKT' end;
      v_ref        := v_row->>'ticket_id';
      v_entity_id  := coalesce(v_row->>'id', v_old->>'id');
      v_entity_nm  := v_row->>'sku_name';
      v_amount     := coalesce((v_row->>'qty')::numeric, 0);
      v_dir        := case when v_row->>'type' = 'addition' then 'IN' else 'OUT' end;
      v_comment    := nullif(btrim(coalesce(v_row->>'comment','')), '');
      v_fields     := case when v_origin = 'dashboard'
                           then array['qty','qty_broken','date','type','status','sku_id','sku_name','action_by','comment','ticket_id']
                           else array['qty','qty_broken','date','action_by','comment','ticket_id'] end;
      v_actor_name := coalesce(nullif(btrim(coalesce(v_row->>'edited_by','')), ''),
                               nullif(btrim(coalesce(v_row->>'action_by','')), ''), v_actor_name);
      if (v_old->>'date')::date < v_start or (v_new->>'date')::date < v_start then
        v_flags := array['reported_month_changed'];
      end if;
      if TG_OP = 'INSERT' then
        v_action := case
          when coalesce(v_ref,'') = 'RESTOCK'                  then 'restock'
          when coalesce(v_ref,'') = 'DIRECT_DESTOCK'           then 'destock'
          when coalesce(v_ref,'') like 'CS_TRANSFER%'          then 'transfer'
          when coalesce(v_ref,'') like 'MKT_TRANSFER%'         then 'transfer'
          when TG_TABLE_NAME = 'cs_transactions'
               and lower(coalesce(v_row->>'comment','')) like '%auto-transferred%' then 'transfer'
          when coalesce(v_ref,'') = 'OPENING'                  then 'opening'
          when lower(coalesce(v_row->>'status','')) = 'booked' then 'book'
          when v_dir = 'IN'                                    then 'return'
          else 'issue'
        end;
        v_summary := case v_action
          when 'restock'  then 'Restocked "' || v_entity_nm || '" +' || public.nice_num(v_amount)
          when 'destock'  then 'Direct destock "' || v_entity_nm || '" −' || public.nice_num(v_amount)
          when 'transfer' then 'Warehouse transfer "' || v_entity_nm || '" ' || public.nice_num(v_amount) || ' ' || v_dir
          when 'opening'  then 'Opening balance "' || v_entity_nm || '" = ' || public.nice_num(v_amount)
          when 'book'     then 'Booked ' || public.nice_num(v_amount) || ' × "' || v_entity_nm || '" on ' || coalesce(v_ref,'')
          when 'return'   then 'Returned ' || public.nice_num(v_amount) || ' × "' || v_entity_nm || '"' ||
                               case when coalesce(v_ref,'') <> '' then ' (' || v_ref || ')' else '' end
          else 'Stock OUT ' || public.nice_num(v_amount) || ' × "' || v_entity_nm || '"' ||
                               case when coalesce(v_ref,'') <> '' then ' · ' || v_ref else '' end
        end;
      elsif TG_OP = 'UPDATE' then
        v_action  := case when coalesce(v_row->>'edited_by','') <> '' or v_origin = 'dashboard' then 'correct' else 'update' end;
        v_summary := case when v_action = 'correct'
                          then 'Corrected ' || v_wh || ' stock ' || v_dir || ' "' || v_entity_nm || '"'
                          else 'Stock row updated ' || v_wh || ' ' || v_dir || ' "' || v_entity_nm || '"'
                     end;
        v_old_qty := coalesce((v_old->>'qty')::numeric, 0);
        v_new_qty := coalesce((v_new->>'qty')::numeric, 0);
        if v_old_qty <> v_new_qty then
          v_summary := v_summary || ' · qty ' || public.nice_num(v_old_qty) || ' → ' || public.nice_num(v_new_qty);
        end if;
        if (v_old->>'date') is distinct from (v_new->>'date') then
          v_summary := v_summary || ' · date ' || coalesce(v_old->>'date', '—') || ' → ' || coalesce(v_new->>'date', '—');
        end if;
      else
        v_action  := 'delete';
        v_summary := 'Deleted a ' || v_wh || ' stock row "' || v_entity_nm || '"';
      end if;

    when 'skus', 'cs_skus' then
      v_module     := 'master';
      v_wh         := case when TG_TABLE_NAME = 'cs_skus' then 'CS' else 'MKT' end;
      v_entity_id  := v_row->>'id';
      v_entity_nm  := v_row->>'name';
      v_fields     := array['name','category','unit','opening_balance','current_stock',
                            'total_inflow','low_stock_threshold','cost_per_unit','status','image_url'];
      v_action     := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_summary    := case TG_OP
        when 'INSERT' then 'Added ' || v_wh || ' item "' || v_entity_nm || '"' ||
                           case when coalesce((v_row->>'opening_balance')::numeric, 0) > 0
                                then ' · opening ' || public.nice_num((v_row->>'opening_balance')::numeric)
                                else '' end
        when 'DELETE' then 'Deleted ' || v_wh || ' item "' || v_entity_nm || '"'
        else 'Changed ' || v_wh || ' item "' || v_entity_nm || '"'
      end;

    when 'system_config' then
      v_module    := 'settings';
      v_entity_id := v_row->>'key';
      v_entity_nm := v_row->>'key';
      v_fields    := array['value','description'];
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_summary   := case TG_OP
        when 'INSERT' then 'Set ' || coalesce(v_row->>'key','') || ' = ' || coalesce(v_row->>'value','')
        when 'DELETE' then 'Removed setting ' || coalesce(v_row->>'key','')
        else 'Changed setting ' || coalesce(v_row->>'key','')
      end;

    when 'categories' then
      v_module    := 'settings';
      v_entity_id := v_row->>'name';
      v_entity_nm := v_row->>'name';
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_summary   := case TG_OP
        when 'DELETE' then 'Removed category "' || coalesce(v_row->>'name','') || '"'
        else 'Added category "' || coalesce(v_row->>'name','') || '"'
      end;

    when 'sku_remarks' then
      v_module     := 'remark';
      v_entity_id  := coalesce(v_row->>'id', v_row->>'sku_id');
      v_entity_nm  := coalesce((select s.name from public.skus s where s.id = v_row->>'sku_id'), v_row->>'sku_id');
      v_action     := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_comment    := nullif(btrim(coalesce(v_row->>'remark','')), '');
      v_actor_name := coalesce(nullif(btrim(coalesce(v_row->>'user_name','')), ''), v_actor_name);
      v_actor_role := coalesce(nullif(btrim(coalesce(v_row->>'user_role','')), ''), v_actor_role);
      v_summary    := 'Remark on "' || v_entity_nm || '"';

    when 'users' then
      v_module    := 'users';
      v_entity_id := v_row->>'id';
      v_entity_nm := coalesce(nullif(btrim(coalesce(v_row->>'full_name','')), ''), v_row->>'email');
      v_fields    := array['full_name','username','email','department','role','status','password'];
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_summary   := case TG_OP
        when 'INSERT' then 'Added user ' || v_entity_nm || ' (' || coalesce(v_row->>'role','') || ')'
        when 'DELETE' then 'Deleted user ' || v_entity_nm
        else 'Updated user ' || v_entity_nm
      end;

    else
      v_module  := 'app';
      v_action  := lower(TG_OP);
      v_summary := TG_OP || ' on ' || TG_TABLE_NAME;
  end case;

  -- the dashboard has no app identity: say so plainly
  if v_origin = 'dashboard' then
    v_actor_name := 'Supabase dashboard';
    v_actor_role := 'dashboard';
    v_actor_mail := session_user::text;
  end if;

  if TG_OP = 'UPDATE' and v_fields is not null then
    foreach f in array v_fields loop
      v_from := v_old->>f;
      v_to   := v_new->>f;
      continue when v_from is not distinct from v_to;

      if f = 'password' then
        v_changes := v_changes || jsonb_build_object('field', 'password', 'from', null, 'to', 'changed');
      elsif f = 'image_url' then
        v_changes := v_changes || jsonb_build_object(
          'field', 'photo',
          'from',  case when v_from is null then null else 'photo' end,
          'to',    case when v_to   is null then null else 'photo' end);
      else
        if f = any(v_nums) then
          if v_from is not null then v_from := public.nice_num(v_from::numeric)::text; end if;
          if v_to   is not null then v_to   := public.nice_num(v_to::numeric)::text;   end if;
        end if;
        v_changes := v_changes || jsonb_build_object('field', f, 'from', v_from, 'to', v_to);
      end if;
    end loop;
  end if;

  if TG_OP = 'UPDATE' and v_old = v_new then return null; end if;

  if TG_OP = 'UPDATE' then
    if v_module = 'ledger'
       and v_origin <> 'dashboard'
       and coalesce(v_row->>'edited_by', '') = ''
       and v_old_qty is not distinct from v_new_qty then
      return null;
    end if;
    if v_fields is not null and v_module <> 'ledger' and v_changes = '[]'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (
    actor_id, actor_name, actor_email, actor_role,
    module, action, entity, entity_id, entity_name,
    warehouse, ref_ticket, amount, summary, comment, changes, origin, flags
  ) values (
    v_actor_id, v_actor_name, v_actor_mail, v_actor_role,
    coalesce(v_module, 'app'),
    coalesce(nullif(v_action, ''), 'update'),
    TG_TABLE_NAME, v_entity_id, v_entity_nm,
    v_wh, v_ref, v_amount,
    coalesce(nullif(btrim(coalesce(v_summary, '')), ''), TG_OP || ' on ' || TG_TABLE_NAME),
    v_comment, v_changes,
    v_origin, v_flags
  );

  return null;

exception when others then
  raise warning 'audit_row skipped (% %): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  return null;
end;
$$;
revoke execute on function public.audit_row() from public, anon, authenticated;

drop trigger if exists trg_audit_tickets      on public.tickets;
drop trigger if exists trg_audit_ticket_items on public.ticket_items;
create trigger trg_audit_tickets      after insert or update or delete on public.tickets      for each row execute function public.audit_row();
create trigger trg_audit_ticket_items after insert or update or delete on public.ticket_items for each row execute function public.audit_row();

-- ------------------------------------------------------------------
-- 7. Reconcile a ticket's stock with what the ticket now says.
--    Called by admin_edit_ticket AFTER the ticket + its items were updated.
--    Per item (MKT), with T = qty on the ticket (0 when rejected / recalled):
--      pending / reviewed / lm_approved → ONE 'Booked' row of T (the original
--          booking is re-used), every other movement cancelled — exactly the
--          shape update_ticket_status expects at the next step,
--      finalized / returned → 'Booked' → 'Deducted'; any difference posted as
--          'Edit Issue' / 'Edit Return'; a ticket forced INTO 'returned'
--          gets its items back today ('Returned'); a ticket that is no longer
--          'returned' loses its 'Returned' rows,
--      rejected / recalled → every movement cancelled, stock comes back.
--    CS (cs_transfer + finalized): receipt = T per item, difference posted as
--    'Edit Receipt' / 'Edit Return'; anything else → CS receipt back to 0.
--    New rows are dated on the ticket's ledger date. current_stock follows.
-- ------------------------------------------------------------------
create or replace function public.admin_ticket_reconcile(
  p_ticket_id   text,
  p_prev_status text,
  p_actor       text,
  p_note        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      record;
  v_day    date;
  v_today  date := public.vientiane_today();
  v_grp    text;
  v_sku    text;
  v_name   text;
  v_target numeric;
  v_net    numeric;
  v_ret    numeric;
  v_pick   bigint;
  v_d      numeric;
  v_cs_id  text;
  v_cs_tgt jsonb := '{}'::jsonb;
  v_mkt    record;
  v_k      text;
  v_dead   text[] := array['booking cancelled', 'cancelled', 'reversed'];
begin
  select * into v_t from public.tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket % not found', p_ticket_id; end if;
  v_day := coalesce(v_t.delivery_date, (v_t.created_at at time zone 'Asia/Vientiane')::date, v_today);
  v_grp := case when v_t.status in ('pending', 'reviewed', 'lm_approved') then 'PRE'
                when v_t.status in ('finalized', 'returned')             then 'FINAL'
                else 'OFF' end;

  -- ═══ MKT warehouse ═══
  for v_sku, v_name in
    select s.sku_id, max(s.sku_name)
      from (select ti.sku_id, ti.sku_name from public.ticket_items ti where ti.ticket_id = p_ticket_id
            union all
            select st.sku_id, st.sku_name from public.stock_transactions st
             where st.ticket_id = p_ticket_id and st.sku_id is not null) s
     group by s.sku_id
     order by s.sku_id
  loop
    perform 1 from public.skus where id = v_sku for update;

    v_target := null;
    select coalesce(ti.qty_approved, ti.qty_requested, 0) into v_target
      from public.ticket_items ti where ti.ticket_id = p_ticket_id and ti.sku_id = v_sku;
    v_target := coalesce(v_target, 0);
    if v_grp = 'OFF' then v_target := 0; end if;

    -- 'Returned' rows only belong to a ticket that IS returned
    if v_t.status <> 'returned' then
      select coalesce(sum(st.qty), 0) into v_ret
        from public.stock_transactions st
       where st.ticket_id = p_ticket_id and st.sku_id = v_sku and st.status = 'Returned';
      if v_ret <> 0 then
        update public.stock_transactions
           set status = 'Cancelled', comment = coalesce(comment, '') || ' · ' || p_note
         where ticket_id = p_ticket_id and sku_id = v_sku and status = 'Returned';
        update public.skus set current_stock = coalesce(current_stock, 0) - v_ret where id = v_sku;
      end if;
    end if;

    -- what the ticket holds of this item right now (issued − given back)
    select coalesce(sum(case when st.type = 'deduction' then st.qty else -st.qty end), 0) into v_net
      from public.stock_transactions st
     where st.ticket_id = p_ticket_id and st.sku_id = v_sku
       and lower(coalesce(st.status, '')) <> all (v_dead)
       and coalesce(st.status, '') <> 'Returned';

    if v_grp = 'PRE' then
      v_pick := null;
      if v_target > 0 then
        select st.id into v_pick
          from public.stock_transactions st
         where st.ticket_id = p_ticket_id and st.sku_id = v_sku and st.type = 'deduction'
           and coalesce(st.status, '') <> 'Returned'
         order by (st.status = 'Booked') desc,
                  (lower(coalesce(st.status, '')) <> all (v_dead)) desc,
                  st.id
         limit 1;
        if v_pick is null then
          insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                                 action_by, status, comment)
          values (p_ticket_id, v_sku, v_name, v_target, 'deduction', v_day,
                  p_actor, 'Booked', p_note)
          returning id into v_pick;
        else
          update public.stock_transactions
             set comment = case when status = 'Booked' and qty = v_target and date = v_day
                                then comment else coalesce(comment, '') || ' · ' || p_note end,
                 status  = 'Booked',
                 qty     = v_target,
                 date    = v_day
           where id = v_pick;
        end if;
      end if;
      update public.stock_transactions
         set status  = case when type = 'deduction' then 'Booking Cancelled' else 'Cancelled' end,
             comment = coalesce(comment, '') || ' · ' || p_note
       where ticket_id = p_ticket_id and sku_id = v_sku
         and id is distinct from v_pick
         and lower(coalesce(status, '')) <> all (v_dead)
         and coalesce(status, '') <> 'Returned';
      update public.skus set current_stock = coalesce(current_stock, 0) + v_net - v_target where id = v_sku;

    elsif v_grp = 'FINAL' then
      update public.stock_transactions
         set status = 'Deducted'
       where ticket_id = p_ticket_id and sku_id = v_sku and type = 'deduction' and status = 'Booked';
      v_d := v_target - v_net;
      if v_d <> 0 then
        insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                               action_by, status, comment)
        values (p_ticket_id, v_sku, v_name, abs(v_d),
                case when v_d > 0 then 'deduction' else 'addition' end, v_day, p_actor,
                case when v_d > 0 then 'Edit Issue' else 'Edit Return' end,
                p_note || ' · qty ' || public.nice_num(v_net) || ' → ' || public.nice_num(v_target));
        update public.skus set current_stock = coalesce(current_stock, 0) - v_d where id = v_sku;
      end if;
      -- forced INTO 'returned' (borrow): everything issued comes back today
      if v_t.status = 'returned' and coalesce(p_prev_status, '') <> 'returned' and v_target > 0 then
        insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date,
                                               action_by, status, comment)
        values (p_ticket_id, v_sku, v_name, v_target, 0, 'addition', v_today, p_actor, 'Returned',
                p_note || ' · returned (status set by Admin)');
        update public.skus set current_stock = coalesce(current_stock, 0) + v_target where id = v_sku;
      end if;

    else  -- OFF: rejected / recalled
      update public.stock_transactions
         set status  = case when type = 'deduction' then 'Booking Cancelled' else 'Cancelled' end,
             comment = coalesce(comment, '') || ' · ' || p_note
       where ticket_id = p_ticket_id and sku_id = v_sku
         and lower(coalesce(status, '')) <> all (v_dead)
         and coalesce(status, '') <> 'Returned';
      update public.skus set current_stock = coalesce(current_stock, 0) + v_net where id = v_sku;
    end if;

    -- CS receipt target of this item
    if v_t.type = 'cs_transfer' and v_t.status = 'finalized' and v_target > 0 then
      v_cs_id := public.edit_ticket_cs_id(v_sku, v_name);
      if v_cs_id is null then
        -- first time this item reaches CS: created empty, then received
        select * into v_mkt from public.skus where id = v_sku;
        insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock,
                                    total_inflow, image_url, low_stock_threshold, cost_per_unit, status)
        values (v_sku, v_name, coalesce(v_mkt.category, 'General'), coalesce(v_mkt.unit, 'pcs'),
                0, 0, 0, v_mkt.image_url, coalesce(v_mkt.low_stock_threshold, 0),
                coalesce(v_mkt.cost_per_unit, 0), 'active');
        v_cs_id := v_sku;
      end if;
      v_cs_tgt := jsonb_set(v_cs_tgt, array[v_cs_id],
                            to_jsonb(coalesce((v_cs_tgt->>v_cs_id)::numeric, 0) + v_target));
    end if;
  end loop;

  -- ═══ CS warehouse ═══
  for v_k in
    select x.k from (
      select jsonb_object_keys(v_cs_tgt) as k
      union
      select ct.sku_id
        from public.cs_transactions ct
       where (ct.ticket_id = p_ticket_id
              or (ct.ticket_id = 'OPENING'
                  and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id))
         and ct.sku_id is not null
    ) x
    order by x.k
  loop
    perform 1 from public.cs_skus where id = v_k for update;
    v_target := coalesce((v_cs_tgt->>v_k)::numeric, 0);
    select coalesce(sum(case when ct.type = 'addition' then ct.qty else -ct.qty end), 0) into v_net
      from public.cs_transactions ct
     where (ct.ticket_id = p_ticket_id
            or (ct.ticket_id = 'OPENING'
                and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id))
       and ct.sku_id = v_k
       and lower(coalesce(ct.status, '')) <> all (v_dead);
    v_d := v_target - v_net;
    if v_d <> 0 then
      select c.name into v_name from public.cs_skus c where c.id = v_k;
      if not found then
        raise exception 'CS item % no longer exists — its stock cannot be adjusted', v_k;
      end if;
      insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                          action_by, status, comment)
      values (p_ticket_id, v_k, v_name, abs(v_d),
              case when v_d > 0 then 'addition' else 'deduction' end, v_day, p_actor,
              case when v_d > 0 then 'Edit Receipt' else 'Edit Return' end,
              p_note || ' · CS qty ' || public.nice_num(v_net) || ' → ' || public.nice_num(v_target));
      update public.cs_skus
         set current_stock = coalesce(current_stock, 0) + v_d,
             total_inflow  = coalesce(total_inflow, 0)  + v_d
       where id = v_k;
    end if;
  end loop;
end;
$$;
revoke execute on function public.admin_ticket_reconcile(text, text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 8. admin_edit_ticket — the Admin "Edit ticket" save
--    p_fields : only the CHANGED header fields, each {"from": <value the
--               Admin saw>, "to": <new value>} — a 'from' that no longer
--               matches → "changed by someone else, reload" (dates as
--               'YYYY-MM-DD', created_at as its Vientiane day)
--    p_items  : null = items unchanged, else the FULL desired list
--               [{sku_id, qty, expected_qty}] (same as edit_ticket 0024)
--    p_confirm: false → when a warning applies, nothing is saved and the
--               answer is {needs_confirm: true, warnings: [...]}
--
--    The edit is APPLIED inside a sub-transaction, the result is checked,
--    and the sub-transaction is rolled back when the Admin still has to
--    confirm — so the warnings describe exactly what saving will do.
-- ------------------------------------------------------------------
create or replace function public.admin_edit_ticket(
  p_ticket_id text,
  p_fields    jsonb   default '{}'::jsonb,
  p_items     jsonb   default null,
  p_remark    text    default '',
  p_confirm   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid;
  v_role    text;
  v_email   text;
  v_name    text;
  v_remark  text := btrim(coalesce(p_remark, ''));
  v_fields  jsonb := case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}'::jsonb end;
  v_allowed text[] := array['created_at', 'delivery_date', 'actual_delivery_date', 'return_date',
                            'remark', 'department', 'created_by', 'created_by_name', 'type', 'status'];
  v_labels  jsonb := jsonb_build_object(
                       'created_at', 'created date', 'delivery_date', 'delivery date',
                       'actual_delivery_date', 'delivered on', 'return_date', 'return date',
                       'remark', 'remark', 'department', 'department', 'created_by', 'requester account',
                       'created_by_name', 'requester', 'type', 'type', 'status', 'status');
  v_t       record;
  v_tj      jsonb;
  v_key     text;
  v_from    text;
  v_to      text;
  v_cur     text;
  v_set     jsonb := '{}'::jsonb;
  v_fchg    jsonb := '[]'::jsonb;
  v_ichg    jsonb := '[]'::jsonb;
  v_items   boolean := p_items is not null and jsonb_typeof(p_items) = 'array';
  v_e       jsonb;
  v_item    record;
  v_sku_id  text;
  v_sku_nm  text;
  v_unit    text;
  v_exists  boolean;
  v_curq    numeric;
  v_newq    numeric;
  v_mkt     record;
  v_status  text;
  v_type    text;
  v_edit_id bigint;
  v_note    text;
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[] := '{}';
  v_months  text[] := '{}';
  v_from_day date;
  v_warn    jsonb := '[]'::jsonb;
  v_neg     boolean := false;
  v_flags   text[] := '{}';
  v_start   date := public.reporting_period_start();
  v_today   date := public.vientiane_today();
  v_mb      record;
  v_bad     text;
  v_summary text := '';
  v_audit   jsonb := '[]'::jsonb;
begin
  -- ── caller from the JWT (never trust the payload) ──────────────────
  select u.id, u.role, u.email, u.full_name into v_uid, v_role, v_email, v_name
    from public.users u
   where u.id = auth.uid() or lower(u.email) = lower(auth.email())
   order by (u.id = auth.uid()) desc
   limit 1;
  if v_role is null or v_role = '' then
    return jsonb_build_object('success', false,
      'error', 'Account not found for this sign-in session — please sign in again');
  end if;
  if lower(btrim(v_role)) <> 'admin' then
    return jsonb_build_object('success', false, 'error', 'Not authorized: only an Admin can edit a ticket');
  end if;
  v_name := coalesce(nullif(btrim(v_name), ''), v_email, 'Admin');

  if length(v_remark) < 5 then
    return jsonb_build_object('success', false,
      'error', 'A remark (at least 5 characters) is required to edit a ticket');
  end if;

  -- ── lock the ticket ────────────────────────────────────────────────
  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ticket not found');
  end if;
  v_tj := to_jsonb(v_t);

  -- ═══ header fields: validate + diff ═══
  for v_key in select jsonb_object_keys(v_fields)
  loop
    if not (v_key = any (v_allowed)) then
      return jsonb_build_object('success', false, 'error', 'Field "' || v_key || '" cannot be edited');
    end if;
    v_cur := case when v_key = 'created_at'
                  then to_char((v_t.created_at at time zone 'Asia/Vientiane')::date, 'YYYY-MM-DD')
                  else v_tj->>v_key end;
    v_from := v_fields->v_key->>'from';
    v_to   := nullif(btrim(coalesce(v_fields->v_key->>'to', '')), '');
    if coalesce(v_cur, '') <> coalesce(v_from, '') then
      return jsonb_build_object('success', false,
        'error', 'This ticket was changed by someone else — please reload it and try again');
    end if;
    continue when coalesce(v_cur, '') = coalesce(v_to, '');

    if v_key in ('created_at', 'delivery_date', 'actual_delivery_date', 'return_date') then
      if v_to is not null and v_to !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('success', false, 'error', 'Invalid ' || (v_labels->>v_key) || ': ' || v_to);
      end if;
      if v_to is not null then
        perform v_to::date;   -- raises on an impossible date (2026-02-30)
      end if;
      if v_key = 'created_at' and v_to is null then
        return jsonb_build_object('success', false, 'error', 'The created date cannot be empty');
      end if;
      if v_key = 'created_at' and v_to::date > v_today then
        return jsonb_build_object('success', false, 'error', 'The created date cannot be in the future');
      end if;
    elsif v_key = 'type' then
      if v_to is null or v_to not in ('request', 'borrow', 'cs_transfer') then
        return jsonb_build_object('success', false, 'error', 'Unknown ticket type: ' || coalesce(v_to, '—'));
      end if;
    elsif v_key = 'status' then
      if v_to is null or v_to not in ('pending', 'reviewed', 'lm_approved', 'finalized',
                                       'rejected', 'returned', 'recalled') then
        return jsonb_build_object('success', false, 'error', 'Unknown status: ' || coalesce(v_to, '—'));
      end if;
    elsif v_key in ('created_by_name') and v_to is null then
      return jsonb_build_object('success', false, 'error', 'The requester cannot be empty');
    end if;

    v_set  := v_set || jsonb_build_object(v_key, v_to);
    v_fchg := v_fchg || jsonb_build_object('field', v_key, 'label', v_labels->>v_key, 'from', v_cur, 'to', v_to);
  end loop;

  v_status := coalesce(v_set->>'status', v_t.status);
  v_type   := coalesce(v_set->>'type', v_t.type);
  if v_status = 'returned' and v_type <> 'borrow' then
    return jsonb_build_object('success', false, 'error', 'Only a borrow ticket can be "returned"');
  end if;

  -- ═══ items: validate + diff (same rules as edit_ticket 0024) ═══
  if v_items then
    if jsonb_array_length(p_items) = 0 then
      return jsonb_build_object('success', false, 'error', 'The edit has no items');
    end if;
    if exists (select 1 from jsonb_array_elements(p_items) e
                where coalesce(btrim(e->>'sku_id'), '') = ''
                   or case when jsonb_typeof(e->'qty') = 'number'
                           then (e->>'qty')::numeric < 0 else true end) then
      return jsonb_build_object('success', false, 'error', 'Every line needs an item and a quantity of 0 or more');
    end if;
    if (select count(*) from jsonb_array_elements(p_items))
       <> (select count(distinct e->>'sku_id') from jsonb_array_elements(p_items) e) then
      return jsonb_build_object('success', false, 'error', 'The same item appears twice in the edit');
    end if;
    for v_item in
      select ti.sku_id, coalesce(ti.qty_approved, ti.qty_requested, 0) as cur
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_e := null;
      select e into v_e from jsonb_array_elements(p_items) e where e->>'sku_id' = v_item.sku_id;
      if v_e is null
         or (case when jsonb_typeof(v_e->'expected_qty') = 'number'
                  then (v_e->>'expected_qty')::numeric <> v_item.cur else true end) then
        return jsonb_build_object('success', false,
          'error', 'This ticket was changed by someone else — please reload it and try again');
      end if;
    end loop;
    if not exists (select 1 from jsonb_array_elements(p_items) e where (e->>'qty')::numeric > 0) then
      return jsonb_build_object('success', false,
        'error', 'A ticket must keep at least one item — set the status to Rejected / Recalled to cancel it');
    end if;

    for v_e in select e from jsonb_array_elements(p_items) e order by e->>'sku_id'
    loop
      v_sku_id := v_e->>'sku_id';
      v_newq   := (v_e->>'qty')::numeric;
      v_curq   := null; v_sku_nm := null;
      select coalesce(ti.qty_approved, ti.qty_requested, 0), ti.sku_name into v_curq, v_sku_nm
        from public.ticket_items ti where ti.ticket_id = p_ticket_id and ti.sku_id = v_sku_id;
      v_exists := found;
      if not v_exists then v_curq := 0; end if;
      continue when v_newq = v_curq;

      select * into v_mkt from public.skus where id = v_sku_id;
      if not found then
        return jsonb_build_object('success', false, 'error', 'Unknown item: ' || v_sku_id);
      end if;
      v_sku_nm := coalesce(v_sku_nm, v_mkt.name);
      if not v_exists and lower(coalesce(v_mkt.status, 'active')) <> 'active' then
        return jsonb_build_object('success', false, 'error', '"' || v_mkt.name || '" is inactive and cannot be added');
      end if;
      v_ichg := v_ichg || jsonb_build_object(
        'sku_id', v_sku_id, 'sku_name', v_sku_nm, 'unit', coalesce(v_mkt.unit, 'pcs'),
        'from', v_curq, 'to', v_newq, 'delta', v_newq - v_curq,
        'action', case when not v_exists then 'added' when v_newq = 0 then 'removed' else 'adjusted' end);
    end loop;
  end if;

  if jsonb_array_length(v_fchg) = 0 and jsonb_array_length(v_ichg) = 0 then
    return jsonb_build_object('success', false, 'error', 'Nothing changed');
  end if;

  -- ── stock rows BEFORE (for the reported-month / balance checks) ─────
  select coalesce(jsonb_object_agg('m' || st.id, jsonb_build_array(st.date, st.qty, st.status, st.type, st.sku_id)), '{}'::jsonb)
    into v_before
    from public.stock_transactions st where st.ticket_id = p_ticket_id;
  v_before := v_before || (
    select coalesce(jsonb_object_agg('c' || ct.id, jsonb_build_array(ct.date, ct.qty, ct.status, ct.type, ct.sku_id)), '{}'::jsonb)
      from public.cs_transactions ct
     where ct.ticket_id = p_ticket_id
        or (ct.ticket_id = 'OPENING'
            and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id));

  -- ═══ apply (sub-transaction: rolled back when a confirm is still needed) ═══
  begin
    perform set_config('app.ledger_unlock', 'on', true);
    perform set_config('app.suppress_ticket_email', 'on', true);
    perform set_config('app.admin_ticket_edit', 'on', true);

    insert into public.ticket_edits (ticket_id, actor_id, actor_name, actor_role, remark, changes, field_changes)
    values (p_ticket_id, v_uid, v_name, 'admin', v_remark, v_ichg, v_fchg)
    returning id into v_edit_id;
    v_note := 'Ticket edit #' || v_edit_id || ' by ' || v_name || ' — ' || v_remark;

    -- (1) the ticket row (a date change moves its stock rows: trigger §4)
    if v_set <> '{}'::jsonb then
      update public.tickets t set
        created_at = case when v_set ? 'created_at'
                          then ((v_set->>'created_at')::date
                                + coalesce((t.created_at at time zone 'Asia/Vientiane')::time, time '12:00'))
                               at time zone 'Asia/Vientiane'
                          else t.created_at end,
        delivery_date        = case when v_set ? 'delivery_date'        then (v_set->>'delivery_date')::date        else t.delivery_date end,
        actual_delivery_date = case when v_set ? 'actual_delivery_date' then (v_set->>'actual_delivery_date')::date else t.actual_delivery_date end,
        return_date          = case when v_set ? 'return_date'          then (v_set->>'return_date')::date          else t.return_date end,
        remark               = case when v_set ? 'remark'               then coalesce(v_set->>'remark', '')         else t.remark end,
        department           = case when v_set ? 'department'           then v_set->>'department'                   else t.department end,
        created_by           = case when v_set ? 'created_by'           then v_set->>'created_by'                   else t.created_by end,
        created_by_name      = case when v_set ? 'created_by_name'      then v_set->>'created_by_name'              else t.created_by_name end,
        type                 = v_type,
        status               = v_status,
        actual_return_date   = case when v_status = 'returned' and t.status <> 'returned' then coalesce(t.actual_return_date, v_today)
                                    when v_status <> 'returned' then null
                                    else t.actual_return_date end,
        last_action_at       = case when v_set ? 'status' then now()           else t.last_action_at end,
        last_action_by       = case when v_set ? 'status' then v_name          else t.last_action_by end,
        last_action_status   = case when v_set ? 'status' then 'Edited'        else t.last_action_status end,
        last_action_comment  = case when v_set ? 'status' then v_note          else t.last_action_comment end
       where t.id = p_ticket_id;
    end if;

    -- (2) the item lines
    for v_e in select * from jsonb_array_elements(v_ichg)
    loop
      if v_e->>'action' = 'added' then
        insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
        values (p_ticket_id, v_e->>'sku_id', v_e->>'sku_name',
                case when v_status = 'pending' then (v_e->>'to')::numeric else 0 end,
                case when v_status = 'pending' then null else (v_e->>'to')::numeric end,
                v_e->>'unit');
      elsif v_e->>'action' = 'removed' then
        delete from public.ticket_items where ticket_id = p_ticket_id and sku_id = v_e->>'sku_id';
      else
        update public.ticket_items
           set qty_requested = case when v_status = 'pending' and qty_approved is null
                                    then (v_e->>'to')::numeric else qty_requested end,
               qty_approved  = case when v_status = 'pending' and qty_approved is null
                                    then null else (v_e->>'to')::numeric end
         where ticket_id = p_ticket_id and sku_id = v_e->>'sku_id';
      end if;
      v_summary := v_summary || case when v_summary = '' then '' else '; ' end
                   || (v_e->>'sku_name') || ' ' || public.nice_num((v_e->>'from')::numeric) || ' → '
                   || public.nice_num((v_e->>'to')::numeric)
                   || case v_e->>'action' when 'added' then ' (added)' when 'removed' then ' (removed)' else '' end;
      v_audit := v_audit || jsonb_build_object('field', 'item "' || (v_e->>'sku_name') || '"',
                   'from', public.nice_num((v_e->>'from')::numeric), 'to', public.nice_num((v_e->>'to')::numeric));
    end loop;
    -- past the request stage the approved qty is the ticket's qty
    if v_status not in ('pending', 'rejected', 'recalled') then
      update public.ticket_items set qty_approved = coalesce(qty_approved, qty_requested)
       where ticket_id = p_ticket_id and qty_approved is null;
    end if;

    for v_e in select * from jsonb_array_elements(v_fchg)
    loop
      v_summary := v_summary || case when v_summary = '' then '' else '; ' end
                   || (v_e->>'label') || ' ' || coalesce(v_e->>'from', '—') || ' → ' || coalesce(v_e->>'to', '—');
      v_audit := v_audit || jsonb_build_object('field', v_e->>'label', 'from', v_e->>'from', 'to', v_e->>'to');
    end loop;

    -- (3) stock follows the ticket
    perform public.admin_ticket_reconcile(p_ticket_id, v_t.status, v_name, v_note);

    -- (4) stock below zero TODAY is never allowed
    select string_agg('"' || s.name || '" (' || public.nice_num(s.current_stock) || ')', ', ') into v_bad
      from public.skus s
     where s.current_stock < 0
       and s.id in (select st.sku_id from public.stock_transactions st where st.ticket_id = p_ticket_id);
    if v_bad is not null then
      raise exception 'Not enough MKT stock — this edit would leave % below zero. Record a Stock In first.', v_bad;
    end if;
    select string_agg('"' || c.name || '" (' || public.nice_num(c.current_stock) || ')', ', ') into v_bad
      from public.cs_skus c
     where c.current_stock < 0
       and c.id in (select ct.sku_id from public.cs_transactions ct
                     where ct.ticket_id = p_ticket_id
                        or (ct.ticket_id = 'OPENING'
                            and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id));
    if v_bad is not null then
      raise exception 'The CS warehouse does not have enough stock to take back — % would go below zero', v_bad;
    end if;

    -- (5) what changed in the ledger?
    select coalesce(jsonb_object_agg('m' || st.id, jsonb_build_array(st.date, st.qty, st.status, st.type, st.sku_id)), '{}'::jsonb)
      into v_after
      from public.stock_transactions st where st.ticket_id = p_ticket_id;
    v_after := v_after || (
      select coalesce(jsonb_object_agg('c' || ct.id, jsonb_build_array(ct.date, ct.qty, ct.status, ct.type, ct.sku_id)), '{}'::jsonb)
        from public.cs_transactions ct
       where ct.ticket_id = p_ticket_id
          or (ct.ticket_id = 'OPENING'
              and substring(coalesce(ct.comment, '') from 'Ticket: (\S+)') = p_ticket_id));

    select coalesce(array_agg(k), '{}') into v_changed
      from (select b.key as k from jsonb_each(v_before) b where (v_after->b.key) is distinct from b.value
            union
            select a.key from jsonb_each(v_after) a where (v_before->a.key) is distinct from a.value) x;

    select min(d), coalesce(array_agg(distinct to_char(d, 'YYYY-MM') order by to_char(d, 'YYYY-MM'))
                              filter (where d < v_start), '{}')
      into v_from_day, v_months
      from (select (v_before->k->>0)::date as d from unnest(v_changed) k
            union all
            select (v_after->k->>0)::date from unnest(v_changed) k) x
     where d is not null;

    if cardinality(v_months) > 0 then
      v_flags := array_append(v_flags, 'reported_month_changed');
      v_warn := v_warn || jsonb_build_object(
        'kind', 'reported_month', 'months', to_jsonb(v_months),
        'message', 'Changes the Month End Report of ' || array_to_string(v_months, ', ')
                   || ' — already reported to Finance');
    end if;

    -- (6) any day's balance below zero from the earliest touched day on?
    if v_from_day is not null then
      for v_mb in
        select s.name, b.min_bal, b.at_day
          from public.skus s
          cross join lateral public.sku_min_balance_from(false, s.id, s.current_stock, v_from_day) b
         where s.id in (select distinct v_after->k->>4 from unnest(v_changed) k where k like 'm%'
                        union
                        select distinct v_before->k->>4 from unnest(v_changed) k where k like 'm%')
           and b.min_bal < 0
      loop
        v_neg := true;
        v_warn := v_warn || jsonb_build_object(
          'kind', 'negative', 'warehouse', 'MKT', 'item', v_mb.name, 'day', v_mb.at_day, 'balance', v_mb.min_bal,
          'message', 'MKT "' || v_mb.name || '" would be ' || public.nice_num(v_mb.min_bal)
                     || ' at the end of ' || to_char(v_mb.at_day, 'YYYY-MM-DD'));
      end loop;
      for v_mb in
        select c.name, b.min_bal, b.at_day
          from public.cs_skus c
          cross join lateral public.sku_min_balance_from(true, c.id, c.current_stock, v_from_day) b
         where c.id in (select distinct v_after->k->>4 from unnest(v_changed) k where k like 'c%'
                        union
                        select distinct v_before->k->>4 from unnest(v_changed) k where k like 'c%')
           and b.min_bal < 0
      loop
        v_neg := true;
        v_warn := v_warn || jsonb_build_object(
          'kind', 'negative', 'warehouse', 'CS', 'item', v_mb.name, 'day', v_mb.at_day, 'balance', v_mb.min_bal,
          'message', 'CS "' || v_mb.name || '" would be ' || public.nice_num(v_mb.min_bal)
                     || ' at the end of ' || to_char(v_mb.at_day, 'YYYY-MM-DD'));
      end loop;
    end if;
    if v_neg then v_flags := array_append(v_flags, 'negative_balance_override'); end if;

    -- (7) the Admin must see the warnings before anything is kept
    if jsonb_array_length(v_warn) > 0 and not coalesce(p_confirm, false) then
      raise exception using errcode = 'P0099', message = 'admin_edit_needs_confirm';
    end if;

    -- (8) the record: ticket trail + one detailed audit row
    insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
    values (p_ticket_id, 'Edited', 'edited', v_name, 'admin',
            'Edit #' || v_edit_id || ' — ' || v_remark || ' · ' || v_summary);

    insert into public.audit_log (actor_id, actor_name, actor_email, actor_role,
                                  module, action, entity, entity_id, entity_name,
                                  ref_ticket, summary, comment, changes, origin, flags)
    values (v_uid, v_name, v_email, 'admin',
            'ticket', 'admin_edit', 'tickets', p_ticket_id, p_ticket_id,
            p_ticket_id, 'Admin edited ticket ' || p_ticket_id || ' (edit #' || v_edit_id || ') — ' || v_summary,
            v_remark
              || case when jsonb_array_length(v_warn) > 0
                      then E'\nConfirmed warnings: ' || (select string_agg(w->>'message', '; ') from jsonb_array_elements(v_warn) w)
                      else '' end,
            v_audit, 'app', v_flags);

    perform set_config('app.admin_ticket_edit', '', true);
    perform set_config('app.suppress_ticket_email', '', true);
    perform set_config('app.ledger_unlock', '', true);
  exception when sqlstate 'P0099' then
    return jsonb_build_object('success', false, 'needs_confirm', true, 'warnings', v_warn);
  end;

  return jsonb_build_object('success', true, 'id', p_ticket_id, 'edit_id', v_edit_id,
                            'warnings', v_warn, 'flags', to_jsonb(v_flags),
                            'message', 'Ticket ' || p_ticket_id || ' edited');
end;
$$;
revoke execute on function public.admin_edit_ticket(text, jsonb, jsonb, text, boolean) from public, anon;
grant  execute on function public.admin_edit_ticket(text, jsonb, jsonb, text, boolean) to authenticated;

-- ------------------------------------------------------------------
-- 9. Self-check
-- ------------------------------------------------------------------
do $$
begin
  raise notice '0028 installed — context here: % (expected: dashboard)', public.ledger_write_context();
  raise notice 'Admin + Supabase dashboard bypass the reported-month lock; other roles keep it.';
end $$;
