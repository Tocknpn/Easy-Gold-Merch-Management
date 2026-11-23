// ── Reported-month lock (mirrors migration 0027) ──────────────────────────
// Finance rule: Opening(M) = Closing(M−1) and a month already reported never
// changes. Every month BEFORE the current one counts as reported, so:
//   * manual entries (opening balance, Stock In / Stock Out, ledger
//     corrections of non-ticket rows) may not be dated / changed there;
//   * ticket corrections (edit, late reject / recall, approved-qty change)
//     are posted TODAY instead of rewriting the past.
import { todayStr } from './utils';

/** First day of the current (open) month — everything before it is locked. */
export function reportingPeriodStart(today: string = todayStr()): string {
  return `${today.slice(0, 7)}-01`;
}

/**
 * First day of the PREVIOUS month: an Admin ticket edit of a ticket delivered
 * on/after this day still lands on its delivery date (corrects that month).
 */
export function ticketEditWindowStart(today: string = todayStr()): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 12 : m;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

/** 0028: an Admin is not bound by the reported-month lock (the database lets
 *  Admin + the Supabase dashboard write into any month, and audits it). */
export function isLockExempt(role?: string | null): boolean {
  return String(role || '').trim().toLowerCase() === 'admin';
}

/** Is this ledger date inside an already-reported month? */
export function isLockedDate(date?: string | null, today: string = todayStr()): boolean {
  const d = String(date || '').slice(0, 10);
  return !!d && d < reportingPeriodStart(today);
}

export function monthClosedError(date: string, today: string = todayStr()): Error {
  return new Error(
    `Month closed: ${date.slice(0, 10)} is in a month already reported to Finance (before ${reportingPeriodStart(today)}). ` +
    'Record the correction as a Stock In / Stock Out dated this month.',
  );
}

/** Opening balance from the SKU form, Stock In / Stock Out — not a ticket. */
export function isManualLedgerRow(tx: { ticketId?: string | null; status?: string | null; comment?: string | null }): boolean {
  const manual =
    ['OPENING', 'RESTOCK', 'DIRECT_DESTOCK'].includes(String(tx.ticketId || '')) ||
    ['Opening', 'Opening Balance', 'Restock', 'Destock'].includes(String(tx.status || ''));
  return manual && !/^auto-transferred/i.test(String(tx.comment || ''));
}
