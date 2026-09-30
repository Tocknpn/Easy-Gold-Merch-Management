-- ══════════════════════════════════════════════════════════════════════════
-- 0020 — Ticket notification emails
--
-- Adds the delivery half of the workflow: every ticket status change pushes a
-- notification through the `send-ticket-email` Edge Function, which resolves
-- the recipients from public.users, renders the mail and sends it via the
-- Google Apps Script relay (or any HTTP provider) — so the mail leaves from
-- the company Gmail address.
--
--   tickets row created / status updated
--     → trg_tickets_email_notify            (AFTER INSERT OR UPDATE OF status)
--        → dispatch_ticket_email()          (reads config + vault secret)
--           → net.http_post()               (pg_net, async — never blocks)
--              → Edge Function              (recipients + HTML + send + log)
--
-- WHO and WHEN
--   pending      → Warehouse        |  reviewed     → Line Manager
--   lm_approved  → Director         |  finalized    → requester
--   rejected     → requester (+ whoever rejected)
--   returned / recalled → requester
--   The matrix lives in supabase/functions/send-ticket-email/ticketEmail.ts.
--
-- SAFETY
--   • Emails are queued by pg_net and only leave AFTER the transaction commits,
--     so a rejected ticket action never mails anyone.
--   • Every failure inside the trigger is caught and written to email_log —
--     an email problem can never block or roll back a stock movement.
--   • One success per (ticket, stage) is enforced by the Edge Function, so the
--     trigger and a manual "resend" can never double-mail.
--
-- SET-UP (once, see DEPLOY.md → "Email notifications"):
--   1. deploy the function        npm run functions:deploy
--   2. store its secret           select vault.create_secret('<token>','email_webhook_secret');
--   3. run this migration, then set email_notify_url below to your project.
--
-- `system_config.engine_version` deliberately stays '0014': no approval logic
-- changes here, so the UI's stock-based over-approval switch is unaffected.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------------
-- 1. pg_net — the async HTTP client Supabase uses for outbound calls
-- ------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net could not be created here (%). Enable it under Database → Extensions.', sqlerrm;
end $$;

-- ------------------------------------------------------------------
-- 2. email_log — the audit trail of every notification
--    (the modern replacement for the old "Email_Debug" sheet)
-- ------------------------------------------------------------------
create table if not exists public.email_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  ticket_id    text,
  stage        text,
  status       text,
  to_emails    text[] not null default '{}',
  cc_emails    text[] not null default '{}',
  subject      text,
  provider     text,
  -- null = queued by the trigger and not yet reported back by the Edge
  -- Function; true = the mail server accepted it; false = it failed.
  ok           boolean,
  error        text,
  detail       text,
  request_id   bigint,          -- pg_net request id (dispatch side traceability)
  quota_left   integer,         -- MailApp recipients left that day (relay only)
  attempts     integer not null default 1,
  triggered_by text,            -- trigger | resend | test | user
  html         text             -- exactly what was sent (openable by an admin)
);

create index if not exists email_log_ticket_idx on public.email_log (ticket_id, at desc);
create index if not exists email_log_at_idx     on public.email_log (at desc);
create index if not exists email_log_stage_idx  on public.email_log (ticket_id, stage, ok);

-- ------------------------------------------------------------------
-- 3. RLS — Admins read the trail; nothing writes it from a client
--    (the trigger and the Edge Function use the service role)
-- ------------------------------------------------------------------
alter table public.email_log enable row level security;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "email log read admin" on public.email_log;
create policy "email log read admin" on public.email_log
  for select to authenticated
  using (public.is_admin());

grant select on public.email_log to authenticated;

revoke insert, update, delete on public.email_log from authenticated;
revoke insert, update, delete on public.email_log from anon;
revoke select on public.email_log from anon;

-- ------------------------------------------------------------------
-- 4. Configuration (System Settings → Email)
--    Only the URL lives here — the relay secret lives in Supabase Vault,
--    because system_config is readable by every signed-in user.
-- ------------------------------------------------------------------
insert into public.system_config (key, value, description)
  values ('email_enabled', 'true', 'Send ticket notification emails')
  on conflict (key) do nothing;

insert into public.system_config (key, value, description)
  values ('email_from_name', 'Easy Gold Merch System', 'Sender name shown in the inbox')
  on conflict (key) do nothing;

insert into public.system_config (key, value, description)
  values ('email_app_url', 'https://easy-gold-merch.pages.dev', 'Public app URL used by the email button')
  on conflict (key) do nothing;

insert into public.system_config (key, value, description)
  values ('email_dispatch_mode', 'trigger', 'trigger = the database sends, client = the app sends')
  on conflict (key) do nothing;

-- ⚠️ Set this to your own project URL (Project Settings → API → Project URL).
insert into public.system_config (key, value, description)
  values ('email_notify_url',
          'https://wkcfxlfyefiplehutrmc.supabase.co/functions/v1/send-ticket-email',
          'Edge Function that renders + sends the notification')
  on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 5. dispatch_ticket_email — hand one ticket to the Edge Function
--    Returns {success:false,error} instead of raising, so the caller can log
--    a readable reason (shown in System Settings → Email).
-- ------------------------------------------------------------------
create or replace function public.dispatch_ticket_email(
  p_ticket_id text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_enabled text;
  v_mode text;
  v_url text;
  v_secret text;
  v_status text;
  v_req bigint;
begin
  if p_ticket_id is null or btrim(p_ticket_id) = '' then
    return jsonb_build_object('success', false, 'error', 'No ticket id');
  end if;

  select value into v_enabled from public.system_config where key = 'email_enabled';
  if lower(btrim(coalesce(nullif(v_enabled, ''), 'true'))) in ('false', '0', 'no', 'off') then
    return jsonb_build_object('success', false, 'error', 'Email notifications are switched off (email_enabled)');
  end if;

  -- Escape hatch: when the app sends the mail itself this trigger stands down,
  -- so a deployment can never produce two copies of the same notification.
  select value into v_mode from public.system_config where key = 'email_dispatch_mode';
  if lower(btrim(coalesce(nullif(v_mode, ''), 'trigger'))) = 'client' then
    return jsonb_build_object('success', false, 'error', 'email_dispatch_mode = client (the app sends this one)');
  end if;

  select value into v_url from public.system_config where key = 'email_notify_url';
  if v_url is null or btrim(v_url) = '' or position('/functions/v1/' in v_url) = 0 then
    return jsonb_build_object('success', false,
      'error', 'email_notify_url is not set to the send-ticket-email function URL');
  end if;

  -- The shared secret never lives in system_config (every signed-in user can
  -- read that). Store it once with:
  --   select vault.create_secret('<long-random-string>', 'email_webhook_secret');
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'email_webhook_secret' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    return jsonb_build_object('success', false,
      'error', 'Vault secret "email_webhook_secret" is missing');
  end if;

  select status into v_status from public.tickets where id = p_ticket_id;
  if v_status is null then
    return jsonb_build_object('success', false, 'error', 'Ticket not found');
  end if;

  -- pg_net queues this and sends it after COMMIT (never inside the ticket
  -- transaction), so the mail cannot be sent for a rolled-back action and the
  -- approver's screen is not kept waiting on Google.
  select net.http_post(
    url                  := v_url,
    body                 := jsonb_build_object('ticketId', p_ticket_id, 'force', coalesce(p_force, false)),
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-email-secret', v_secret),
    timeout_milliseconds := 10000
  ) into v_req;

  insert into public.email_log (ticket_id, stage, status, provider, ok, request_id, triggered_by)
  values (p_ticket_id, v_status, v_status, 'relay', null, v_req, 'trigger');

  return jsonb_build_object('success', true, 'request_id', v_req, 'status', v_status);
end $$;

-- ------------------------------------------------------------------
-- 6. notify_ticket_email — the AFTER trigger on public.tickets
--    Fires on the INSERT (ticket created) and on every real status change,
--    which covers create_ticket, update_ticket_status, the warehouse
--    self-request routing (0017) and any hand-made SQL fix.
-- ------------------------------------------------------------------
create or replace function public.notify_ticket_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_result jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;                                  -- nothing changed → no mail
  end if;

  v_result := public.dispatch_ticket_email(new.id, false);

  -- A refusal (email switched off, URL/secret not configured yet) is recorded
  -- so System Settings → Email can explain why nothing was sent.
  if not coalesce((v_result->>'success')::boolean, false) then
    insert into public.email_log (ticket_id, stage, status, provider, ok, error, triggered_by)
    values (new.id, new.status, new.status, 'relay', false,
            coalesce(v_result->>'error', 'dispatch refused'), 'trigger');
  end if;

  return null;
exception when others then
  -- Swallow EVERYTHING: a notification must never break a stock movement.
  begin
    insert into public.email_log (ticket_id, stage, status, provider, ok, error, triggered_by)
    values (new.id, new.status, new.status, 'relay', false,
            'dispatch failed: ' || sqlerrm, 'trigger');
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists trg_tickets_email_notify on public.tickets;
create trigger trg_tickets_email_notify
  after insert or update of status on public.tickets
  for each row execute function public.notify_ticket_email();

-- ------------------------------------------------------------------
-- 7. Grants — the app never calls these directly (the trigger does), and the
--    dispatch function holds the relay URL + secret, so keep it closed.
-- ------------------------------------------------------------------
revoke execute on function public.dispatch_ticket_email(text, boolean) from public;
revoke execute on function public.dispatch_ticket_email(text, boolean) from anon;
revoke execute on function public.dispatch_ticket_email(text, boolean) from authenticated;
revoke execute on function public.notify_ticket_email() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 8. Verify the installation (all three should return a row)
-- ------------------------------------------------------------------
do $$
declare
  v_net text;
  v_url text;
  v_secret text;
begin
  select extname into v_net from pg_extension where extname = 'pg_net';
  select value    into v_url    from public.system_config where key = 'email_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_webhook_secret' limit 1;

  raise notice '───────────────────────────────────────────────────────────';
  raise notice ' Email notifications (0020) installed';
  raise notice '  pg_net              : %', coalesce(v_net, '❌ MISSING — enable it in Database → Extensions');
  raise notice '  email_notify_url    : %', coalesce(v_url, '❌ not set');
  raise notice '  webhook secret      : %',
    case when v_secret is null then '❌ missing — select vault.create_secret(''<token>'',''email_webhook_secret'');'
         else '✔ present in Vault' end;
  raise notice '  next                : deploy the function (npm run functions:deploy), then';
  raise notice '                        System Settings → Email → Send test email';
  raise notice '───────────────────────────────────────────────────────────';
end $$;
