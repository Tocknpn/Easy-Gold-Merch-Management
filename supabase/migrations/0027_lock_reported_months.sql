-- ════════════════════════════════════════════════════════════════════
-- 0027 — Lock reported months (Finance: Opening(M) = Closing(M−1))
-- ════════════════════════════════════════════════════════════════════
-- Every month BEFORE the current month (Asia/Vientiane) counts as already
-- reported to Finance. Nothing may be written into it any more, so a Month
-- End Report you printed never changes afterwards.
--
-- Enforced by a guard trigger on both ledgers (covers every write path —
-- tickets, SKU forms, Stock In/Out, ledger corrections):
--
--   INSERT dated before the current month
--     * manual entries (OPENING from the SKU form, RESTOCK, DIRECT_DESTOCK,
--       Restock / Destock) → REFUSED ("month closed")
--     * ticket rows (booking, Edit Issue / Edit Return / Edit Receipt,
--       transfer receipts) → re-dated to TODAY, i.e. the correction lands in
--       the current month instead of rewriting the past
--
--   UPDATE of a row dated before the current month
--     * status / comment / name / edit stamps → allowed (audit only)
--     * booking → 'Booking Cancelled' (late reject / recall / nothing
--       approved) → the booking stays counted in its month (status
--       'Deducted') and a 'Cancel Return' addition dated TODAY gives the
--       stock back (Stock In this month)
--     * qty change on a ticket row (review approves a different qty,
--       ledger correction) → qty kept; the difference is written as an
--       'Edit Issue' (more) / 'Edit Return' (less) row dated TODAY
--     * qty change on a manual row, any date / type / SKU change, or moving a
--       row INTO a past month → REFUSED
--
--   DELETE of a row dated before the current month → REFUSED
--
-- Maintenance escape hatch (SQL Editor only):
--   set local app.ledger_unlock = 'on';   -- inside a transaction
-- Existing rows are not touched.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.vientiane_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Vientiane')::date;
$$;

-- First day of the current (open) month — everything before it is reported.
create or replace function public.reporting_period_start()
returns date language sql stable as $$
  select date_trunc('month', public.vientiane_today())::date;
$$;

create or replace function public.ledger_month_closed_error(p_date date)
returns text language sql stable as $$
  select 'Month closed: ' || to_char(p_date, 'YYYY-MM-DD')
      || ' is in a month already reported to Finance (before '
      || to_char(public.reporting_period_start(), 'YYYY-MM-DD')
      || '). Record the correction as a Stock In / Stock Out dated this month.';
$$;

-- A manual (non-ticket) ledger entry: the SKU form's opening balance,
-- Stock In / Stock Out. A CS item created by a transfer arrival is also stamped
-- 'OPENING' but comes from a ticket ("Auto-transferred ...").
create or replace function public.ledger_is_manual(p_ticket_id text, p_status text, p_comment text)
returns boolean language sql immutable as $$
  select (coalesce(p_ticket_id, '') in ('OPENING', 'RESTOCK', 'DIRECT_DESTOCK')
          or coalesce(p_status, '') in ('Opening', 'Opening Balance', 'Restock', 'Destock'))
     and coalesce(p_comment, '') not ilike 'Auto-transferred%';
$$;

create or replace function public.ledger_unlocked()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.ledger_unlock', true), '') = 'on';
$$;

-- ── MKT ledger ───────────────────────────────────────────────────────
create or replace function public.guard_stock_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start  date := public.reporting_period_start();
  v_today  date := public.vientiane_today();
  v_net    numeric;
  v_delta  numeric;
  v_is_ticket boolean;
begin
  if public.ledger_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.date is null or new.date >= v_start then return new; end if;
    if public.ledger_is_manual(new.ticket_id, new.status, new.comment) then
      raise exception '%', public.ledger_month_closed_error(new.date);
    end if;
    new.date := v_today;               -- ticket correction → this month
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.date is not null and old.date < v_start then
      raise exception '%', public.ledger_month_closed_error(old.date);
    end if;
    return old;
  end if;

  -- UPDATE
  if (old.date is null or old.date >= v_start) and (new.date is null or new.date >= v_start) then
    return new;
  end if;
  if new.date is distinct from old.date then
    raise exception '%', public.ledger_month_closed_error(least(coalesce(old.date, new.date), coalesce(new.date, old.date)));
  end if;
  if new.type is distinct from old.type or new.sku_id is distinct from old.sku_id
     or new.ticket_id is distinct from old.ticket_id
     or coalesce(new.qty_broken, 0) is distinct from coalesce(old.qty_broken, 0) then
    raise exception '%', public.ledger_month_closed_error(old.date);
  end if;

  v_is_ticket := old.ticket_id is not null
                 and exists (select 1 from public.tickets k where k.id = old.ticket_id);

  -- Late cancel: the booking stays in its reported month, stock comes back today.
  if lower(coalesce(new.status, '')) in ('booking cancelled', 'cancelled', 'reversed')
     and lower(coalesce(old.status, '')) not in ('booking cancelled', 'cancelled', 'reversed') then
    if not v_is_ticket then
      raise exception '%', public.ledger_month_closed_error(old.date);
    end if;
    -- give back everything this ticket still holds of the SKU (booking + edits)
    select coalesce(sum(case when st.type = 'deduction' then st.qty else -st.qty end), 0)
      into v_net
      from public.stock_transactions st
     where st.ticket_id = old.ticket_id and st.sku_id = old.sku_id and st.id <> old.id
       and lower(coalesce(st.status, '')) not in ('booking cancelled', 'cancelled', 'reversed');
    v_net := v_net + (case when old.type = 'deduction' then old.qty else -old.qty end);
    if v_net > 0 then
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (old.ticket_id, old.sku_id, old.sku_name, v_net, 'addition', v_today,
              coalesce(new.action_by, old.action_by), 'Cancel Return',
              coalesce(new.comment, 'Ticket cancelled') || ' (booking of '
              || to_char(old.date, 'YYYY-MM-DD') || ' already reported — returned this month)');
    end if;
    new.status := case when old.status = 'Booked' then 'Deducted' else old.status end;
    new.qty    := old.qty;
    return new;
  end if;

  -- Quantity change on a reported row → post the difference today.
  if new.qty is distinct from old.qty then
    if not v_is_ticket then
      raise exception '%', public.ledger_month_closed_error(old.date);
    end if;
    -- signed change in stock-out terms (deduction grows = more issued)
    v_delta := (coalesce(new.qty, 0) - coalesce(old.qty, 0))
               * case when old.type = 'deduction' then 1 else -1 end;
    if v_delta <> 0 then
      insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                             action_by, status, comment)
      values (old.ticket_id, old.sku_id, old.sku_name, abs(v_delta),
              case when v_delta > 0 then 'deduction' else 'addition' end, v_today,
              coalesce(new.action_by, old.action_by),
              case when v_delta > 0 then 'Edit Issue' else 'Edit Return' end,
              'Qty ' || old.qty || ' → ' || new.qty || ' on a row dated '
              || to_char(old.date, 'YYYY-MM-DD') || ' (reported month) — posted this month');
    end if;
    new.qty := old.qty;
  end if;
  return new;
end;
$$;

-- ── CS ledger (no booking / cancel flow; no qty_broken) ──────────────
create or replace function public.guard_cs_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := public.reporting_period_start();
  v_today date := public.vientiane_today();
  v_delta numeric;
begin
  if public.ledger_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.date is null or new.date >= v_start then return new; end if;
    if public.ledger_is_manual(new.ticket_id, new.status, new.comment) then
      raise exception '%', public.ledger_month_closed_error(new.date);
    end if;
    new.date := v_today;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.date is not null and old.date < v_start then
      raise exception '%', public.ledger_month_closed_error(old.date);
    end if;
    return old;
  end if;

  if (old.date is null or old.date >= v_start) and (new.date is null or new.date >= v_start) then
    return new;
  end if;
  if new.date is distinct from old.date or new.type is distinct from old.type
     or new.sku_id is distinct from old.sku_id or new.ticket_id is distinct from old.ticket_id then
    raise exception '%', public.ledger_month_closed_error(least(coalesce(old.date, new.date), coalesce(new.date, old.date)));
  end if;
  if new.qty is distinct from old.qty then
    if old.ticket_id is null
       or not exists (select 1 from public.tickets k where k.id = old.ticket_id) then
      raise exception '%', public.ledger_month_closed_error(old.date);
    end if;
    -- signed change in stock-in terms (addition grows = more received)
    v_delta := (coalesce(new.qty, 0) - coalesce(old.qty, 0))
               * case when old.type = 'addition' then 1 else -1 end;
    if v_delta <> 0 then
      insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date,
                                          action_by, status, comment)
      values (old.ticket_id, old.sku_id, old.sku_name, abs(v_delta),
              case when v_delta > 0 then 'addition' else 'deduction' end, v_today,
              coalesce(new.action_by, old.action_by),
              case when v_delta > 0 then 'Edit Receipt' else 'Edit Return' end,
              'Qty ' || old.qty || ' → ' || new.qty || ' on a row dated '
              || to_char(old.date, 'YYYY-MM-DD') || ' (reported month) — posted this month');
    end if;
    new.qty := old.qty;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_stock_transactions on public.stock_transactions;
create trigger trg_guard_stock_transactions
  before insert or update or delete on public.stock_transactions
  for each row execute function public.guard_stock_transactions();

drop trigger if exists trg_guard_cs_transactions on public.cs_transactions;
create trigger trg_guard_cs_transactions
  before insert or update or delete on public.cs_transactions
  for each row execute function public.guard_cs_transactions();

