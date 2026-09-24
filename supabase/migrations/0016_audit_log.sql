-- ============================================================
-- Easy Gold Merch - 0016_audit_log.sql
-- Part 16 (run AFTER 0015_edit_stock_movement.sql)
--
-- AUDIT TRAIL (Admin → Audit Trail, nav bar)
--
-- Problem: the app already records a lot of history (ticket_actions, the
-- stock ledger's action_by/comment/edited_by, sku_remarks) but it is spread
-- over six tables in four different shapes, and three important areas had NO
-- history at all: SKU master edits, System Settings (config / categories) and
-- user management. There was no single place to answer "who did what, and
-- why" — and an edit reason stamped into a ledger comment was easy to miss
-- because the UI only ever showed a truncated one-line cell.
--
-- Fix: ONE append-only audit table fed by row triggers on every table the app
-- writes to. The actor is resolved from the signed-in session (JWT →
-- public.users, the same pattern 0009/0015 use), so a client can never forge
-- it. Every row carries a plain-language `summary`, the FULL comment/reason,
-- and a JSON old→new diff of the columns that actually changed.
--
--   * Written by triggers only  → no UI code can skip or tamper with a log
--   * Readable by Admins only   → row level security (`public.is_admin()`)
--   * Append-only               → insert/update/delete revoked from clients
--   * Only SIGNED-IN changes are logged, so re-running seed.sql / bulk work
--     in the Table Editor cannot flood the trail with actor-less rows
--     (the existing history is imported once by the backfill in section 5).
--
-- Deliberately NOT logged:
--   * public.tickets / public.ticket_items — ticket_actions IS their trail
--     (logging both would double every workflow step),
--   * no-op UPDATEs,
--   * ticket-engine ledger UPDATEs that only rewrote the booking row's
--     status / comment (the ticket_actions row of that step already covers it;
--     real corrections and qty changes are always kept).
--
-- NOTE: do NOT add `audit_log` to the table array in 0006_ensure_reads.sql —
-- that loop creates a permissive `read <table>` policy for every signed-in
-- user, which would defeat the admin-only rule below.
--
-- Every statement is `if not exists` / `create or replace` / `drop … if
-- exists` → safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. SCHEMA — one append-only audit row per change
-- ------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  actor_email text,
  actor_role  text,
  module      text not null,              -- ticket | ledger | master | settings | users | remark
  action      text not null,              -- create | update | correct | delete | restock | destock | transfer | book | issue | return | opening | …
  entity      text,                       -- source table
  entity_id   text,                       -- PK of that row (sku id / user id / tx id / config key)
  entity_name text,                       -- human label (SKU name, person, ticket id)
  warehouse   text,                       -- 'MKT' | 'CS' | null
  ref_ticket  text,                       -- 'TKT-…' when the change came from a ticket
  amount      numeric,                    -- qty involved, when meaningful
  summary     text not null,              -- ONE plain-language line
  comment     text,                       -- the note / reason, stored in FULL
  changes     jsonb not null default '[]'::jsonb,   -- [{"field":"qty","from":"50","to":"30"}]
  origin      text not null default 'app'           -- app | import
);

create index if not exists idx_audit_at        on public.audit_log (at desc);
create index if not exists idx_audit_module_at on public.audit_log (module, at desc);
create index if not exists idx_audit_actor     on public.audit_log (actor_name);
create index if not exists idx_audit_entity    on public.audit_log (entity_id);
create index if not exists idx_audit_ticket    on public.audit_log (ref_ticket);

-- ------------------------------------------------------------------
-- 2. WHO is calling?  (JWT session → public.users, same as 0009 / 0015)
--    Returns null when there is no signed-in user (SQL Editor, service
--    role) — the trigger skips such writes entirely.
-- ------------------------------------------------------------------
create or replace function public.audit_actor()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id',    u.id,
           'name',  coalesce(nullif(btrim(coalesce(u.full_name, '')), ''), u.email),
           'email', u.email,
           'role',  case lower(btrim(coalesce(u.role, '')))
                      when 'warehouse manager'            then 'warehouse'
                      when 'warehouse'                    then 'warehouse'
                      when 'customer service'             then 'customer_service'
                      when 'customer_service'             then 'customer_service'
                      when 'line manager'                 then 'line_manager'
                      when 'line_manager'                 then 'line_manager'
                      else lower(btrim(coalesce(u.role, '')))
                    end
         )
    from public.users u
   where u.id = auth.uid() or lower(u.email) = lower(auth.email())
   order by (u.id = auth.uid()) desc
   limit 1;
$$;

-- ------------------------------------------------------------------
-- 2b. Small text helper used by the summaries below
-- ------------------------------------------------------------------
/** Version-safe numeric → text: '50.000' → '50' but '12000' stays '12000'
 *  (trim_scale() only exists on PostgreSQL 13+, and this repo must not depend
 *  on the server version). */
create or replace function public.nice_num(p numeric)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when position('.' in (p::text)) = 0 then p::text
    else rtrim(rtrim(p::text, '0'), '.')
  end;
$$;

-- ------------------------------------------------------------------
-- 3. THE TRIGGER FUNCTION — one generic logger for every audited table
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
                               'total_inflow','low_stock_threshold','cost_per_unit'];
  f            text;
  v_from       text;
  v_to         text;
  v_old_qty    numeric;
  v_new_qty    numeric;
  v_dir        text;
begin
  -- ── row snapshots (explicit IFs so a DELETE never reads NEW) ──
  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
  else
    v_new := to_jsonb(NEW);
    if TG_OP = 'UPDATE' then v_old := to_jsonb(OLD); end if;
  end if;
  v_row := coalesce(v_new, v_old);

  -- ── who is doing this? (signed-in session, never the payload) ──
  v_actor := public.audit_actor();
  if v_actor is not null then
    v_actor_id   := nullif(v_actor->>'id', '')::uuid;
    v_actor_name := nullif(v_actor->>'name', '');
    v_actor_mail := nullif(v_actor->>'email', '');
    v_actor_role := nullif(v_actor->>'role', '');
  end if;

  -- Only changes made through a SIGNED-IN session are audited. Without this,
  -- re-running supabase/seed.sql (or bulk work in the Table Editor) would add
  -- thousands of actor-less rows and bury the real trail. Existing history is
  -- imported once by the backfill in section 5 instead.
  if v_actor_id is null then return null; end if;

  -- ── per-table: module / entity / action / summary ─────────────
  case TG_TABLE_NAME

    -- Ticket workflow trail (create → review → approve → finalize → return / reject)
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

    -- Stock ledger (MKT + CS): restock / destock / transfer / booking / issue / return
    when 'stock_transactions', 'cs_transactions' then
      v_module     := 'ledger';
      v_wh         := case when TG_TABLE_NAME = 'cs_transactions' then 'CS' else 'MKT' end;
      v_ref        := v_row->>'ticket_id';
      v_entity_id  := coalesce(v_row->>'id', v_old->>'id');
      v_entity_nm  := v_row->>'sku_name';
      v_amount     := coalesce((v_row->>'qty')::numeric, 0);
      v_dir        := case when v_row->>'type' = 'addition' then 'IN' else 'OUT' end;
      v_comment    := nullif(btrim(coalesce(v_row->>'comment','')), '');
      -- Whitelist for the old → new diff. Deliberately excludes `status`: an
      -- UPDATE that only moved the booking status is covered by the
      -- ticket_actions row of the same step → the noise guard below drops it.
      v_fields     := array['qty','qty_broken','date','action_by','comment','ticket_id'];
      v_actor_name := coalesce(nullif(btrim(coalesce(v_row->>'edited_by','')), ''),
                               nullif(btrim(coalesce(v_row->>'action_by','')), ''), v_actor_name);
      if TG_OP = 'INSERT' then
        v_action := case
          when coalesce(v_ref,'') = 'RESTOCK'                  then 'restock'
          when coalesce(v_ref,'') = 'DIRECT_DESTOCK'           then 'destock'
          when coalesce(v_ref,'') like 'CS_TRANSFER%'          then 'transfer'
          when coalesce(v_ref,'') like 'MKT_TRANSFER%'         then 'transfer'
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
        v_action  := case when coalesce(v_row->>'edited_by','') <> '' then 'correct' else 'update' end;
        v_summary := case when v_action = 'correct'
                          then 'Corrected ' || v_wh || ' stock ' || v_dir || ' "' || v_entity_nm || '"'
                          else 'Stock row updated ' || v_wh || ' ' || v_dir || ' "' || v_entity_nm || '"'
                     end;
        v_old_qty := coalesce((v_old->>'qty')::numeric, 0);
        v_new_qty := coalesce((v_new->>'qty')::numeric, 0);
        if v_old_qty <> v_new_qty then
          v_summary := v_summary || ' · qty ' || public.nice_num(v_old_qty) || ' → ' || public.nice_num(v_new_qty);
        end if;
      else
        v_action  := 'delete';
        v_summary := 'Deleted a ' || v_wh || ' stock row "' || v_entity_nm || '"';
      end if;

    -- SKU master data (MKT + CS catalogue)
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

    -- System Settings → Configuration
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

    -- System Settings → Categories
    when 'categories' then
      v_module    := 'settings';
      v_entity_id := v_row->>'name';
      v_entity_nm := v_row->>'name';
      v_action    := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_summary   := case TG_OP
        when 'DELETE' then 'Removed category "' || coalesce(v_row->>'name','') || '"'
        else 'Added category "' || coalesce(v_row->>'name','') || '"'
      end;

    -- SKU remarks
    when 'sku_remarks' then
      v_module     := 'remark';
      v_entity_id  := coalesce(v_row->>'id', v_row->>'sku_id');
      v_entity_nm  := coalesce((select s.name from public.skus s where s.id = v_row->>'sku_id'), v_row->>'sku_id');
      v_action     := case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
      v_comment    := nullif(btrim(coalesce(v_row->>'remark','')), '');
      v_actor_name := coalesce(nullif(btrim(coalesce(v_row->>'user_name','')), ''), v_actor_name);
      v_actor_role := coalesce(nullif(btrim(coalesce(v_row->>'user_role','')), ''), v_actor_role);
      v_summary    := 'Remark on "' || v_entity_nm || '"';

    -- User accounts (System Settings → Users). The actor is the ADMIN who
    -- made the change — the target account is stored in `entity_name`.
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

  -- ── old → new diff over the whitelisted columns (UPDATE only) ──
  if TG_OP = 'UPDATE' and v_fields is not null then
    foreach f in array v_fields loop
      v_from := v_old->>f;
      v_to   := v_new->>f;
      continue when v_from is not distinct from v_to;

      if f = 'password' then
        -- never store the password itself — only that it changed
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

  -- ── noise guards: nothing worth recording → no audit row ───────
  if TG_OP = 'UPDATE' and v_old = v_new then return null; end if;

  if TG_OP = 'UPDATE' then
    -- The ticket engine rewrites the booking row's status / comment as the
    -- ticket moves (review → book, finalize → deduct, cancel → release), and
    -- each of those steps already writes its own ticket_actions row. Keep a
    -- ledger UPDATE only when it is a real correction (`edited_by` set) or the
    -- quantity actually moved (approved-qty propagation).
    if v_module = 'ledger'
       and coalesce(v_row->>'edited_by', '') = ''
       and v_old_qty is not distinct from v_new_qty then
      return null;
    end if;
    -- Tables with a column whitelist: if none of the tracked columns changed
    -- (only e.g. updated_at / password_updated_at were touched) there is
    -- nothing to report.
    if v_fields is not null and v_module <> 'ledger' and v_changes = '[]'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (
    actor_id, actor_name, actor_email, actor_role,
    module, action, entity, entity_id, entity_name,
    warehouse, ref_ticket, amount, summary, comment, changes, origin
  ) values (
    v_actor_id, v_actor_name, v_actor_mail, v_actor_role,
    coalesce(v_module, 'app'),
    coalesce(nullif(v_action, ''), 'update'),
    TG_TABLE_NAME, v_entity_id, v_entity_nm,
    v_wh, v_ref, v_amount,
    coalesce(nullif(btrim(coalesce(v_summary, '')), ''), TG_OP || ' on ' || TG_TABLE_NAME),
    v_comment, v_changes,
    'app'
  );

  return null;   -- AFTER trigger: the return value is ignored

exception when others then
  -- A logging failure must NEVER break the business operation that fired this
  -- trigger: the write still succeeds, only the audit row is skipped.
  raise warning 'audit_row skipped (% %): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  return null;
end;
$$;

-- ------------------------------------------------------------------
-- 4. ATTACH the logger to every table the app writes to
--    (drop + create so re-running never duplicates a trigger)
-- ------------------------------------------------------------------
drop trigger if exists trg_audit_ticket_actions    on public.ticket_actions;
drop trigger if exists trg_audit_stock_transactions on public.stock_transactions;
drop trigger if exists trg_audit_cs_transactions   on public.cs_transactions;
drop trigger if exists trg_audit_skus              on public.skus;
drop trigger if exists trg_audit_cs_skus           on public.cs_skus;
drop trigger if exists trg_audit_users             on public.users;
drop trigger if exists trg_audit_system_config     on public.system_config;
drop trigger if exists trg_audit_categories        on public.categories;
drop trigger if exists trg_audit_sku_remarks       on public.sku_remarks;

create trigger trg_audit_ticket_actions    after insert or update or delete on public.ticket_actions    for each row execute function public.audit_row();
create trigger trg_audit_stock_transactions after insert or update or delete on public.stock_transactions for each row execute function public.audit_row();
create trigger trg_audit_cs_transactions   after insert or update or delete on public.cs_transactions   for each row execute function public.audit_row();
create trigger trg_audit_skus              after insert or update or delete on public.skus              for each row execute function public.audit_row();
create trigger trg_audit_cs_skus           after insert or update or delete on public.cs_skus           for each row execute function public.audit_row();
create trigger trg_audit_users             after insert or update or delete on public.users             for each row execute function public.audit_row();
create trigger trg_audit_system_config     after insert or update or delete on public.system_config     for each row execute function public.audit_row();
create trigger trg_audit_categories        after insert or update or delete on public.categories        for each row execute function public.audit_row();
create trigger trg_audit_sku_remarks       after insert or update or delete on public.sku_remarks       for each row execute function public.audit_row();

-- ------------------------------------------------------------------
-- 5. ONE-TIME BACKFILL of the history that already exists in the app
--    Runs only when audit_log is empty, so this file stays re-runnable.
-- ------------------------------------------------------------------
do $$
declare v_imported bigint;
begin
  if exists (select 1 from public.audit_log) then
    raise notice 'audit_log already has history — backfill skipped';
    return;
  end if;

  -- ── ticket workflow history ────────────────────────────────────
  insert into public.audit_log (
    at, actor_name, actor_role, module, action, entity, entity_id, entity_name,
    ref_ticket, summary, comment, origin)
  select coalesce(a.action_at, now()), a.action_by, a.role, 'ticket',
         regexp_replace(lower(coalesce(nullif(a.action, ''), nullif(a.status, ''), 'update')), '\s+', '_', 'g'),
         'ticket_actions', a.id::text, a.ticket_id,
         a.ticket_id,
         'Ticket ' || coalesce(a.ticket_id, '?') || ' — ' || coalesce(a.action, a.status, ''),
         nullif(btrim(coalesce(a.comment, '')), ''),
         'import'
    from public.ticket_actions a;

  -- ── MKT stock ledger history ──────────────────────────────────
  insert into public.audit_log (
    at, actor_name, module, action, entity, entity_id, entity_name,
    warehouse, ref_ticket, amount, summary, comment, origin)
  select coalesce(t.action_at, now()), t.action_by, 'ledger',
         case
           when coalesce(t.edited_by, '') <> ''            then 'correct'
           when coalesce(t.ticket_id, '') = 'RESTOCK'      then 'restock'
           when coalesce(t.ticket_id, '') = 'DIRECT_DESTOCK' then 'destock'
           when coalesce(t.ticket_id, '') = 'OPENING'      then 'opening'
           when coalesce(t.ticket_id, '') like 'MKT_TRANSFER%' then 'transfer'
           when coalesce(t.ticket_id, '') like 'CS_TRANSFER%'  then 'transfer'
           when lower(coalesce(t.status, '')) = 'booked'   then 'book'
           when t.type = 'addition'                        then 'return'
           else 'issue'
         end,
         'stock_transactions', t.id::text, t.sku_name,
         'MKT', t.ticket_id, t.qty,
         case
           when coalesce(t.edited_by, '') <> '' then 'Corrected MKT stock row "' || coalesce(t.sku_name, '') || '"'
           else 'Stock ' || case when t.type = 'addition' then 'IN' else 'OUT' end || ' ' ||
                public.nice_num(coalesce(t.qty, 0)) || ' × "' || coalesce(t.sku_name, '') || '"' ||
                case when coalesce(t.ticket_id, '') <> '' then ' · ' || t.ticket_id else '' end
         end,
         nullif(btrim(coalesce(t.comment, '')), ''),
         'import'
    from public.stock_transactions t;

  -- ── CS stock ledger history ───────────────────────────────────
  insert into public.audit_log (
    at, actor_name, module, action, entity, entity_id, entity_name,
    warehouse, ref_ticket, amount, summary, comment, origin)
  select coalesce(t.action_at, now()), t.action_by, 'ledger',
         case
           when coalesce(t.edited_by, '') <> ''                then 'correct'
           when coalesce(t.ticket_id, '') = 'RESTOCK'          then 'restock'
           when coalesce(t.ticket_id, '') = 'DIRECT_DESTOCK'   then 'destock'
           when coalesce(t.ticket_id, '') = 'OPENING'          then 'opening'
           when coalesce(t.ticket_id, '') like 'MKT_TRANSFER%' then 'transfer'
           when coalesce(t.ticket_id, '') like 'CS_TRANSFER%'  then 'transfer'
           when lower(coalesce(t.status, '')) = 'booked'       then 'book'
           when t.type = 'addition'                            then 'return'
           else 'issue'
         end,
         'cs_transactions', t.id::text, t.sku_name,
         'CS', t.ticket_id, t.qty,
         case
           when coalesce(t.edited_by, '') <> '' then 'Corrected CS stock row "' || coalesce(t.sku_name, '') || '"'
           else 'CS stock ' || case when t.type = 'addition' then 'IN' else 'OUT' end || ' ' ||
                public.nice_num(coalesce(t.qty, 0)) || ' × "' || coalesce(t.sku_name, '') || '"' ||
                case when coalesce(t.ticket_id, '') <> '' then ' · ' || t.ticket_id else '' end
         end,
         nullif(btrim(coalesce(t.comment, '')), ''),
         'import'
    from public.cs_transactions t;

  -- ── SKU remarks ───────────────────────────────────────────────
  insert into public.audit_log (
    at, actor_name, actor_role, module, action, entity, entity_id,
    summary, comment, origin)
  select coalesce(r.created_at, now()), r.user_name, r.user_role, 'remark', 'create',
         'sku_remarks', r.id::text,
         'Remark on "' || coalesce((select s.name from public.skus s where s.id = r.sku_id), r.sku_id) || '"',
         nullif(btrim(coalesce(r.remark, '')), ''),
         'import'
    from public.sku_remarks r;

  select count(*) into v_imported from public.audit_log;
  raise notice 'audit_log backfilled — % history rows imported', v_imported;
end $$;

-- ------------------------------------------------------------------
-- 6. ACCESS — Admins read, nobody writes (triggers only)
-- ------------------------------------------------------------------
alter table public.audit_log enable row level security;

-- RLS policies are evaluated as the signed-in user, so the helper used in the
-- policy must be executable by `authenticated` (0001/0009 revoke PUBLIC
-- execute). Re-assert it here — this is where it is actually needed.
do $$
begin
  grant execute on function public.is_admin() to authenticated;
exception when undefined_function then null;
end $$;
do $$
begin
  grant execute on function public.current_app_role() to authenticated;
exception when undefined_function then null;
end $$;

drop policy if exists "audit read admin" on public.audit_log;
create policy "audit read admin" on public.audit_log
  for select to authenticated
  using (public.is_admin());

grant select on public.audit_log to authenticated;

-- Append-only: clients (and anon) can never insert / change / delete a row.
-- The SECURITY DEFINER trigger above is the only writer.
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.audit_log from anon;
revoke select on public.audit_log from anon;

-- The logger internals are not part of the client API — they only ever run
-- from the triggers (as the table owner).
revoke execute on function public.audit_actor() from public, anon, authenticated;
revoke execute on function public.audit_row()   from public, anon, authenticated;
revoke execute on function public.nice_num(numeric) from public, anon, authenticated;

-- Keep the audit table OUT of the realtime publication: the app's realtime
-- hook refetches the shared data bundle, and broadcasting audit rows would
-- both leak them and cause needless refetches.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log'
  ) then
    execute 'alter publication supabase_realtime drop table public.audit_log';
  end if;
exception when others then null;
end $$;

-- ------------------------------------------------------------------
-- 7. Quick self-check (shows up in the SQL Editor output)
-- ------------------------------------------------------------------
do $$
declare v_events bigint; v_actors bigint;
begin
  select count(*), count(distinct actor_name) into v_events, v_actors from public.audit_log;
  raise notice 'audit_log ready — % events from % people/processes', v_events, v_actors;
  raise notice 'Verify with: select module, action, actor_name, summary, comment from public.audit_log order by at desc limit 20;';
end $$;
