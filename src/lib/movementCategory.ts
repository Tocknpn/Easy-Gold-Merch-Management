// ── Stock movement categories ─────────────────────────────────────────────
// One reading of a ledger row, shared by Ticket Tracking → Stock Movements and
// the item detail modal, so a row is called the same thing everywhere.
import { isCancelledStatus, isTicketEditRow } from './stockMovement';
import type { StockTransaction } from './types';

export const CAT_ORDER = ['issue', 'returned', 'edit', 'in', 'out', 'loss', 'transfer', 'opening', 'cancelled'] as const;
export type CatKey = (typeof CAT_ORDER)[number];
export const CAT_LABEL: Record<CatKey, string> = {
  issue: 'Ticket issue', returned: 'Ticket return', edit: 'Ticket edit', in: 'Stock in', out: 'Stock out',
  loss: 'Loss / Broken', transfer: 'Transfer', opening: 'Opening',
  cancelled: 'Cancelled / Rejected',
};
export const CAT_STYLE: Record<CatKey, string> = {
  issue: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  edit: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  returned: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  in: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  out: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  loss: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  transfer: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  opening: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  cancelled: 'bg-slate-200 text-slate-500 ring-slate-400/20',
};

export function catOf(tx: StockTransaction, deadTickets?: Set<string>): CatKey {
  const ref = tx.ticketId || '';
  const st = (tx.status || '').toLowerCase();
  const comment = (tx.comment || '').toLowerCase();
  // Cancelled bookings (reject / recall / nothing approved) and legacy
  // reversal rows of rejected/recalled tickets are audit-only — they must
  // never be read as a real Stock In / Stock Out.
  if (isCancelledStatus(tx.status) || (ref && deadTickets?.has(ref))) return 'cancelled';
  // Admin ticket edits (0024) — adjustments of a finalized ticket's quantities
  if (isTicketEditRow(tx)) return 'edit';
  if (st === 'opening') return 'opening';
  if (ref.startsWith('TKT-')) return tx.type === 'deduction' ? 'issue' : 'returned';
  if (st.includes('loss') || st.includes('broken')) return 'loss';
  if (ref.startsWith('CS_TRANSFER') || ref.startsWith('MKT_TRANSFER')) return 'transfer';
  // Also check comment for transfer indicators (handles seed data where ticket_id is RESTOCK/DIRECT_DESTOCK
  // but the comment clearly marks it as a warehouse transfer)
  if (comment.includes('mkt_transfer') || comment.includes('cs_transfer') || comment.includes('[transfer]') || comment.includes('transferred')) return 'transfer';
  if (tx.type === 'addition') return 'in';
  return 'out';
}

/** The ticket a ledger row belongs to — its own ticket id, or (a CS item
 *  created by a cs_transfer) the ticket named in its OPENING comment. */
export function ticketRefOf(tx: StockTransaction): string | null {
  const ref = tx.ticketId || '';
  if (ref.startsWith('TKT-')) return ref;
  const m = /Ticket: (TKT-\S+)/.exec(String(tx.comment || ''));
  return m ? m[1] : null;
}
