// ── Demo engine: reported-month guard (mirrors the 0027 triggers) ─────────
import { demoDB, nextLedgerId } from './demoStore';
import type { StockTransaction } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';
import { isCancelledStatus, CANCEL_RETURN_STATUS } from './stockMovement';
import { isLockedDate, isManualLedgerRow, monthClosedError } from './ledgerLock';

/**
 * Date a NEW ledger row may carry. Inside the open month → unchanged. In a
 * reported month → a manual entry is refused, a ticket row moves to today.
 */
export function ledgerInsertDate(day: string, row: { ticketId?: string | null; status?: string | null; comment?: string | null }): string {
  if (!isLockedDate(day)) return day;
  if (isManualLedgerRow(row)) throw monthClosedError(day);
  return todayStr();
}

/** Refuse changing / deleting a manual row that sits in a reported month. */
export function assertRowEditable(tx: StockTransaction): void {
  if (isLockedDate(tx.date)) throw monthClosedError(String(tx.date));
}

/**
 * Cancel a ticket booking. Open month → 'Booking Cancelled' (drops out of the
 * report). Reported month → the booking stays counted ('Deducted') and a
 * 'Cancel Return' addition dated today returns everything the ticket still
 * holds of that SKU.
 */
export function demoCancelBooking(tx: StockTransaction, comment: string, actor?: string): void {
  if (!isLockedDate(tx.date)) {
    tx.status = 'Booking Cancelled';
    tx.comment = comment;
    return;
  }
  const net = demoDB.transactions
    .filter((r) => r.ticketId === tx.ticketId && r.skuId === tx.skuId && !isCancelledStatus(r.status))
    .reduce((a, r) => a + (r.type === 'deduction' ? castNumber(r.qty) : -castNumber(r.qty)), 0);
  if (net > 0) {
    demoDB.transactions.unshift({
      id: nextLedgerId(), ticketId: tx.ticketId, skuId: tx.skuId, skuName: tx.skuName, qty: net,
      type: 'addition', date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor || tx.actionBy,
      status: CANCEL_RETURN_STATUS,
      comment: `${comment} (booking of ${String(tx.date).slice(0, 10)} already reported — returned this month)`,
    });
  }
  if (tx.status === 'Booked') tx.status = 'Deducted';
}

/**
 * Change the qty of a ticket ledger row. Open month → in place. Reported
 * month → the row keeps its qty and the difference is posted today.
 */
export function demoSetTicketRowQty(
  ledger: StockTransaction[], tx: StockTransaction, qty: number, cs: boolean, actor?: string,
): void {
  if (!isLockedDate(tx.date)) { tx.qty = qty; return; }
  const isTicket = !!tx.ticketId && demoDB.tickets.some((t) => t.id === tx.ticketId);
  if (!isTicket) throw monthClosedError(String(tx.date));
  const old = castNumber(tx.qty);
  // MKT: + = more issued (deduction grows). CS: + = more received (addition grows).
  const sign = cs ? (tx.type === 'addition' ? 1 : -1) : (tx.type === 'deduction' ? 1 : -1);
  const delta = (qty - old) * sign;
  if (delta === 0) return;
  const more = delta > 0;
  ledger.unshift({
    id: nextLedgerId(), ticketId: tx.ticketId, skuId: tx.skuId, skuName: tx.skuName, qty: Math.abs(delta),
    type: cs ? (more ? 'addition' : 'deduction') : (more ? 'deduction' : 'addition'),
    date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor || tx.actionBy,
    status: cs ? (more ? 'Edit Receipt' : 'Edit Return') : (more ? 'Edit Issue' : 'Edit Return'),
    comment: `Qty ${old} → ${qty} on a row dated ${String(tx.date).slice(0, 10)} (reported month) — posted this month`,
  });
}
