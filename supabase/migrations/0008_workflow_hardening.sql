-- ============================================================
-- Easy Gold Merch — Workflow hardening + over-approval cap
-- Part 8 (run AFTER 0007_booking_at_creation.sql)
--
-- 1) RESTRUCTURE update_ticket_status so the cs_transfer / rejected /
--    recalled / returned effect blocks are NOT nested inside the
--    PENDING→REVIEWED branch. In 0007 those blocks were accidentally
--    placed inside the booking true-up block, so on the live DB they
--    only ran when the transition was 'reviewed' — i.e. cs_transfer
--    never credited the CS warehouse, and reject/recall never returned
--    stock. The demo engine always matched the intended spec.
--
-- 2) ENFORCE the caller's REAL role from the signed-in JWT
--    (auth.uid() / auth.email() → public.users.role) instead of trusting
--    p_meta->>'actor_role', so staff can't approve, LM can't finalize,
--    and an anonymous caller can't mutate anything.
--
-- 3) CAP qty_approved AT qty_requested during review so the warehouse
--    can no longer approve (and book) MORE than was requested, which
--    silently stole availability from other submitters.
--
-- 4) Restrict EXECUTE to authenticated for every write RPC. The 0001
--    `revoke execute on all functions ... from public` ran BEFORE the
--    functions existed (0002+), so they were created under the default
--    PUBLIC-execute grant → the anon key could call them. This migration
--    revokes PUBLIC and grants authenticated only.
-- ============================================================

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

  -- ── role authorization per transition (mirror of Action Center) ──
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
    v_allowed := v_ticket.status in ('reviewed','lm_approved');
  elsif p_status = 'returned' then
    v_allowed := v_ticket.status = 'finalized' and v_ticket.type = 'borrow';
  end if;

  if not v_allowed then
    return jsonb_build_object('success', false,
      'error', 'Illegal transition: ' || v_ticket.status || ' -> ' || p_status);
  end if;

  -- ── EFFECTS ────────────────────────────────────────────────────

  -- 1) PENDING → REVIEWED : confirm the booking made at submission.
  --    Only true-up to the approved qty — never deduct twice.
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

  -- 2) LM_APPROVED → FINALIZED for cs_transfer : auto-restock CS warehouse
  if p_status = 'finalized' and v_ticket.type = 'cs_transfer' then
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

  -- 3) REJECTED / RECALLED : return booked stock (addition)
  if p_status in ('rejected','recalled') and v_ticket.status in ('pending','reviewed','lm_approved') then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      if v_ticket.status = 'pending' then
        -- rejected before review → release the booking made at submission
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
        v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
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

-- ── Restrict write RPCs to authenticated sessions only ──────────────────────
-- 0001 revoked PUBLIC execute BEFORE these functions were created (0002–0007),
-- so each one inherited the default PUBLIC execute grant → the anon key could
-- call them. Revoke from PUBLIC (covers anon) then grant authenticated only.
revoke execute on function public.create_ticket from public;
revoke execute on function public.update_ticket_status from public;
revoke execute on function public.manage_sku from public;
revoke execute on function public.manage_cs_sku from public;
revoke execute on function public.manage_config from public;
revoke execute on function public.manage_category from public;
revoke execute on function public.add_remark from public;
revoke execute on function public.set_sku_image from public;

grant execute on function public.create_ticket to authenticated;
grant execute on function public.update_ticket_status to authenticated;
grant execute on function public.manage_sku to authenticated;
grant execute on function public.manage_cs_sku to authenticated;
grant execute on function public.manage_config to authenticated;
grant execute on function public.manage_category to authenticated;
grant execute on function public.add_remark to authenticated;
grant execute on function public.set_sku_image to authenticated;