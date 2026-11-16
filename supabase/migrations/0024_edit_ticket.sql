-- ============================================================
-- Easy Gold Merch — 0024: Admin "Edit Ticket" (adjust / add / remove SKU)
-- ============================================================
-- An Admin can correct a FINALIZED ticket (request, borrow not yet returned,
-- cs_transfer): change an item's quantity, remove an item, or add a new item.
--
-- Rules (agreed with the business, see plan "Edit Ticket"):
--   * Admin only — checked here from the JWT, never from the payload.
--   * One save = one edit event (`ticket_edits` row) with ONE required remark.
--   * All-or-nothing: every line is validated BEFORE anything is written, and
--     the apply phase raises (→ full rollback) on any surprise.
--   * Append-only ledger, dated TODAY (closed months stay frozen):
--       MKT more  / added   → deduction, status 'Edit Issue'
--       MKT less  / removed → addition,  status 'Edit Return'
--       CS  (cs_transfer)   → mirrored: addition 'Edit Receipt' /
--                             deduction 'Edit Return'
--     A row with status 'Edit Return' OFFSETS the opposite flow in reports
--     (MKT: less Stock Out, CS: less Stock In) instead of counting as a new
--     Stock In / Stock Out — see src/lib/stockMovement.ts `flowOf()`.
--   * Never negative stock: an increase needs enough MKT stock; a cs_transfer
--     decrease needs enough CS stock to take back. No greatest(…,0) clamping.
--   * Invariant kept per (ticket, sku):
--       Σ deductions − Σ additions (non-cancelled MKT ledger) = qty_approved
--   * Optimistic concurrency: the client sends the qty it saw for every
--     existing line (`expected_qty`); any mismatch → "please reload".
--   * Ticket status, created/delivery dates and last_action_* are untouched
--     (so the email trigger on tickets.status never fires).
--   * Trail: a `ticket_actions` row (action 'Edited', status 'edited') — it
--     feeds the Approval Trail and the audit_log trigger automatically.
--
-- Idempotent. Run AFTER 0023. Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Schema
-- ------------------------------------------------------------------
-- cs_transactions had no status column; edit rows need one so reports can
-- tell an 'Edit Return' reversal from a normal CS movement.
alter table public.cs_transactions add column if not exists status text;

create table if not exists public.ticket_edits (
  id          bigint generated always as identity primary key,
  ticket_id   text not null references public.tickets(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  remark      text not null,
  -- [{sku_id, sku_name, from, to, delta, action: added|removed|adjusted}]
  changes     jsonb not null default '[]'::jsonb
);
create index if not exists idx_ticket_edits_ticket on public.ticket_edits(ticket_id);

alter table public.ticket_edits enable row level security;
do $$
begin
  create policy "read ticket_edits" on public.ticket_edits for select to authenticated using (true);
exception when duplicate_object then null;
end $$;
grant select on public.ticket_edits to authenticated;

-- ------------------------------------------------------------------
-- 2. Helper: the CS catalog row that mirrors an MKT item — shared id
--    first, then the trimmed/lowercased name (same identity rule as
--    update_ticket_status 0019 block (b)). Locks the row it returns.
-- ------------------------------------------------------------------
create or replace function public.edit_ticket_cs_id(p_sku_id text, p_sku_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  select c.id into v_id from public.cs_skus c where c.id = p_sku_id for update;
  if v_id is null then
    select c.id into v_id
      from public.cs_skus c
     where lower(btrim(coalesce(c.name, ''))) = lower(btrim(coalesce(p_sku_name, '')))
     order by c.created_at nulls last
     limit 1
     for update;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.edit_ticket_cs_id(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 3. edit_ticket RPC
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

  -- ── optimistic concurrency: the client must have seen the current lines ──
  for v_item in
    select ti.sku_id, coalesce(ti.qty_approved, ti.qty_requested, 0) as cur
      from public.ticket_items ti where ti.ticket_id = p_ticket_id
  loop
    select e into v_e from jsonb_array_elements(p_items) e where e->>'sku_id' = v_item.sku_id;
    if v_e is null
       or case when jsonb_typeof(v_e->'expected_qty') = 'number'
               then (v_e->>'expected_qty')::numeric <> v_item.cur else true end then
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

    if v_ticket.type = 'cs_transfer' and v_delta < 0 then
      v_cs_id := public.edit_ticket_cs_id(v_sku_id, v_sku_name);
      select coalesce(c.current_stock, 0) into v_cs_stock from public.cs_skus c where c.id = v_cs_id;
      if v_cs_id is null or coalesce(v_cs_stock, 0) < -v_delta then
        return jsonb_build_object('success', false,
          'error', 'CS warehouse has only ' || public.nice_num(coalesce(v_cs_stock, 0))
                   || ' of "' || v_sku_name || '" — cannot take back ' || public.nice_num(-v_delta));
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
      values (p_ticket_id, v_sku_id, v_sku_name, v_qty, 'deduction', current_date,
              v_name, 'Edit Issue', v_note);
    else
      update public.skus set current_stock = coalesce(current_stock, 0) + v_qty where id = v_sku_id;
      if not found then raise exception 'Unknown item %', v_sku_id; end if;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_sku_id, v_sku_name, v_qty, 'addition', current_date,
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
        values (p_ticket_id, v_cs_id, v_sku_name, v_qty, 'addition', current_date,
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
        values (p_ticket_id, v_cs_id, v_sku_name, v_qty, 'deduction', current_date,
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

revoke execute on function public.edit_ticket(text, jsonb, text) from public, anon;
grant execute on function public.edit_ticket(text, jsonb, text) to authenticated;
