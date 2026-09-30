// ══════════════════════════════════════════════════════════════════════════
//  send-ticket-email — Supabase Edge Function
//
//  The ONLY place that decides who gets notified, renders the mail and sends
//  it. Called by:
//    • the Postgres trigger on public.tickets (migration 0020) via pg_net,
//      authenticated with the x-email-secret header, and
//    • the app (Settings → Email: preview / send test; ticket modal: resend),
//      authenticated with the signed-in user's JWT.
//
//  Secrets (npx supabase secrets set ...): EMAIL_RELAY_URL, EMAIL_RELAY_SECRET,
//  EMAIL_WEBHOOK_SECRET, EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY.
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the runtime.
//
//  A send failure NEVER throws: it is returned as {ok:false,error} and written
//  to public.email_log, so an email problem can never block a stock movement.
// ══════════════════════════════════════════════════════════════════════════
import {
  renderTicketEmail, resolveRecipients, stageOf,
  type EmailPerson, type EmailTicket, type EmailTicketItem, type TicketEmailStatus,
} from './ticketEmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('EMAIL_WEBHOOK_SECRET') || '';

const PROVIDER = (Deno.env.get('EMAIL_PROVIDER') || 'relay').toLowerCase();
const RELAY_URL = Deno.env.get('EMAIL_RELAY_URL') || '';
const RELAY_SECRET = Deno.env.get('EMAIL_RELAY_SECRET') || '';
const API_KEY = Deno.env.get('EMAIL_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('EMAIL_FROM') || '';
const FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Easy Gold Merch System';
const APP_URL_ENV = Deno.env.get('APP_URL') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });

const clean = (v: unknown): string => String(v ?? '').trim();
const normEmail = (v: unknown): string => clean(v).toLowerCase();

// ── REST helpers (plain fetch: no npm imports, nothing to resolve at deploy) ─
const restHeaders = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function restGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders() });
  if (!res.ok) throw new Error(`Read failed (${res.status}): ${await res.text()}`);
  return await res.json() as T[];
}

async function restInsert(table: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Write to ${table} failed (${res.status}): ${await res.text()}`);
}

// ── Row → domain mapping (snake_case DB ↔ camelCase renderer) ─────────────
const mapUser = (r: Record<string, unknown>): EmailPerson => ({
  id: clean(r.id), email: clean(r.email), fullName: clean(r.full_name),
  role: clean(r.role), department: clean(r.department), status: clean(r.status),
});

const mapItem = (r: Record<string, unknown>): EmailTicketItem => ({
  skuId: clean(r.sku_id), skuName: clean(r.sku_name),
  qtyRequested: Number(r.qty_requested ?? 0),
  qtyApproved: r.qty_approved === null || r.qty_approved === undefined ? null : Number(r.qty_approved),
  unit: clean(r.unit),
});

const mapTicket = (r: Record<string, unknown>, items: EmailTicketItem[]): EmailTicket => ({
  id: clean(r.id), status: clean(r.status), type: clean(r.type),
  createdBy: clean(r.created_by), createdByName: clean(r.created_by_name),
  department: clean(r.department), deliveryDate: clean(r.delivery_date) || null,
  remark: clean(r.remark) || null, createdAt: clean(r.created_at) || null,
  returnDate: clean(r.return_date) || null,
  whComment: r.wh_comment == null ? null : clean(r.wh_comment),
  lmComment: r.lm_comment == null ? null : clean(r.lm_comment),
  directorComment: r.director_comment == null ? null : clean(r.director_comment),
  actualDeliveryDate: clean(r.actual_delivery_date) || null,
  actualReturnDate: clean(r.actual_return_date) || null,
  lastActionBy: clean(r.last_action_by) || null,
  lastActionStatus: clean(r.last_action_status) || null,
  lastActionComment: r.last_action_comment == null ? null : clean(r.last_action_comment),
  items,
});

// ── Authentication ──────────────────────────────────────────────────────
// Two legitimate callers: the pg_net trigger (shared secret) and a signed-in
// user (JWT). Anything else gets a 401 — the URL alone is not a credential.
type Auth = { kind: 'trigger' } | { kind: 'user'; email: string } | null;

async function authenticate(req: Request): Promise<Auth> {
  const secret = req.headers.get('x-email-secret') || '';
  if (WEBHOOK_SECRET && secret && secret === WEBHOOK_SECRET) return { kind: 'trigger' };

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null) as { email?: string } | null;
  const email = normEmail(user?.email);
  return email ? { kind: 'user', email } : null;
}

// ── Data loading ────────────────────────────────────────────────────────
async function loadTicket(ticketId: string): Promise<{ ticket: EmailTicket; users: EmailPerson[] } | null> {
  const [rows, itemRows, users] = await Promise.all([
    restGet<Record<string, unknown>>(`tickets?id=eq.${encodeURIComponent(ticketId)}&select=*&limit=1`),
    restGet<Record<string, unknown>>(`ticket_items?ticket_id=eq.${encodeURIComponent(ticketId)}&select=*`),
    restGet<Record<string, unknown>>('users?select=id,email,full_name,role,department,status'),
  ]);
  if (!rows.length) return null;
  return { ticket: mapTicket(rows[0], itemRows.map(mapItem)), users: users.map(mapUser) };
}

/** The newest ticket — used by "Send test email" so an admin does not have to
 *  pick one (any ticket produces a perfectly valid preview). */
async function loadLatestTicketId(): Promise<string | null> {
  const rows = await restGet<{ id: string }>('tickets?select=id&order=created_at.desc&limit=1');
  return rows.length ? clean(rows[0].id) : null;
}

const configMap = async (): Promise<Record<string, string>> => {
  try {
    const rows = await restGet<{ key: string; value: string }>('system_config?select=key,value');
    return Object.fromEntries(rows.map((r) => [clean(r.key), clean(r.value)]));
  } catch {
    return {};
  }
};

// ── Delivery providers ──────────────────────────────────────────────────
// `relay` (Google Apps Script + MailApp) is the default because it is the only
// way to send AS the company Gmail without a Google Cloud OAuth project. The
// HTTP providers are drop-in alternatives if the 100-recipient/day free-Gmail
// allowance is ever outgrown: switch EMAIL_PROVIDER and set EMAIL_API_KEY +
// EMAIL_FROM. Nothing else in the system changes.
export interface MailMessage {
  to: string[]; cc: string[]; subject: string; html: string; text: string; ticketId: string;
}

export interface SendResult { ok: boolean; error?: string; quotaLeft?: number; detail?: string }

async function sendViaRelay(msg: MailMessage): Promise<SendResult> {
  if (!RELAY_URL) return { ok: false, error: 'EMAIL_RELAY_URL is not set on the function.' };
  if (!RELAY_SECRET) return { ok: false, error: 'EMAIL_RELAY_SECRET is not set on the function.' };
  const res = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: RELAY_SECRET, to: msg.to, cc: msg.cc, subject: msg.subject,
      html: msg.html, text: msg.text, from: FROM_NAME, ticketId: msg.ticketId,
    }),
    redirect: 'follow',
  });
  const raw = await res.text();
  let data: { ok?: boolean; error?: string; quotaLeft?: number; sent?: number } = {};
  try { data = JSON.parse(raw); } catch { /* Apps Script returns HTML on a permission error */ }
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `Relay returned HTTP ${res.status}`, detail: raw.slice(0, 300) };
  }
  return { ok: true, quotaLeft: data.quotaLeft };
}

async function sendViaProvider(msg: MailMessage): Promise<SendResult> {
  if (!API_KEY) return { ok: false, error: 'EMAIL_API_KEY is not set on the function.' };
  if (!FROM_EMAIL) return { ok: false, error: 'EMAIL_FROM is not set on the function.' };

  if (PROVIDER === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`, to: msg.to, cc: msg.cc,
        subject: msg.subject, html: msg.html, text: msg.text,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }

  if (PROVIDER === 'brevo') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: msg.to.map((email) => ({ email })),
        cc: msg.cc.map((email) => ({ email })),
        subject: msg.subject, htmlContent: msg.html, textContent: msg.text,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Brevo ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }

  if (PROVIDER === 'sendgrid') {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: msg.to.map((email) => ({ email })), cc: msg.cc.map((email) => ({ email })) }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: msg.subject,
        content: [{ type: 'text/html', value: msg.html }, { type: 'text/plain', value: msg.text }],
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }

  return { ok: false, error: `Unknown EMAIL_PROVIDER "${PROVIDER}" (use relay | resend | brevo | sendgrid).` };
}

const deliver = (msg: MailMessage): Promise<SendResult> =>
  PROVIDER === 'relay' ? sendViaRelay(msg) : sendViaProvider(msg);

// ── Send-once guard + audit log ─────────────────────────────────────────
// A ticket can only sit in a given status once in this state machine, so one
// success per (ticket, stage) is the natural dedupe key. It makes the trigger
// and a manual "resend" safe side by side: only an explicit force:true click
// ever repeats a notification.
async function alreadySent(ticketId: string, stage: string): Promise<boolean> {
  try {
    const rows = await restGet<{ id: number }>(
      `email_log?ticket_id=eq.${encodeURIComponent(ticketId)}`
      + `&stage=eq.${encodeURIComponent(stage)}&ok=is.true&select=id&limit=1`,
    );
    return rows.length > 0;
  } catch {
    return false;   // never block a notification because the log is unreadable
  }
}

async function logEmail(row: Record<string, unknown>): Promise<void> {
  try {
    await restInsert('email_log', row);
  } catch (err) {
    console.error('email_log write failed:', err);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return json({
        ok: false,
        error: 'Unauthorized — send the x-email-secret header (trigger) or a signed-in user JWT (app).',
      }, 401);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const mode = clean(body.mode) || 'send';

    // ── Config probe for Settings → Email (booleans only, never values) ──
    if (mode === 'status') {
      return json({
        ok: true, mode, provider: PROVIDER,
        relayUrl: !!RELAY_URL, relaySecret: !!RELAY_SECRET, webhookSecret: !!WEBHOOK_SECRET,
        apiKey: !!API_KEY, fromEmail: FROM_EMAIL || null, fromName: FROM_NAME,
      });
    }

    const cfg = await configMap();
    const appUrl = clean(body.appUrl) || clean(cfg.email_app_url) || APP_URL_ENV;

    let ticketId = clean(body.ticketId);
    if (!ticketId) ticketId = (await loadLatestTicketId()) || '';
    if (!ticketId) return json({ ok: false, error: 'No ticket found to render.' }, 400);

    const loaded = await loadTicket(ticketId);
    if (!loaded) return json({ ok: false, error: `Ticket ${ticketId} not found.` }, 404);
    const { ticket, users } = loaded;

    const requestedStage = clean(body.stage) as TicketEmailStatus;
    const stage = (requestedStage || stageOf(ticket.status)) as TicketEmailStatus | null;
    if (!stage) {
      return json({
        ok: false, ticketId,
        error: `Ticket ${ticketId} is "${ticket.status}" — there is no notification for that status.`,
      }, 400);
    }

    const rendered = renderTicketEmail(ticket, users, { appUrl, fromName: FROM_NAME, stage });
    const summary = {
      ticketId, stage, status: ticket.status,
      subject: rendered.subject, to: rendered.to, cc: rendered.cc, link: rendered.link,
    };

    // ── preview: hand back exactly what would be sent (no send, no log) ──
    if (mode === 'preview') {
      return json({ ok: true, mode, ...summary, html: rendered.html, text: rendered.text });
    }

    // ── test: mail the current template to the caller only ──
    if (mode === 'test') {
      const to = auth.kind === 'user' ? [auth.email] : [];
      if (!to.length) return json({ ok: false, error: 'Sending a test needs a signed-in user.' }, 400);
      const subject = `[TEST] ${rendered.subject}`;
      const result = await deliver({
        to, cc: [], subject, html: rendered.html, text: rendered.text, ticketId,
      });
      await logEmail({
        ticket_id: ticketId, stage, status: ticket.status, to_emails: to, cc_emails: [],
        subject, provider: PROVIDER, ok: result.ok, error: result.error || null,
        quota_left: result.quotaLeft ?? null, detail: result.detail || null,
        triggered_by: 'test', html: result.ok ? rendered.html : null,
      });
      return json({
        ok: result.ok, mode, sent: result.ok ? 1 : 0,
        ...summary, error: result.error, quotaLeft: result.quotaLeft,
      });
    }

    // ── send (the real notification) ──
    if (!body.force && await alreadySent(ticketId, stage)) {
      return json({
        ok: true, skipped: true, ...summary,
        reason: `Mail for ${ticketId} · ${stage} was already sent — pass force:true to resend it.`,
      });
    }

    if (!rendered.to.length) {
      const error = 'No recipients resolved for this stage — make sure active users hold the '
        + 'warehouse / line_manager / director role in System Settings → Users.';
      await logEmail({
        ticket_id: ticketId, stage, status: ticket.status, to_emails: [], cc_emails: rendered.cc,
        subject: rendered.subject, provider: PROVIDER, ok: false, error,
        triggered_by: auth.kind, html: null,
      });
      return json({ ok: false, ...summary, error }, 422);
    }

    const result = await deliver({
      to: rendered.to, cc: rendered.cc, subject: rendered.subject,
      html: rendered.html, text: rendered.text, ticketId,
    });

    await logEmail({
      ticket_id: ticketId, stage, status: ticket.status,
      to_emails: rendered.to, cc_emails: rendered.cc, subject: rendered.subject,
      provider: PROVIDER, ok: result.ok, error: result.error || null,
      quota_left: result.quotaLeft ?? null, detail: result.detail || null,
      triggered_by: body.force ? 'resend' : auth.kind, html: result.ok ? rendered.html : null,
    });

    return json({
      ok: result.ok, mode: 'send', ...summary,
      sent: result.ok ? rendered.to.length + rendered.cc.length : 0,
      error: result.error, quotaLeft: result.quotaLeft,
    }, result.ok ? 200 : 502);
  } catch (err) {
    // Never surface a bare 500 to the workflow — the caller logs this line.
    console.error('send-ticket-email crashed:', err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});
