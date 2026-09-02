-- ============================================================
-- Easy Gold Merch — Ticket State Machine (the heart of the app)
-- Part 4: update_ticket_status with stock accounting
-- Run AFTER 0003_ticket_engine.sql
-- ============================================================

-- ------------------------------------------------------------------
-- update_ticket_status
--   p_ticket_id : the TKT id
--   p_status    : 'reviewed' | 'lm_approved' | 'finalized' |
--                 'rejected' | 'recalled' | 'returned'
--   p_meta      : jsonb {
--       actor_name, actor_role, comment,
--       actual_delivery_date,            -- set at review
--       items:  [{ sku_id, qty_approved }],   -- review may change qty
--       returns:[{ sku_id, qty_returned, qty_broken }], -- borrow return
--       force_finalize: true             -- admin emergency finalize
--   }
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
  v_role  text := coalesce(p_meta->>'actor_role', '');
  v_comment text := coalesce(p_meta->>'comment', '');
  v_item record;
  v_qty numeric;
  v_qty_approved numeric;
  v_ret numeric;
  v_broken numeric;
  v_mkt record;
  v_cs record;
  v_status_label text;
  v_allowed boolean := false;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ticket not found');
  end if;

  -- ── validate the transition ─────────────────────────────────────
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
-- ── EFFECTS ────────────────────────────────────────────────────

  -- 1) PENDING → REVIEWED : book (deduct) stock, set actual delivery date
  if p_status = 'reviewed' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_requested, ti.qty_approved, ti.unit
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      -- approved qty may have been adjusted by the warehouse at review
      v_qty := coalesce((select (e->>'qty_approved')::numeric
                          from jsonb_array_elements(coalesce(p_meta->>'items', '[]'::jsonb)) e
                         where e->>'sku_id' = v_item.sku_id), v_item.qty_approved, v_item.qty_requested);
      if v_qty <= 0 then
        update public.ticket_items set qty_approved = 0
         where ticket_id = p_ticket_id and sku_id = v_item.sku_id;
        continue;
      end if;
      update public.ticket_items set qty_approved = v_qty
       where ticket_id = p_ticket_id and sku_id = v_item.sku_id;

      select * into v_mkt from public.skus where id = v_item.sku_id;
      if found then
        update public.skus set current_stock = greatest(current_stock - v_qty, 0)
         where id = v_item.sku_id;
      end if;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_qty, 'deduction', current_date,
              v_actor, 'Booked', 'Stock booked on review');
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
  if p_status in ('rejected','recalled') and v_ticket.status in ('reviewed','lm_approved') then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
      if v_qty <= 0 then continue; end if;
      update public.skus set current_stock = current_stock + v_qty
       where id = v_item.sku_id;
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (p_ticket_id, v_item.sku_id, v_item.sku_name, v_qty, 'addition', current_date,
              v_actor,
              case when p_status = 'rejected' then 'Rejected - Stock Returned'
                   else 'Recalled - Stock Returned' end,
              coalesce(v_comment, ''));
    end loop;
  end if;

  -- 4) FINALIZED → RETURNED (borrow only) : return items recorded
  if p_status = 'returned' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
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
         lm_comment = case when p_status in ('lm_approved','finalized') and v_role = 'line_manager'
                           then coalesce(v_comment, lm_comment) else lm_comment end,
         director_comment = case when p_status in ('lm_approved','finalized') and v_role = 'director'
                                 then coalesce(v_comment, director_comment) else director_comment end,
         actual_delivery_date = coalesce(
           nullif(p_meta->>'actual_delivery_date', '')::date, actual_delivery_date),
         actual_return_date = case when p_status = 'returned' then current_date else actual_return_date end
   where id = p_ticket_id;

  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (p_ticket_id, v_status_label, p_status, v_actor, v_role, coalesce(v_comment, ''));

  return jsonb_build_object('success', true, 'id', p_ticket_id, 'status', p_status,
                            'message', 'Ticket ' || p_ticket_id || ' → ' || v_status_label);
end;
$$;
    loop
      v_ret   := coalesce((select (e->>'qty_returned')::numeric
                            from jsonb_array_elements(coalesce(p_meta->>'returns', '[]'::jsonb)) e
                           where e->>'sku_id' = v_item.sku_id), v_item.qty_approved, v_item.qty_requested, 0);
      v_broken := coalesce((select (e->>'qty_broken')::numeric
                            from jsonb_array_elements(coalesce(p_meta->>'returns', '[]'::jsonb)) e
                           where e->>'sku_id' = v_item.sku_id), 0);
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
    return jsonb_build_object('success', false,
      'error', 'Illegal transition: ' || v_ticket.status || ' → ' || p_status);
  end if;