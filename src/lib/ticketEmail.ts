// ══════════════════════════════════════════════════════════════════════════
// GENERATED FILE — DO NOT EDIT.  Run `npm run email:template` instead.
// Source of truth: supabase/functions/send-ticket-email/ticketEmail.ts
// (shared by the Supabase Edge Function that sends the mail and by this app,
//  so the Settings → Email preview is byte-for-byte what the reader gets.)
// ══════════════════════════════════════════════════════════════════════════

export type TicketEmailStatus =
  | 'pending' | 'reviewed' | 'lm_approved' | 'finalized'
  | 'rejected' | 'returned' | 'recalled';

export interface EmailTicketItem {
  skuId: string;
  skuName: string;
  qtyRequested: number;
  qtyApproved?: number | null;
  unit?: string | null;
}

export interface EmailTicket {
  id: string;
  status: string;
  type?: string | null;
  createdBy: string;
  createdByName?: string | null;
  department?: string | null;
  deliveryDate?: string | null;
  remark?: string | null;
  createdAt?: string | null;
  returnDate?: string | null;
  whComment?: string | null;
  lmComment?: string | null;
  directorComment?: string | null;
  actualDeliveryDate?: string | null;
  actualReturnDate?: string | null;
  lastActionBy?: string | null;
  lastActionStatus?: string | null;
  lastActionComment?: string | null;
  items: EmailTicketItem[];
}

/** The subset of `public.users` this module needs (keeps it framework-free). */
export interface EmailPerson {
  id?: string | null;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  department?: string | null;
  status?: string | null;
}

export interface EmailRecipients { to: string[]; cc: string[] }

export interface RenderedEmail extends EmailRecipients {
  /** Inbox subject line, e.g. `[Action Required] Merch Request — TKT-1 · Warehouse review`. */
  subject: string;
  /** Card title bar (faithful to the original app: `Merch Request Update — TKT-…`). */
  heading: string;
  /** One-line "what happens next" note shown above the button. */
  nextStep: string;
  /** Stage the email was rendered for. */
  stage: TicketEmailStatus;
  /** Deep link the button opens (Action Center for approvers, Tracking for the rest). */
  link: string;
  html: string;
  text: string;
}

// ── Labels (mirror src/lib/types.ts so the mail reads like the app) ───────
export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  lm_approved: 'LM Approved',
  finalized: 'Finalized',
  rejected: 'Rejected',
  returned: 'Returned',
  recalled: 'Recalled',
};

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  request: 'Request',
  borrow: 'Borrow',
  cs_transfer: 'CS Transfer',
};

/** Per-status presentation. Colours are plain hex (never Tailwind classes):
 *  email clients load no stylesheet, so every rule must be inline. */
const STAGE_META: Record<TicketEmailStatus, {
  subjectPrefix: string;
  subjectTail: string;
  nextStep: string;
  chipBg: string;
  chipFg: string;
  approverLink: boolean;
}> = {
  pending: {
    subjectPrefix: '[Action Required] Merch Request',
    subjectTail: 'Warehouse review',
    nextStep: 'Waiting on the Warehouse Manager to review and book the stock.',
    chipBg: '#fef3c7', chipFg: '#92400e', approverLink: true,
  },
  reviewed: {
    subjectPrefix: '[Action Required] Merch Request',
    subjectTail: 'Line Manager approval',
    nextStep: 'Waiting on the Line Manager to approve.',
    chipBg: '#e0f2fe', chipFg: '#075985', approverLink: true,
  },
  lm_approved: {
    subjectPrefix: '[Action Required] Merch Request',
    subjectTail: 'Director finalization',
    nextStep: 'Waiting on the Director to finalize.',
    chipBg: '#e0e7ff', chipFg: '#3730a3', approverLink: true,
  },
  finalized: {
    subjectPrefix: 'Merch Request Finalized',
    subjectTail: '',
    nextStep: 'Finalized — the stock has been booked. No further approval is needed.',
    chipBg: '#d1fae5', chipFg: '#065f46', approverLink: false,
  },
  rejected: {
    subjectPrefix: 'Merch Request Rejected',
    subjectTail: '',
    nextStep: 'Rejected — the booked stock has been released back to the warehouse.',
    chipBg: '#ffe4e6', chipFg: '#9f1239', approverLink: false,
  },
  returned: {
    subjectPrefix: 'Merch Request Returned',
    subjectTail: '',
    nextStep: 'The return has been recorded and the stock is back in the warehouse.',
    chipBg: '#dbeafe', chipFg: '#1e40af', approverLink: false,
  },
  recalled: {
    subjectPrefix: 'Merch Request Recalled',
    subjectTail: '',
    nextStep: 'Recalled — the booked stock has been released back to the warehouse.',
    chipBg: '#e2e8f0', chipFg: '#334155', approverLink: false,
  },
};

/** Only the 7 real statuses produce an email; anything else is ignored. */
export function isEmailStatus(status: string | null | undefined): status is TicketEmailStatus {
  return !!status && Object.prototype.hasOwnProperty.call(STAGE_META, status);
}

export function stageOf(status: string | null | undefined): TicketEmailStatus | null {
  return isEmailStatus(status) ? status : null;
}

// ── Recipient matrix ─────────────────────────────────────────────────────
// THE ONE PLACE the "who gets notified at each step" rule lives. It is
// data-driven: `public.users` decides, so adding a new Line Manager in
// System Settings means they start receiving Line Manager mail immediately —
// no list to maintain in Google, no code change.
//
//   pending      → To: all active Warehouse    Cc: requester (receipt)
//   reviewed     → To: all active Line Manager  Cc: requester
//   lm_approved  → To: all active Director      Cc: all active Line Manager
//   finalized    → To: requester                Cc: all active Warehouse
//   rejected     → To: requester                Cc: whoever rejected
//   returned     → To: requester                Cc: all active Warehouse
//   recalled     → To: requester                Cc: all active Warehouse
//
// Keep every list short: a free-Gmail relay allows 100 RECIPIENTS per day and
// a Cc address costs exactly as much of that allowance as a To address.
export const RECIPIENT_RULES: Record<TicketEmailStatus, { to: string[]; cc: string[] }> = {
  pending: { to: ['warehouse'], cc: [] },
  reviewed: { to: ['line_manager'], cc: [] },
  lm_approved: { to: ['director'], cc: [] },
  finalized: { to: ['requester'], cc: [] },
  rejected: { to: ['requester'], cc: [] },
  returned: { to: ['requester'], cc: [] },
  recalled: { to: ['requester'], cc: [] },
};

const clean = (v: unknown): string => String(v ?? '').trim();
const normEmail = (v: unknown): string => clean(v).toLowerCase();
const looksLikeEmail = (v: unknown): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v));

/** Inactive accounts are never notified (mirrors the app's sign-in rule). */
const isActive = (u: EmailPerson): boolean => normEmail(u.status) !== 'inactive';

export const normalizeRole = (raw: unknown): string => {
  const r = clean(raw).toLowerCase().replace(/\s+/g, '_');
  if (r === 'warehouse_manager') return 'warehouse';
  if (r === 'line_manager' || r === 'linemanager') return 'line_manager';
  if (r === 'customer_service' || r === 'customer_service_agent') return 'customer_service';
  return r;
};

/** Everyone holding `role` who can still receive mail. */
export function peopleByRole(users: EmailPerson[], role: string): EmailPerson[] {
  return users.filter((u) => normalizeRole(u.role) === role && isActive(u) && looksLikeEmail(u.email));
}

export const emailsOf = (people: EmailPerson[]): string[] =>
  people.map((p) => normEmail(p.email)).filter(looksLikeEmail);

/** The requester's address. `created_by` holds either a user id (USR017) or
 *  the sign-in email — both shapes exist in the production data. */
export function requesterOf(ticket: EmailTicket, users: EmailPerson[]): EmailPerson | null {
  const by = clean(ticket.createdBy);
  if (!by) return null;
  const match = users.find(
    (u) => clean(u.id) === by || normEmail(u.email) === normEmail(by),
  );
  if (match && looksLikeEmail(match.email)) return match;
  // No directory match (deleted account) — fall back to the raw value when it
  // already is an address, so the requester still gets their result.
  return looksLikeEmail(by) ? { email: normEmail(by), fullName: ticket.createdByName } : null;
}

/** Who performed the last action (used as the Cc on a rejection). */
function actorOf(ticket: EmailTicket, users: EmailPerson[]): EmailPerson | null {
  const by = clean(ticket.lastActionBy);
  if (!by) return null;
  const match = users.find((u) => clean(u.fullName) === by || normEmail(u.email) === normEmail(by));
  return match && looksLikeEmail(match.email) ? match : (looksLikeEmail(by) ? { email: normEmail(by) } : null);
}

const uniq = (list: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const e = normEmail(item);
    if (!looksLikeEmail(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
};

/**
 * Who receives this stage. An address is never in both To and Cc (Gmail would
 * drop the duplicate anyway, but the daily relay allowance counts it), and the
 * person who just acted is removed from their own notification.
 */
export function resolveRecipients(
  ticket: EmailTicket,
  users: EmailPerson[],
  stage: TicketEmailStatus = (stageOf(ticket.status) || 'pending'),
): EmailRecipients {
  const rule = RECIPIENT_RULES[stage];
  const requester = requesterOf(ticket, users);
  const actor = actorOf(ticket, users);

  const pick = (token: string): string[] => {
    if (token === 'requester') return requester ? [normEmail(requester.email)] : [];
    if (token === 'actor') return actor ? [normEmail(actor.email)] : [];
    return emailsOf(peopleByRole(users, token));
  };

  const to = uniq(rule.to.flatMap(pick));
  const actorEmail = actor ? normEmail(actor.email) : '';
  // Never Cc the person who just acted on the ticket (they already know) —
  // except on a rejection, where the rejecting level is the point of the Cc,
  // and at creation, where the "actor" is the requester receiving their own
  // submission receipt.
  const cc = uniq(rule.cc.flatMap(pick))
    .filter((e) => !to.includes(e))
    .filter((e) => !(actorEmail && e === actorEmail && stage !== 'rejected' && stage !== 'pending'));

  return { to, cc };
}

// ── Small formatting helpers ─────────────────────────────────────────────
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape. Lao text passes through untouched (UTF-8, no transliteration). */
export const esc = (v: unknown): string => clean(v).replace(/[&<>"']/g, (c) => ESC[c] || c);

/** ISO date → `YYYY-MM-DD` (the format the app and the reports use). */
export function fmtDate(v: unknown): string {
  const s = clean(v);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

/** The comment written by the level that triggered this email (else `-`). */
export function commentForStage(ticket: EmailTicket, stage: TicketEmailStatus): string {
  const byStage: Record<string, unknown> = {
    pending: '',
    reviewed: ticket.whComment,
    lm_approved: ticket.lmComment,
    finalized: ticket.directorComment || ticket.lmComment,
    rejected: ticket.lastActionComment || ticket.whComment || ticket.lmComment || ticket.directorComment,
    returned: ticket.lastActionComment,
    recalled: ticket.lastActionComment,
  };
  return clean(byStage[stage]) || '-';
}

export function subjectOf(ticket: EmailTicket, stage: TicketEmailStatus): string {
  const meta = STAGE_META[stage];
  const tail = meta.subjectTail ? ` · ${meta.subjectTail}` : '';
  return `${meta.subjectPrefix} — ${ticket.id}${tail}`;
}

export const DEFAULT_APP_URL = 'https://easy-gold-merch-management.tockppd.workers.dev';

/** Where the button sends the reader: approvers land on their queue, everyone
 *  else on the ticket itself (both pages auto-open `?ticket=`). */
export function linkFor(ticket: EmailTicket, stage: TicketEmailStatus, appUrl?: string): string {
  const base = clean(appUrl).replace(/\/+$/, '') || DEFAULT_APP_URL;
  const path = STAGE_META[stage].approverLink ? '/action-center' : '/ticket-tracking';
  return `${base}${path}?ticket=${encodeURIComponent(ticket.id)}`;
}

// ── HTML renderer ────────────────────────────────────────────────────────
// Table layout + inline styles only: Gmail, Outlook and Apple Mail strip
// <style> blocks, so every rule has to travel with the tag. The markup mirrors
// the original app's mail (navy title bar, meta block, 7-column item table,
// dark CTA button, "automated notification" footer) but adds the status chip
// and the "what happens next" line so a reader knows whether they must act.
const NAVY = '#0f172a';
const BORDER = '#e2e8f0';
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const th = (label: string, width: string, align: string): string =>
  `<th width="${width}" align="${align}" style="padding:9px 10px;border:1px solid ${BORDER};`
  + `background:#f1f5f9;font-family:${FONT};font-size:11px;font-weight:700;text-transform:uppercase;`
  + `letter-spacing:.4px;color:#475569;text-align:${align};">${esc(label)}</th>`;

function itemRow(index: number, cells: string[], shaded: boolean): string {
  const bg = shaded ? '#fbfcfe' : '#ffffff';
  return `<tr style="background:${bg};">${cells
    .map((c, i) => `<td style="padding:9px 10px;border:1px solid ${BORDER};font-family:${FONT};`
      + `font-size:13px;color:${i === 1 ? '#0f172a' : '#334155'};${i === 1 ? '' : 'text-align:center;'}`
      + `word-break:break-word;">${c}</td>`)
    .join('')}</tr>`;
}

function metaLine(label: string, value: string): string {
  return `<div style="font-family:${FONT};font-size:13px;line-height:1.6;color:#334155;">`
    + `<span style="color:#94a3b8;">${esc(label)}:</span> <b style="color:#0f172a;">${value || '—'}</b></div>`;
}

/** Render the notification for one ticket/stage. Pure: no clock, no network. */
export function renderTicketEmail(
  ticket: EmailTicket,
  users: EmailPerson[],
  opts: { appUrl?: string; fromName?: string; stage?: TicketEmailStatus } = {},
): RenderedEmail {
  const stage = opts.stage || stageOf(ticket.status) || 'pending';
  const meta = STAGE_META[stage];
  const { to, cc } = resolveRecipients(ticket, users, stage);
  const heading = `Merch Request Update — ${ticket.id}`;
  const statusLabel = EMAIL_STATUS_LABELS[ticket.status] || clean(ticket.status);
  const link = linkFor(ticket, stage, opts.appUrl);
  const comment = commentForStage(ticket, stage);
  const estDelivery = fmtDate(ticket.actualDeliveryDate || ticket.deliveryDate);
  const typeLabel = EMAIL_TYPE_LABELS[clean(ticket.type)] || 'Request';
  const requesterName = clean(ticket.createdByName) || clean(requesterOf(ticket, users)?.fullName) || '—';

  const bodyRows = ticket.items.map((it, i) => itemRow(i, [
    String(i + 1),
    esc(it.skuName),
    String(it.qtyRequested ?? 0),
    it.qtyApproved === null || it.qtyApproved === undefined ? '-' : String(it.qtyApproved),
    esc(statusLabel),
    esc(comment),
    esc(estDelivery || '-'),
  ], i % 2 === 1)).join('');

  const metaBlock =
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`
    + `<tr>`
    + `<td width="38%" valign="top" style="padding:16px 0 16px 24px;">`
    + metaLine('Requester', esc(requesterName))
    + metaLine('Department', esc(ticket.department))
    + metaLine('Type', esc(typeLabel))
    + metaLine('Requested on', esc(fmtDate(ticket.createdAt)))
    + (clean(ticket.type) === 'borrow' ? metaLine('Return due', esc(fmtDate(ticket.returnDate))) : '')
    + `</td>`
    + `<td width="62%" valign="top" style="padding:16px 24px 16px 0;">`
    + `<div style="font-family:${FONT};font-size:13px;line-height:1.6;color:#334155;">`
    + `<span style="color:#94a3b8;">Reason:</span> ${esc(ticket.remark) || '—'}</div>`
    + `</td></tr></table>`;

  const chip = `<span style="display:inline-block;margin-top:8px;padding:3px 10px;border-radius:999px;`
    + `background:${meta.chipBg};color:${meta.chipFg};font-family:${FONT};font-size:11px;font-weight:700;`
    + `text-transform:uppercase;letter-spacing:.5px;">${esc(statusLabel)}</span>`;

  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(heading)}</title></head>`
    + `<body style="margin:0;padding:0;background:#eef1f5;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f5;padding:24px 12px;">`
    + `<tr><td align="center">`
    + `<table width="640" cellpadding="0" cellspacing="0" border="0" `
    + `style="width:640px;max-width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;`
    + `border-collapse:separate;overflow:hidden;">`
    // ── title bar ──
    + `<tr><td align="center" style="background:${NAVY};padding:18px 24px;">`
    + `<div style="font-family:${FONT};font-size:17px;font-weight:700;line-height:1.35;color:#ffffff;">`
    + `${esc(heading)}</div>${chip}</td></tr>`
    // ── requester / department / reason ──
    + `<tr><td>${metaBlock}</td></tr>`
    // ── items ──
    + `<tr><td style="padding:0 24px 4px;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`
    + `<tr>${th('No.', '34', 'center')}${th('Item Name', '30%', 'left')}${th('Qty Req', '58', 'center')}`
    + `${th('Qty Appr', '58', 'center')}${th('Status', '78', 'center')}${th('Comment', '18%', 'center')}`
    + `${th('Est. Delivery', '88', 'center')}</tr>${bodyRows}</table></td></tr>`
    // ── next step + CTA ──
    + `<tr><td align="center" style="padding:18px 24px 6px;">`
    + `<div style="font-family:${FONT};font-size:13px;line-height:1.6;color:#475569;">${esc(meta.nextStep)}</div>`
    + `<div style="padding:14px 0 8px;">`
    + `<a href="${esc(link)}" style="display:inline-block;background:${NAVY};color:#ffffff;`
    + `font-family:${FONT};font-size:14px;font-weight:700;text-decoration:none;padding:12px 26px;`
    + `border-radius:8px;">Review Ticket in App</a></div>`
    + `<div style="font-family:${FONT};font-size:11px;color:#94a3b8;word-break:break-all;">`
    + `Button not working? <a href="${esc(link)}" style="color:#64748b;">${esc(link)}</a></div>`
    + `</td></tr>`
    // ── footer ──
    + `<tr><td align="center" style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">`
    + `<div style="font-family:${FONT};font-size:12px;line-height:1.5;color:#94a3b8;">`
    + `This is an automated notification. Row data is now locked in the tracking system.</div>`
    + `</td></tr></table></td></tr></table></body></html>`;

  const text = [
    heading,
    `Status: ${statusLabel}`,
    `Requester: ${requesterName} · Department: ${ticket.department || '—'}`,
    `Reason: ${clean(ticket.remark) || '—'}`,
    '',
    ...ticket.items.map((it, i) => {
      const appr = it.qtyApproved === null || it.qtyApproved === undefined ? '-' : String(it.qtyApproved);
      return `${i + 1}. ${clean(it.skuName)} — Qty Req ${it.qtyRequested ?? 0} / Qty Appr ${appr}`
        + ` — ${statusLabel} — ${comment} — Est. ${estDelivery || '-'}`;
    }),
    '',
    meta.nextStep,
    `Review Ticket in App: ${link}`,
    '',
    'This is an automated notification. Row data is now locked in the tracking system.',
  ].join('\n');

  return { subject: subjectOf(ticket, stage), heading, nextStep: meta.nextStep, stage, link, to, cc, html, text };
}



