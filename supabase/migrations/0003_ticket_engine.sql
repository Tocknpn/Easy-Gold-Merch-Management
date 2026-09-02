-- ============================================================
-- Easy Gold Merch — Ticket Engine (create + state machine)
-- Part 3: create_ticket + update_ticket_status
-- Run AFTER 0002_functions.sql
-- ============================================================

-- ------------------------------------------------------------------
-- Create a ticket with its items. Stock is NOT touched here.
-- status starts at 'pending'. type: 'request' | 'borrow' | 'cs_transfer'
-- ------------------------------------------------------------------
create or replace function public.create_ticket(
  p_created_by text,
  p_created_by_name text,
  p_department text,
  p_delivery_date date,
  p_remark text,
  p_type text default 'request',
  p_return_date date default null,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id text := public.next_id('TKT-');
  v_item jsonb;
  v_count int := 0;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('success', false, 'error', 'Ticket must have at least one item');
  end if;

  insert into public.tickets (id, created_by, created_by_name, department, delivery_date,
                              remark, status, type, return_date)
  values (v_ticket_id, p_created_by, p_created_by_name, p_department, p_delivery_date,
          coalesce(p_remark, ''), 'pending', p_type, p_return_date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'qty_requested')::numeric, 0) <= 0 then
      continue;
    end if;
    v_count := v_count + 1;
    insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, unit)
    values (v_ticket_id, v_item->>'sku_id', v_item->>'sku_name',
            (v_item->>'qty_requested')::numeric, coalesce(v_item->>'unit', 'pcs'));
  end loop;

  if v_count = 0 then
    delete from public.tickets where id = v_ticket_id;
    return jsonb_build_object('success', false, 'error', 'No items with a quantity greater than 0');
  end if;

  insert into public.ticket_actions (ticket_id, action, status, action_by, role, comment)
  values (v_ticket_id, 'Created', 'pending', p_created_by_name,
          (select role from public.users u where u.email = p_created_by or u.id::text = p_created_by),
          'Ticket submitted');

  return jsonb_build_object('success', true, 'id', v_ticket_id);
end;
$$;