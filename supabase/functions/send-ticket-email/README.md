# `send-ticket-email` — the ticket notification Edge Function

Decides **who** gets told **what**, renders the HTML and sends it. It is the only
component that knows the recipient matrix, so the database trigger, the app and
the preview all behave identically.

```
tickets row created / status updated  (create_ticket, update_ticket_status, SQL)
        │  AFTER trigger + pg_net         ← migration 0020_email_notifications.sql
        ▼
POST /functions/v1/send-ticket-email   { ticketId }            x-email-secret: <vault secret>
        │
        ├─ resolves recipients from public.users (warehouse / line_manager / director / requester)
        ├─ renders the mail (./ticketEmail.ts — the same file the app previews with)
        ├─ sends via the relay (or Resend / Brevo / SendGrid)
        └─ writes public.email_log  (sent · queued · failed + remaining Gmail quota)
```

## Deploy

```bash
npm run email:template          # regenerate src/lib/ticketEmail.ts (shared template)
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run functions:deploy        # = email:template && supabase functions deploy send-ticket-email
```

`supabase/config.toml` already sets `verify_jwt = false` for this function —
the trigger has no user session, so it authenticates with the shared secret
header instead. The app calls it with a normal signed-in JWT.

## Secrets

```bash
npx supabase secrets set \
  EMAIL_PROVIDER=relay \
  EMAIL_FROM_NAME="Easy Gold Merch System" \
  EMAIL_RELAY_URL="https://script.google.com/macros/s/AKfy…/exec" \
  EMAIL_RELAY_SECRET="<same value as the relay's RELAY_SECRET>" \
  EMAIL_WEBHOOK_SECRET="<long random string — also stored in Vault>" \
  APP_URL="https://easy-gold-merch.pages.dev"
```

Then, once, in the SQL editor (the trigger reads it from Vault):

```sql
select vault.create_secret('<the same long random string>', 'email_webhook_secret');
```

Switching provider later (`resend` | `brevo` | `sendgrid`) needs only
`EMAIL_PROVIDER`, `EMAIL_API_KEY` and `EMAIL_FROM` — no code change.

## Request / response

| Body | Meaning |
|---|---|
| `{ mode: 'send', ticketId, force? }` | send the notification (the trigger uses this) |
| `{ mode: 'preview', ticketId }` | return `{subject, html, text, to, cc}` without sending |
| `{ mode: 'test' }` | mail the current template to the caller only |
| `{ mode: 'status' }` | which env vars are configured (booleans only) |

Success: `{ ok: true, sent, to, cc, subject, quotaLeft }`.
Failure: `{ ok: false, error }` — **never** an unhandled crash, and never a
throw back into the ticket workflow. A send failure is logged and the ticket
still moves.

## Guarantees

- **Sent once.** One success per `(ticket, stage)`; `force: true` is the only
  way to repeat one (the app's "Email this notification again" button).
- **No recipient twice.** An address in both To and Cc is collapsed, because a
  free Gmail relay counts every address against 100 recipients/day.
- **Nothing is sent twice by two paths.** `system_config.email_dispatch_mode`
  picks the trigger *or* the client, and the trigger stands down for `client`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unauthorized` in `email_log` | `EMAIL_WEBHOOK_SECRET` on the function ≠ the Vault secret `email_webhook_secret` |
| `EMAIL_RELAY_URL is not set` | run the `secrets set` command above |
| `Relay returned HTTP 401/403` | the Apps Script deployment is not "Execute as: Me / Anyone", or the secret differs |
| `Daily Gmail quota exhausted` | 100 recipients/day on free Gmail — wait for the reset, use a Workspace account, or switch `EMAIL_PROVIDER` |
| `No recipients resolved` | nobody holds the target role with an active account (System Settings → Users) |
| `mode: 'status'` says `deployed: false` | the function is not deployed yet |
