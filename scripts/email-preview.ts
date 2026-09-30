// ─────────────────────────────────────────────────────────────────────────
// Renders ticket notification emails from your REAL data to plain .html files
// so you can open them in a browser (and forward one to yourself) BEFORE
// anything is wired to Gmail.
//
//   npm run email:preview      →  email-preview/index.html
//
// Every stage of the chain is rendered, using real tickets where they exist
// and a copy of one where they do not, so all seven designs can be reviewed.
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTicketEmail, type EmailPerson, type EmailTicket, type TicketEmailStatus } from '../src/lib/ticketEmail';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(root, 'email-preview');

interface RawData {
  users: any[];
  tickets: any[];
  ticketItems: { ticketId: string; items: any[] }[];
  config?: Record<string, string>;
}

const data = JSON.parse(readFileSync(resolve(root, 'src/lib/demo-data.json'), 'utf8')) as RawData;

const itemsOf = new Map<string, any[]>((data.ticketItems || []).map((t) => [t.ticketId, t.items || []]));

const toTicket = (t: any): EmailTicket => ({
  id: String(t.id), status: String(t.status), type: t.type ?? 'request',
  createdBy: String(t.createdBy ?? ''), createdByName: t.createdByName ?? null,
  department: t.department ?? null, deliveryDate: t.deliveryDate ?? null,
  remark: t.remark ?? null, createdAt: t.createdAt ?? null, returnDate: t.returnDate ?? null,
  whComment: t.whComment ?? null, lmComment: t.lmComment ?? null, directorComment: t.directorComment ?? null,
  actualDeliveryDate: t.actualDeliveryDate ?? null, actualReturnDate: t.actualReturnDate ?? null,
  lastActionBy: t.lastActionBy ?? null, lastActionStatus: t.lastActionStatus ?? null,
  lastActionComment: t.lastActionComment ?? null,
  items: (itemsOf.get(String(t.id)) || []).map((i) => ({
    skuId: String(i.skuId ?? ''), skuName: String(i.skuName ?? ''),
    qtyRequested: Number(i.qtyRequested ?? 0),
    qtyApproved: i.qtyApproved === null || i.qtyApproved === undefined ? null : Number(i.qtyApproved),
    unit: i.unit ?? null,
  })),
});

const users: EmailPerson[] = (data.users || []).map((u) => ({
  id: u.id, email: u.email, fullName: u.fullName,
  role: u.role, department: u.department, status: u.status,
}));

const APP_URL = (data.config?.email_app_url || 'https://easy-gold-merch.pages.dev').replace(/\/+$/, '');

const STAGES: TicketEmailStatus[] = ['pending', 'reviewed', 'lm_approved', 'finalized', 'rejected', 'returned', 'recalled'];

// One real ticket per status where possible; otherwise a copy of the newest
// pending ticket relabelled, so every email design is visible.
const realByStatus = new Map<string, EmailTicket>();
for (const t of data.tickets || []) {
  const key = String(t.status);
  const withItems = toTicket(t);
  if (!withItems.items.length) continue;
  if (!realByStatus.has(key)) realByStatus.set(key, withItems);
}
const fallback = realByStatus.get('pending')
  || [...realByStatus.values()][0]
  || toTicket({ id: 'TKT-DEMO', status: 'pending', createdBy: 'demo@easygold.com', createdByName: 'Demo' });

mkdirSync(OUT, { recursive: true });

const rows: { stage: string; file: string; subject: string; to: string[]; cc: string[]; real: boolean }[] = [];

for (const stage of STAGES) {
  const base = realByStatus.get(stage) || fallback;
  const isReal = realByStatus.has(stage);
  const ticket: EmailTicket = isReal ? base : { ...base, status: stage };
  const mail = renderTicketEmail(ticket, users, { appUrl: APP_URL, stage });
  const file = `${stage}.html`;
  writeFileSync(resolve(OUT, file), mail.html, 'utf8');
  rows.push({ stage, file, subject: mail.subject, to: mail.to, cc: mail.cc, real: isReal });
  console.log(`✔ ${file.padEnd(16)} ${mail.subject}`);
  console.log(`   to: ${mail.to.join(', ') || '—'}`);
  console.log(`   cc: ${mail.cc.join(', ') || '—'}`);
}

const index = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Easy Gold — email previews</title>
<style>
 body{font:14px/1.6 'Segoe UI',Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:32px}
 .wrap{max-width:900px;margin:0 auto}
 h1{font-size:20px;margin:0 0 4px}
 p.lead{color:#64748b;margin:0 0 22px}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
 th{background:#f8fafc;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#475569;padding:10px 12px;border-bottom:1px solid #e2e8f0}
 td{padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}
 tr:last-child td{border-bottom:0}
 a{color:#1d4ed8;font-weight:600;text-decoration:none}
 code{background:#f1f5f9;padding:1px 5px;border-radius:5px;font-size:12px}
 .muted{color:#94a3b8;font-size:12px}
</style></head><body><div class="wrap">
<h1>Ticket notification emails — preview</h1>
<p class="lead">Rendered from your real data by <code>npm run email:preview</code>. Open any row to see exactly what Gmail will show.</p>
<table><tr><th>Stage</th><th>Subject</th><th>To</th><th>Cc</th><th>Source</th></tr>
${rows.map((r) => `<tr>
  <td><a href="${r.file}">${r.stage}</a></td>
  <td>${r.subject.replace(/</g, '&lt;')}</td>
  <td class="muted">${r.to.join('<br>') || '—'}</td>
  <td class="muted">${r.cc.join('<br>') || '—'}</td>
  <td class="muted">${r.real ? 'real ticket' : 'sample copy'}</td>
</tr>`).join('\n')}
</table>
<p class="muted" style="margin-top:16px">App URL used for the button: <code>${APP_URL}</code> — change it in System Settings → Email.</p>
</div></body></html>`;

writeFileSync(resolve(OUT, 'index.html'), index, 'utf8');
console.log(`\n✔ email-preview/index.html (${rows.length} stages) — open it in a browser.`);
