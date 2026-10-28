-- Migration: 0023_keepalive_heartbeat.sql
-- Description: Heartbeat table and auto-pruning to keep Supabase active

create table if not exists public.project_heartbeat (
    id bigint generated always as identity primary key,
    source text not null default 'cron',
    pinged_at timestamptz not null default now()
);

-- Prune records older than 14 days
create or replace function public.prune_heartbeat()
returns trigger language plpgsql as $$
begin
    delete from public.project_heartbeat
    where pinged_at < now() - interval '14 days';
    return new;
end;
$$;

drop trigger if exists trg_prune_heartbeat on public.project_heartbeat;
create trigger trg_prune_heartbeat
after insert on public.project_heartbeat
for each statement execute function public.prune_heartbeat();

-- RLS setup
alter table public.project_heartbeat enable row level security;

drop policy if exists "Allow insert heartbeat" on public.project_heartbeat;
create policy "Allow insert heartbeat"
on public.project_heartbeat
for insert
with check (true);

drop policy if exists "Allow read heartbeat" on public.project_heartbeat;
create policy "Allow read heartbeat"
on public.project_heartbeat
for select
using (true);

