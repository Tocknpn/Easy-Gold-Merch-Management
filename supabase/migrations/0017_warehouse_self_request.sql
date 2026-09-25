-- ============================================================
-- Easy Gold Merch — 0017: Warehouse Manager self-request routing
-- ============================================================
-- Rule (aimed at the warehouse role ONLY):
--   When the person submitting a ticket IS a Warehouse Manager, the warehouse
--   review step is already satisfied — they are the reviewing authority. Such a
--   ticket is therefore created straight at status 'reviewed':
--     * the booking made at submission is CONFIRMED (qty_approved = requested),
--     * wh_comment / wh_comment_at explain why the step is already green,
--     * a 'Reviewed' row is written to ticket_actions (credited to the requester,
--       role 'warehouse') so the Approval Pipeline has a real actor + timestamp,
--     * the ticket lands in the LINE MANAGER's Action Center — never in the
--       Warehouse Manager's own queue, which previously forced a weird
--       self-approval round trip (create → review your own ticket → LM).
--   Staff / CS / Admin / other roles are untouched: they still start 'pending'
--   and are reviewed by the warehouse exactly as before.
--
-- The creator's role is resolved from the SIGNED-IN user (auth.uid()/auth.email())
-- so the routing rule cannot be spoofed by passing someone else's email in
-- p_created_by; p_created_by is only the fallback for seed/demo imports.
--
-- No signature, status or approval-qty change is introduced, so
-- system_config.engine_version deliberately stays at '0014' (the UI uses that
-- exact value to enable stock-based over-approval).
--
-- Idempotent. Run AFTER 0014 — paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. create_ticket — books stock on submission + routes warehouse managers
--    straight to the Line Manager.
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
  v_creator_role text;
  v_auto      boolean := false;
  v_auto_note text := 'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager';
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

  -- ── who is really asking? (drives the routing rule) ────────────
  select lower(btrim(u.role)) into v_creator_role
    from public.users u
   where u.id = auth.uid() or u.email = auth.email()
   limit 1;
  if v_creator_role is null or v_creator_role = '' then
    -- No JWT (seed / demo imports) → fall back to the passed-in identity.
    select lower(btrim(u.role)) into v_creator_role
      from public.users u
     where u.email = p_created_by or u.id::text = p_created_by
     limit 1;
  end if;
  v_auto := v_creator_role in ('warehouse', 'warehouse manager');


  -- ── create the ticket ──────────────────────────────────────────
  insert into public.tickets (id, created_by, created_by_name, department, delivery_date,
                              remark, status, type, return_date,
                              wh_comment, wh_comment_at,
                              last_action_at, last_action_by, last_action_status, last_action_comment)
  values (v_ticket_id, p_created_by, p_created_by_name, p_department, p_delivery_date,
          coalesce(p_remark, ''),
          case when v_auto then 'reviewed' else 'pending' end,
          p_type, p_return_date,
          case when v_auto then v_auto_note else null end,
          case when v_auto then now() else null end,
          now(), p_created_by_name,
          case when v_auto then 'Reviewed' else 'Pending' end,
          case when v_auto then v_auto_note else 'Ticket submitted' end);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'qty_requested')::numeric, 0) <= 0 then
      continue;
    end if;
    v_count := v_count + 1;
    insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric,
            -- the requester reviews their own booking → qty is confirmed as-is
            case when v_auto then (v_item->>'qty_requested')::numeric else null end,
            coalesce(v_item->>'unit', 'pcs'));

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

  -- Submission row (pipeline step 1) — always written, so the pipeline can show
  -- the requester's own role as the submitter.
  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (v_ticket_id, 'Created', 'pending', p_created_by_name,
          (select role from public.users u
            where u.email = p_created_by or u.id::text = p_created_by limit 1),
          'Ticket submitted');

  -- Warehouse Manager request → the review step is complete on arrival and is
  -- credited to the requester, so the trail and the pipeline stay truthful.
  if v_auto then
    insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
    values (v_ticket_id, 'Reviewed', 'reviewed', p_created_by_name, 'warehouse', v_auto_note);
  end if;

  return jsonb_build_object('success', true, 'id', v_ticket_id);
end;
$$;


-- ------------------------------------------------------------------
-- 2. One-off: re-route Warehouse Manager requests that are already open
-- ------------------------------------------------------------------
-- Tickets the Warehouse Manager submitted BEFORE this rule are sitting 'pending'
-- in their own Action Center (the create-then-self-approve round trip). Move
-- them to 'reviewed' so they join the Line Manager's queue too, and give each
-- one the matching 'Reviewed' trail row.
-- DELETE THIS BLOCK if you would rather leave existing tickets exactly as they
-- are (new tickets are routed correctly either way).
insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
select t.id, 'Reviewed', 'reviewed',
       coalesce(nullif(t.created_by_name, ''), 'Warehouse Manager'), 'warehouse',
       'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager'
  from public.tickets t
  join public.users u on (u.email = t.created_by or u.id::text = t.created_by)
 where t.status = 'pending'
   and lower(btrim(u.role)) in ('warehouse', 'warehouse manager')
   and not exists (
     select 1 from public.ticket_actions a
      where a.ticket_id = t.id and a.status = 'reviewed'
   );

update public.tickets t
   set status              = 'reviewed',
       wh_comment          = coalesce(nullif(t.wh_comment, ''),
                                     'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager'),
       wh_comment_at       = coalesce(t.wh_comment_at, now()),
       last_action_at      = now(),
       last_action_status  = 'Reviewed',
       last_action_comment = 'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager'
  from public.users u
 where (u.email = t.created_by or u.id::text = t.created_by)
   and t.status = 'pending'
   and lower(btrim(u.role)) in ('warehouse', 'warehouse manager');

-- ------------------------------------------------------------------
-- 3. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.create_ticket from public;
grant execute on function public.create_ticket to authenticated;

