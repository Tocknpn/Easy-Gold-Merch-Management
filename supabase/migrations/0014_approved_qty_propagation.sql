-- ============================================================
-- Easy Gold Merch â€” 0014: Approved-qty propagation
-- ============================================================
-- Fixes: an approved quantity set by the warehouse (or any later approver) was
-- never honoured end-to-end â€” the UI, the payload AND this engine all silently
-- capped the approved qty at the REQUESTED quantity, so "15 requested â†’ 20
-- approved" came back out as 15 everywhere (the LM saw 15, final Stock Out 15).
--
-- New rule (matches src/lib/demoMutations.ts + the Action Center UI):
--   * Any approval step (reviewed / lm_approved / finalized) may set the qty.
--     The LAST value wins and it is what gets booked / deducted at finalize.
--   * The ceiling is what is actually AVAILABLE =
--         current_stock + (already-booked-for-this-item)
--     (the booking is already deducted from current_stock). Approving MORE than
--     the request is allowed up to that ceiling; 0 still means "nothing approved
--     â†’ release the booking".
--   * When a qty changes, "approved qty: X -> Y" is appended to the comment so
--     the audit trail (and the requester) show the final number.
--   * Sets system_config.engine_version = '0014' â€” the UI reads this to allow
--     stock-based over-approval (and stays capped at the request otherwise, so a
--     frontend-only deploy can never silently drop an over-approval again).
--
-- Idempotent. Run AFTER 0013 (this re-asserts update_ticket_status with the
-- modified approval logic) â€” paste into the Supabase SQL Editor and run.
-- ============================================================

-- 4. update_ticket_status - booking-aware FLAT state machine
--    (same as 0012, plus:)
--      * REJECT / RECALL cancels the booking and restores the stock but
--        NO LONGER writes a reversal `addition` row. That phantom row was
--        counted as Stock In for a ticket that never moved stock, which
--        made the Stock In / Stock Out reports look wrong.
--        The cancelled booking keeps the audit trail (status
--        'Booking Cancelled' + comment) and is ignored by the reports.
--      * wh_comment_at / lm_comment_at / director_comment_at are stamped
--        whenever that level writes its comment.
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
  v_comment text := coalesce(p_meta->>'comment', '');
  -- p_meta JSON arrays arrive as text; coalescing text with '[]'::jsonb
  -- raises SQLSTATE 42804, so normalise them type-safely up front.
  v_items   jsonb := case when jsonb_typeof(p_meta->'items')   = 'array'
                          then p_meta->'items'   else '[]'::jsonb end;
  v_returns jsonb := case when jsonb_typeof(p_meta->'returns') = 'array'
                          then p_meta->'returns' else '[]'::jsonb end;
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
  v_stock numeric := 0;
  v_note text := '';
  v_cancel_note text;
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

  -- ── normalize the caller role (mirror of frontend roleFromRaw) ──
  v_caller_role := lower(btrim(v_caller_role));
  v_caller_role := case
    when v_caller_role in ('warehouse', 'warehouse manager') then 'warehouse'
    when v_caller_role in ('line manager', 'line_manager')   then 'line_manager'
    when v_caller_role = 'customer service'                  then 'customer_service'
    else v_caller_role
  end;

  -- ── role authorization per transition ──────────────────────────
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
    v_allowed := v_ticket.status in ('pending','reviewed','lm_approved');
  elsif p_status = 'returned' then
    v_allowed := v_ticket.status = 'finalized' and v_ticket.type = 'borrow';
  end if;

  if not v_allowed then
    return jsonb_build_object('success', false,
      'error', 'Illegal transition: ' || v_ticket.status || ' -> ' || p_status);
  end if;

  -- ═══ EFFECTS (each transition block is an independent sibling) ═══
  -- 1) PENDING → REVIEWED : confirm the booking made at submission.
  --    Only true-up to the approved qty (never deduct twice).
  if p_status in ('reviewed','lm_approved','finalized') then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_requested, ti.qty_approved, ti.unit
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_qty := coalesce((select (e->>'qty_approved')::numeric
                          from jsonb_array_elements(v_items) e
                         where e->>'sku_id' = v_item.sku_id), nullif(v_item.qty_approved, 0), v_item.qty_requested);
      -- (the over-approval cap is applied below, once the booked qty is known)

      select st.id, st.qty into v_book_id, v_booked
        from public.stock_transactions st
       where st.ticket_id = p_ticket_id and st.sku_id = v_item.sku_id
         and st.type = 'deduction' and st.status = 'Booked'
       order by st.id desc limit 1;

      -- Ceiling = current stock + what this item already booked (the booking is
      -- already deducted from current_stock). Over-approval beyond the request
      -- is allowed up to that ceiling â€” never more than exists in stock.
      select greatest(coalesce(current_stock, 0), 0) into v_stock
        from public.skus where id = v_item.sku_id;
      v_stock := coalesce(v_stock, 0);
      v_qty := least(greatest(coalesce(v_qty, 0), 0), v_stock + coalesce(v_booked, 0));

      if v_qty is null or v_qty <= 0 then
        -- nothing approved → release whatever was booked
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
      if v_qty is not null and v_qty > 0 and v_qty <> v_booked then
        v_note := v_note || case when v_note = '' then '' else '; ' end
               || v_item.sku_name || ' ' || coalesce(v_booked::text, '0') || ' -> ' || v_qty::text;
      end if;
      v_book_id := null;
    end loop;
  end if;

  -- 2) LM_APPROVED → FINALIZED:
  --      a) convert the MKT booking from 'Booked' → 'Deducted'
  --      b) for cs_transfer, auto-restock the CS warehouse
  if p_status = 'finalized' then
    -- (a) Book → Deduct on the confirmed MKT booking
    update public.stock_transactions
       set status = 'Deducted',
           comment = 'Stock deducted on finalize'
     where ticket_id = p_ticket_id
       and type = 'deduction' and status = 'Booked';

    -- (b) CS warehouse receives the stock
    if v_ticket.type = 'cs_transfer' then
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
  end if;

  -- 3) REJECTED / RECALLED : return the booked stock to the MKT WH
  --    CHANGED (0013): the booking is CANCELLED and the stock is restored,
  --    but no reversal `addition` row is written any more. The report maths
  --    treats a cancelled booking as non-existent, so a rejected/recalled
  --    ticket no longer shows a phantom Stock In (and the paired Stock Out
  --    of the booking disappears with it), keeping Stock In / Stock Out
  --    reporting clean. The cancelled row keeps the audit trail.
  if p_status in ('rejected','recalled') and v_ticket.status in ('pending','reviewed','lm_approved') then
    v_cancel_note := case when p_status = 'rejected' then 'ticket rejected' else 'ticket recalled' end;
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      if v_ticket.status = 'pending' then
        -- rejected/recalled before review → release the booking made at submission
        select st.id, st.qty into v_book_id, v_booked
          from public.stock_transactions st
         where st.ticket_id = p_ticket_id and st.sku_id = v_item.sku_id
           and st.type = 'deduction' and st.status = 'Booked'
         order by st.id desc limit 1;
        v_qty := coalesce(v_booked, 0);
        update public.stock_transactions
           set status = 'Booking Cancelled',
               comment = 'Booking released - ' || v_cancel_note
         where id = v_book_id;
        v_book_id := null;
      else
        -- reviewed/lm_approved → qty is already deducted from stock;
        -- cancel the confirmed booking and return the stock
        v_qty := coalesce(v_item.qty_approved, v_item.qty_requested);
        update public.stock_transactions
           set status = 'Booking Cancelled',
               comment = 'Booking cancelled - ' || v_cancel_note
         where ticket_id = p_ticket_id and sku_id = v_item.sku_id
           and type = 'deduction' and status = 'Booked';
        if not found then
          -- ledger rows written by an older engine (other status labels)
          update public.stock_transactions
             set status = 'Booking Cancelled',
                 comment = 'Booking cancelled - ' || v_cancel_note
           where ticket_id = p_ticket_id and sku_id = v_item.sku_id
             and type = 'deduction'
             and coalesce(status, '') not in ('Booking Cancelled', 'Deducted');
        end if;
      end if;
      if v_qty is null or v_qty <= 0 then continue; end if;
      update public.skus set current_stock = current_stock + v_qty
       where id = v_item.sku_id;
    end loop;
  end if;

  -- 4) FINALIZED → RETURNED (borrow only): return items recorded
  if p_status = 'returned' then
    for v_item in
      select ti.sku_id, ti.sku_name, ti.qty_approved, ti.qty_requested
        from public.ticket_items ti where ti.ticket_id = p_ticket_id
    loop
      v_ret   := coalesce((select (e->>'qty_returned')::numeric
                            from jsonb_array_elements(v_returns) e
                           where e->>'sku_id' = v_item.sku_id), v_item.qty_approved, v_item.qty_requested, 0);
      v_broken := coalesce((select (e->>'qty_broken')::numeric
                             from jsonb_array_elements(v_returns) e
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
  -- Record any approved-qty changes in the comment so the trail (and the
  -- requester) can see why the final number differs from the request.
  if v_note <> '' then
    v_comment := v_comment || case when coalesce(v_comment, '') = '' then '' else ' Â· ' end
                || 'approved qty: ' || v_note;
  end if;

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
         -- per-level comment timestamps (My Ticket modal shows these)
         wh_comment_at = case when p_status = 'reviewed' and coalesce(v_comment, '') <> ''
                              then now() else wh_comment_at end,
         lm_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'line_manager'
                           then coalesce(v_comment, lm_comment) else lm_comment end,
         lm_comment_at = case when p_status in ('lm_approved','finalized') and v_caller_role = 'line_manager'
                               and coalesce(v_comment, '') <> ''
                              then now() else lm_comment_at end,
         director_comment = case when p_status in ('lm_approved','finalized') and v_caller_role = 'director'
                                 then coalesce(v_comment, director_comment) else director_comment end,
         director_comment_at = case when p_status in ('lm_approved','finalized') and v_caller_role = 'director'
                                     and coalesce(v_comment, '') <> ''
                                    then now() else director_comment_at end,
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

-- ------------------------------------------------------------------

-- 6. Re-assert the RPC grants (authenticated sessions only)
-- ------------------------------------------------------------------
revoke execute on function public.create_ticket from public;
revoke execute on function public.update_ticket_status from public;
revoke execute on function public.manage_sku from public;
revoke execute on function public.manage_cs_sku from public;

grant execute on function public.create_ticket to authenticated;
grant execute on function public.update_ticket_status to authenticated;
grant execute on function public.manage_sku to authenticated;
grant execute on function public.manage_cs_sku to authenticated;

-- ------------------------------------------------------------------
-- 7. Mark the engine version so the UI enables stock-based over-approval.
-- ------------------------------------------------------------------
insert into public.system_config (key, value, description)
values ('engine_version', '0014',
        'Approved-qty propagation: review / LM / director may approve up to '
        'available stock (over-approval allowed); last value wins.')
on conflict (key) do update set value = excluded.value, description = excluded.description;