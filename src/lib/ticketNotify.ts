// ── Ticket email notifications — client entry point ──────────────────────
// Thin wrapper over the `send-ticket-email` Edge Function plus a LOCAL renderer
// (src/lib/ticketEmail.ts, generated from the function's own template) so the
// preview in System Settings → Email works with or without a deployment, and
// in the offline demo.
//
// The browser never holds the relay secret: it either asks the function to
// preview/send (a signed-in JWT is enough) or renders locally. Only the
// database trigger can send on its own, using the Vault secret.
import { isLive } from './api';
import { supabase } from './supabase';
import {
  renderTicketEmail, stageOf,
  type EmailPerson, type EmailTicket, type TicketEmailStatus,
} from './ticketEmail';

export interface EmailPreview {
  subject: string;
  heading: string;
  nextStep: string;
  stage: string;
  link: string;
  to: string[];
  cc: string[];
  html: string;
  text: string;
}

export interface EmailLogRow {
  id: number;
  at: string;
  ticketId: string;
  stage: string;
  status: string;
  to: string[];
  cc: string[];
  subject: string;
  provider: string;
  /** null = queued by the trigger and not yet reported back. */
  ok: boolean | null;
  error: string | null;
  quotaLeft: number | null;
  triggeredBy: string | null;
}

export interface EmailFunctionStatus {
  deployed: boolean;
  provider?: string;
  relayUrl?: boolean;
  relaySecret?: boolean;
  webhookSecret?: boolean;
  apiKey?: boolean;
  fromEmail?: string | null;
  fromName?: string;
  error?: string;
}

export interface SendOutcome {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  sent?: number;
  quotaLeft?: number;
  subject?: string;
  to?: string[];
  cc?: string[];
}

const FN = 'send-ticket-email';
const NOT_DEPLOYED = 'The email function is not deployed yet — see DEPLOY.md → Email notifications.';

/** Turn a supabase-js FunctionsHttpError into the message the function sent. */
async function invokeFailure(error: unknown): Promise<string> {
  const anyErr = error as { message?: string; context?: Response };
  const res = anyErr?.context;
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.json() as { error?: string };
      if (body?.error) return body.error;
    } catch { /* not JSON */ }
  }
  const msg = String(anyErr?.message || error || 'Email request failed');
  return /failed to send|fetch/i.test(msg) ? NOT_DEPLOYED : msg;
}

/** A long recipient list is noise in the UI — show the first name plus a count. */
export const summariseEmails = (list: string[]): string =>
  list.length === 0 ? '—' : list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;

// ── Local render (works in demo mode, and offline in live mode) ──────────
export function renderLocally(
  ticket: EmailTicket,
  users: EmailPerson[],
  appUrl?: string,
): EmailPreview {
  const r = renderTicketEmail(ticket, users, { appUrl });
  return {
    subject: r.subject, heading: r.heading, nextStep: r.nextStep, stage: r.stage,
    link: r.link, to: r.to, cc: r.cc, html: r.html, text: r.text,
  };
}

export function stageFor(ticket: EmailTicket): TicketEmailStatus | null {
  return stageOf(ticket.status);
}

// ── Edge Function calls ──────────────────────────────────────────────────
async function invoke(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!isLive() || !supabase) {
    return { ok: false, error: 'Demo mode — sign in through Supabase to send real email.' };
  }
  try {
    const { data, error } = await supabase.functions.invoke(FN, { body });
    if (error) return { ok: false, error: await invokeFailure(error) };
    const res = data as { ok?: boolean; error?: string };
    if (res && res.ok === false) return { ok: false, error: res.error || 'The email function reported a failure.' };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: await invokeFailure(err) };
  }
}

/** Is the function deployed, and is it configured? Never throws. */
export async function emailFunctionStatus(): Promise<EmailFunctionStatus> {
  if (!isLive()) return { deployed: false, error: 'Demo mode' };
  const { ok, data, error } = await invoke({ mode: 'status' });
  if (!ok || !data) return { deployed: false, error };
  return {
    deployed: true,
    provider: data.provider,
    relayUrl: !!data.relayUrl,
    relaySecret: !!data.relaySecret,
    webhookSecret: !!data.webhookSecret,
    apiKey: !!data.apiKey,
    fromEmail: data.fromEmail ?? null,
    fromName: data.fromName,
  };
}

/** Render through the deployed function (identical HTML), falling back to the
 *  local renderer when it is not deployed yet. */
export async function previewTicketEmail(
  ticketId: string,
  fallback: { ticket: EmailTicket; users: EmailPerson[]; appUrl?: string },
): Promise<EmailPreview> {
  if (isLive()) {
    const { ok, data } = await invoke({ mode: 'preview', ticketId });
    if (ok && data?.html) {
      return {
        subject: data.subject,
        heading: `Merch Request Update — ${data.ticketId}`,
        nextStep: data.nextStep || '', stage: data.stage, link: data.link,
        to: data.to || [], cc: data.cc || [], html: data.html, text: data.text || '',
      };
    }
  }
  return renderLocally(fallback.ticket, fallback.users, fallback.appUrl);
}

/** Send the current template to the signed-in user only. */
export async function sendTestEmail(): Promise<SendOutcome> {
  const { ok, data, error } = await invoke({ mode: 'test' });
  if (!ok || !data) return { ok: false, error };
  return { ok: true, subject: data.subject, to: data.to, cc: data.cc, sent: data.sent, quotaLeft: data.quotaLeft, error: data.error };
}

/**
 * Deliberately re-send one ticket's notification (admin / warehouse).
 * `force:true` is the ONLY way a duplicate can ever be produced — the normal
 * path is de-duplicated server-side on (ticket, stage).
 */
export async function resendTicketEmail(ticketId: string, stage?: string): Promise<SendOutcome> {
  const { ok, data, error } = await invoke({ mode: 'send', ticketId, stage, force: true });
  if (!ok || !data) return { ok: false, error };
  return {
    ok: true, subject: data.subject, to: data.to, cc: data.cc, sent: data.sent,
    quotaLeft: data.quotaLeft, skipped: data.skipped, reason: data.reason, error: data.error,
  };
}

/** Recent delivery attempts (admins only — RLS enforces it). */
export async function fetchEmailLog(limit = 25): Promise<EmailLogRow[]> {
  if (!isLive() || !supabase) return [];
  const { data, error } = await supabase
    .from('email_log')
    .select('id,at,ticket_id,stage,status,to_emails,cc_emails,subject,provider,ok,error,quota_left,triggered_by')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as any[]).map((r) => ({
    id: Number(r.id), at: String(r.at || ''), ticketId: String(r.ticket_id || ''),
    stage: String(r.stage || ''), status: String(r.status || ''),
    to: (r.to_emails || []) as string[], cc: (r.cc_emails || []) as string[],
    subject: String(r.subject || ''), provider: String(r.provider || ''),
    ok: r.ok === null || r.ok === undefined ? null : Boolean(r.ok),
    error: r.error ?? null,
    quotaLeft: r.quota_left === null || r.quota_left === undefined ? null : Number(r.quota_left),
    triggeredBy: r.triggered_by ?? null,
  }));
}
