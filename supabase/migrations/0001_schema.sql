-- ============================================================
-- Easy Gold Merch Management — Supabase schema (blue edition)
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ------------------------------------------------------------------
-- 1. TABLES  (mirrors the legacy Google Sheets structure)
-- ------------------------------------------------------------------

create table if not exists public.users (
  id           uuid primary key,
  username     text,
  email        text unique not null,
  full_name    text,
  department   text,
  role         text not null default 'staff',
  status       text not null default 'Active'
);

create table if not exists public.skus (
  id                 text primary key,
  name               text not null,
  category           text,
  unit               text default 'pcs',
  opening_balance    numeric default 0,
  current_stock      numeric default 0,
  total_inflow       numeric default 0,
  image_url          text,
  low_stock_threshold numeric default 0,
  cost_per_unit      numeric default 0,
  created_at         timestamptz default now()
);

create table if not exists public.tickets (
  id                   text primary key,
  created_by           text,
  created_by_name      text,
  department           text,
  delivery_date        date,
  remark               text,
  status               text not null default 'pending',
  type                 text not null default 'request',
  return_date          date,
  created_at           timestamptz default now(),
  wh_comment           text,
  lm_comment           text,
  director_comment     text,
  last_action_at       timestamptz,
  last_action_by       text,
  last_action_status   text,
  last_action_comment  text,
  actual_delivery_date date,
  actual_return_date   date
);

create table if not exists public.ticket_items (
  ticket_id    text references public.tickets(id) on delete cascade,
  sku_id       text,
  sku_name     text,
  qty_requested numeric default 0,
  qty_approved  numeric,
  unit         text,
  primary key (ticket_id, sku_id)
);

create table if not exists public.stock_transactions (
  id          bigint generated always as identity primary key,
  ticket_id   text,
  sku_id      text,
  sku_name    text,
  qty         numeric default 0,
  qty_broken  numeric default 0,
  type        text check (type in ('addition','deduction')),
  date        date,
  action_at   timestamptz default now(),
  action_by   text,
  status      text,
  comment     text
);

create table if not exists public.ticket_actions (
  id        bigint generated always as identity primary key,
  ticket_id text,
  action    text,
  status    text,
  action_at timestamptz default now(),
  action_by text,
  comment   text,
  role      text
);

create table if not exists public.system_config (
  key         text primary key,
  value       text,
  description text
);

create table if not exists public.categories (
  name text primary key
);

create table if not exists public.sku_remarks (
  id         bigint generated always as identity primary key,
  sku_id     text,
  remark     text,
  user_name  text,
  user_role  text,
  created_at timestamptz default now()
);

create table if not exists public.settings_log (
  id         bigint generated always as identity primary key,
  action     text,
  done_by    text,
  role       text,
  details    text,
  created_at timestamptz default now()
);

-- CS (Customer Service) warehouse
create table if not exists public.cs_skus (
  id                 text primary key,
  name               text not null,
  category           text,
  unit               text default 'pcs',
  opening_balance    numeric default 0,
  current_stock      numeric default 0,
  total_inflow       numeric default 0,
  image_url          text,
  low_stock_threshold numeric default 0,
  cost_per_unit      numeric default 0,
  created_at         timestamptz default now()
);

-- ------------------------------------------------------------------
-- 2. INDEXES (fast ticket queues + reports)
-- ------------------------------------------------------------------
create index if not exists idx_tickets_status     on public.tickets(status);
create index if not exists idx_tickets_created_by on public.tickets(created_by);
create index if not exists idx_ticket_items_ticket on public.ticket_items(ticket_id);
create index if not exists idx_tx_sku             on public.stock_transactions(sku_id);
create index if not exists idx_tx_date            on public.stock_transactions(date);
create index if not exists idx_cstx_sku           on public.cs_transactions(sku_id);
create index if not exists idx_cstx_date          on public.cs_transactions(date);

-- ------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--    Authenticated users may READ everything. All WRITES go through
--    the RPC functions below (security definer) so the stock
--    accounting business rules are always enforced server-side.
-- ------------------------------------------------------------------
alter table public.users             enable row level security;
alter table public.skus              enable row level security;
alter table public.tickets           enable row level security;
alter table public.ticket_items      enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.ticket_actions    enable row level security;
alter table public.system_config     enable row level security;
alter table public.categories        enable row level security;
alter table public.sku_remarks       enable row level security;
alter table public.settings_log      enable row level security;
alter table public.cs_skus           enable row level security;
alter table public.cs_transactions   enable row level security;

do $$
begin
  create policy "read users"             on public.users              for select to authenticated using (true);
  create policy "read skus"              on public.skus               for select to authenticated using (true);
  create policy "read tickets"           on public.tickets            for select to authenticated using (true);
  create policy "read ticket_items"      on public.ticket_items       for select to authenticated using (true);
  create policy "read transactions"      on public.stock_transactions for select to authenticated using (true);
  create policy "read ticket_actions"    on public.ticket_actions     for select to authenticated using (true);
  create policy "read config"            on public.system_config      for select to authenticated using (true);
  create policy "read categories"        on public.categories         for select to authenticated using (true);
  create policy "read remarks"           on public.sku_remarks        for select to authenticated using (true);
  create policy "read settings_log"      on public.settings_log       for select to authenticated using (true);
  create policy "read cs_skus"           on public.cs_skus            for select to authenticated using (true);
  create policy "read cs_transactions"   on public.cs_transactions    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

-- Lock down default function execution (RPC only for authenticated users)
revoke execute on all functions in schema public from public;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- ID generator helper: same format as the legacy data (TKT-<epoch ms>, sku-<epoch ms>)
create or replace function public.next_id(prefix text)
returns text
language sql
immutable
as $$
  select prefix || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
$$;