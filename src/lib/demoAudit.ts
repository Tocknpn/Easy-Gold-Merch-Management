// ── In-memory demo audit trail ──────────────────────────────────────────
// Live mode gets its rows from the `audit_log` table (migration 0016 fills it
// with per-table triggers). Demo mode has no triggers, so this module builds
// the SAME shape from two sources:
//   1. explicit rows pushed by the master-data / settings / user mutations
//      (demoDB.audit — those areas have no other trail), and
//   2. the history that already exists in memory: the stock ledger, the ticket
//      action trail, and SKU remarks.
// The audit page therefore renders identically in both modes.
import { demoDB } from './demoStore';
import type { AuditChange, AuditEntry, StockTransaction } from './types';
import { castNumber } from './types';
import { dayOf } from './utils';

export interface AuditQuery {
  /** Inclusive YYYY-MM-DD lower bound on `at` (server-side in live mode). */
  from?: string | null;
  /** Inclusive YYYY-MM-DD upper bound on `at`. */
  to?: string | null;
  /** Newest-N window (the page grows this with "Load older"). */
  limit?: number;
}

const actionKey = (s?: string | null): string =>
  String(s || 'update').trim().toLowerCase().replace(/\s+/g, '_') || 'update';

const day = (iso?: string | null): string => String(iso || '').slice(0, 10);

/** The correction stamp written by demoEditStockMovement / the 0015 RPC:
 *  `<base> | Edited by <name> (<role>) on <ts> — <reason> · qty 50 → 30` */
const stampOf = (comment?: string | null): string =>
  String(comment || '').split(' | ').pop() || '';

const reasonOf = (stamp: string): string =>
  (stamp.split(' — ')[1] || '').split(' · qty ')[0].trim();

const qtyChangeOf = (stamp: string): AuditChange[] => {
  const m = /· qty ([\d.]+) → ([\d.]+)/.exec(stamp);
  return m ? [{ field: 'qty', from: m[1], to: m[2] }] : [];
};

/** Mirrors the wording of the audit_row() trigger for a ledger row. */
function ledgerEntry(tx: StockTransaction, wh: 'MKT' | 'CS', id: number, edited: boolean): AuditEntry {
  const ref = tx.ticketId || '';
  const item = tx.skuName || 'item';
  const qty = castNumber(tx.qty);
  const dir = tx.type === 'addition' ? 'IN' : 'OUT';
  const qtyTxt = String(qty);

  let action = 'issue';
  let summary = `Stock OUT ${qtyTxt} × "${item}"${ref ? ' · ' + ref : ''}`;
  if (edited) {
    action = 'correct';
    summary = `Corrected ${wh} stock ${dir} "${item}"`;
  } else if (ref === 'RESTOCK') {
    action = 'restock';
    summary = `Restocked "${item}" +${qtyTxt}`;
  } else if (ref === 'DIRECT_DESTOCK') {
    action = 'destock';
    summary = `Direct destock "${item}" −${qtyTxt}`;
  } else if (ref.startsWith('CS_TRANSFER') || ref.startsWith('MKT_TRANSFER')) {
    action = 'transfer';
    summary = `Warehouse transfer "${item}" ${qtyTxt} ${dir}`;
  } else if (ref === 'OPENING') {
    action = 'opening';
    summary = `Opening balance "${item}" = ${qtyTxt}`;
  } else if (String(tx.status || '').toLowerCase() === 'booked') {
    action = 'book';
    summary = `Booked ${qtyTxt} × "${item}" on ${ref}`;
  } else if (dir === 'IN') {
    action = 'return';
    summary = `Returned ${qtyTxt} × "${item}"${ref ? ` (${ref})` : ''}`;
  }

  return {
    id,
    at: edited && tx.editedAt ? tx.editedAt : tx.actionAt || tx.date || '',
    actorName: edited ? tx.editedBy || null : tx.actionBy || null,
    actorRole: null,
    actorEmail: null,
    module: 'ledger',
    action,
    entity: wh === 'MKT' ? 'stock_transactions' : 'cs_transactions',
    entityId: tx.id != null ? String(tx.id) : null,
    entityName: item,
    warehouse: wh,
    refTicket: ref || null,
    amount: qty,
    summary,
    comment: tx.comment || null,
    changes: [],
    origin: 'demo',
  };
}

/** Every audit row the demo data can produce, newest first. */
export function demoAuditEntries(): AuditEntry[] {
  let seq = 0;
  const next = () => -++seq;          // negative ids — never clash with pushAudit()
  const out: AuditEntry[] = [];

  // 1. explicit rows (master data / settings / user accounts)
  for (const e of demoDB.audit) out.push({ ...e });

  // 2. ticket workflow trail
  for (const a of demoDB.actions) {
    out.push({
      id: next(),
      at: a.actionAt || '',
      actorName: a.actionBy || null,
      actorRole: a.role || null,
      actorEmail: null,
      module: 'ticket',
      action: actionKey(a.action || a.status),
      entity: 'ticket_actions',
      entityId: a.ticketId || null,
      entityName: a.ticketId || null,
      warehouse: null,
      refTicket: a.ticketId || null,
      amount: null,
      summary: `Ticket ${a.ticketId || '?'} — ${a.action || a.status || 'updated'}`,
      comment: a.comment || null,
      changes: [],
      origin: 'demo',
    });
  }

  // 3. stock ledger (MKT + CS) — one edit entry per corrected row
  const ledgers: [StockTransaction[], 'MKT' | 'CS'][] = [
    [demoDB.transactions, 'MKT'],
    [demoDB.csTransactions, 'CS'],
  ];
  for (const [rows, wh] of ledgers) {
    for (const tx of rows) {
      out.push(ledgerEntry(tx, wh, next(), false));
      if (!tx.editedBy) continue;
      const stamp = stampOf(tx.comment);
      const corrected = ledgerEntry(tx, wh, next(), true);
      corrected.comment = reasonOf(stamp) || null;
      corrected.changes = qtyChangeOf(stamp);
      const from = corrected.changes?.[0]?.from;
      const to = corrected.changes?.[0]?.to;
      if (from && to) corrected.summary += ` · qty ${from} → ${to}`;
      out.push(corrected);
    }
  }

  // 4. SKU remarks
  demoDB.remarks.forEach((r, i) => {
    const sku = demoDB.skus.find((s) => s.id === r.skuId);
    const name = sku?.name || r.skuId || 'item';
    out.push({
      id: -100000 - i,
      at: r.createdAt || '',
      actorName: r.userName || null,
      actorRole: r.userRole || null,
      actorEmail: null,
      module: 'remark',
      action: 'create',
      entity: 'sku_remarks',
      entityId: r.skuId || null,
      entityName: name,
      warehouse: null,
      refTicket: null,
      amount: null,
      summary: `Remark on "${name}"`,
      comment: r.remark || null,
      changes: [],
      origin: 'demo',
    });
  });

  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Demo counterpart of apiFetchAudit() — same filters, same newest-first order. */
export function demoFetchAudit(opts: AuditQuery = {}): AuditEntry[] {
  const from = day(opts.from);
  const to = day(opts.to);
  const limit = Math.max(1, opts.limit || 300);
  return demoAuditEntries()
    .filter((e) => {
      // Same LOCAL day the page groups by (the live query pads its window by a
      // day and re-filters in the browser), so both modes agree in any timezone.
      const d = dayOf(e.at);
      if (!d) return !from && !to;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    })
    .slice(0, limit);
}
