// ── Report math (mirrors §7 of the APP MASTER SPEC + "Month End Report.md") ─
// Two flavours:
//   * `getStockMovement`  — the date-range roll-back used by the Dashboard and
//                           the Stock Balance / Inventory tab.
//   * `getMonthMovement` / `getMonthEndRows` — the month-snapshot math of the
//                           Month End Report (opening rolls every movement back
//                           from the month start, closing rolls back only the
//                           movements AFTER the month end, the initial OPENING
//                           genesis row counts as Stock In).
import type { CS_SKU, SKU, StockTransaction, Ticket, WarehouseScope } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';
import { matchAcrossWarehouses } from './warehouseMerge';

export interface StockMovement {
  stockIn: number;
  stockOut: number;
  opening: number;
  closing: number;
  usagePct: number;
  lossQty: number;
}

/**
 * Ledger statuses that mean "this movement was undone and must not be
 * counted as a real Stock In / Stock Out". A rejected or recalled ticket
 * cancels its booking instead of writing a reversal row (see migration
 * 0013), and the cancelled row keeps the audit trail only.
 */
export const CANCELLED_STATUSES = ['booking cancelled', 'cancelled', 'reversed'];

export function isCancelledStatus(status?: string | null): boolean {
  return CANCELLED_STATUSES.includes(String(status || '').toLowerCase());
}

/** Is this ledger row a real Stock In / Stock Out movement? */
export function isCountedMovement(tx: StockTransaction): boolean {
  return !isCancelledStatus(tx.status);
}

/**
 * Reporting view of the ledger: drop rows that must not appear in
 * Stock In / Stock Out totals —
 *   * cancelled bookings (reject / recall / nothing approved at review), and
 *   * every movement that belongs to a ticket which ended up
 *     rejected / recalled (the ticket netted out to zero: the booking was
 *     released and the stock returned, so counting either side would show a
 *     phantom Stock Out *and* a phantom Stock In).
 * Ticket Tracking → Stock Movements still shows the full ledger for audit.
 */
export function reportableTransactions(
  transactions: StockTransaction[],
  tickets: Ticket[],
): StockTransaction[] {
  const deadTickets = new Set(
    tickets.filter((t) => t.status === 'rejected' || t.status === 'recalled').map((t) => t.id),
  );
  return transactions.filter(
    (tx) => isCountedMovement(tx) && !(tx.ticketId && deadTickets.has(tx.ticketId)),
  );
}

export function getStockMovement(
  sku: SKU,
  transactions: StockTransaction[],
  from?: string | null,
  to?: string | null,
): StockMovement {
  let stockIn = 0;
  let stockOut = 0;
  let lossQty = 0;
  for (const tx of transactions) {
    if (tx.skuId !== sku.id) continue;
    // Cancelled bookings (reject / recall / nothing approved) never happened
    if (!isCountedMovement(tx)) continue;
    if (from && tx.date && tx.date < from) continue;
    if (to && tx.date && tx.date > to) continue;
    if (tx.type === 'addition') {
      // OPENING additions are not counted as stock-in (they are the starting balance)
      if (tx.ticketId !== 'OPENING') stockIn += castNumber(tx.qty);
    } else if (tx.type === 'deduction') {
      stockOut += castNumber(tx.qty);
    }
    lossQty += castNumber(tx.qtyBroken);
  }
  const current = castNumber(sku.currentStock);
  const inflow = castNumber(sku.totalInflow) || castNumber(sku.openingBalance);
  const opening = current + stockOut - stockIn;
  const closing = opening + stockIn - stockOut;
  const usagePct = inflow > 0 ? Math.max(0, ((inflow - current) / inflow) * 100) : 0;
  return { stockIn, stockOut, opening, closing, usagePct, lossQty };
}

/** `'YYYY-MM'` → the inclusive first / last day of that month (string-comparable dates). */
export function monthBounds(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const lastDay = new Date(year, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export interface MonthMovement {
  opening: number;
  stockIn: number;
  stockOut: number;
  closing: number;
  usagePct: number;
  lossQty: number;
  /** `(Opening + Stock In − Stock Out) − Closing` — 0 unless the SKU baseline drifted from the ledger. */
  variance: number;
}

/**
 * Month End Report maths (see `Month End Report.md`). There are no stored
 * snapshots, so the figures are rolled back from the live `currentStock`:
 *
 *   Stock In  = Σ addition qty  in [from, to] — INCLUDING the initial OPENING
 *               genesis row, so a brand-new item shows In = its opening stock
 *   Stock Out = Σ deduction qty in [from, to]
 *   Opening   = current − Σ(additions − deductions) for every tx with date >= from
 *               (later months included → a new item's OPENING row rolls back to 0)
 *   Closing   = current − Σ(additions − deductions) for every tx with date > to
 *
 * `Opening + Stock In − Stock Out === Closing` holds by construction; `variance`
 * only moves when a SKU's baseline no longer matches its ledger.
 */
export function getMonthMovement(
  sku: SKU,
  transactions: StockTransaction[],
  month: string,
): MonthMovement {
  const { from, to } = monthBounds(month);
  const current = castNumber(sku.currentStock);
  let fromStart = 0;
  let afterEnd = 0;
  let stockIn = 0;
  let stockOut = 0;
  let lossQty = 0;

  for (const tx of transactions) {
    if (tx.skuId !== sku.id) continue;
    // Cancelled bookings / rejected-recalled ticket rows never happened.
    if (!isCountedMovement(tx)) continue;
    const date = tx.date || '';
    if (!date) continue; // undated ledger rows are out of period (surfaced by `variance`)
    const qty = castNumber(tx.qty);
    // +qty for an addition, −qty for a deduction → rolling the ledger backwards
    if (date >= from) fromStart += tx.type === 'addition' ? qty : -qty;
    if (date > to) afterEnd += tx.type === 'addition' ? qty : -qty;
    if (date >= from && date <= to) {
      if (tx.type === 'addition') stockIn += qty;
      else stockOut += qty;
      lossQty += castNumber(tx.qtyBroken);
    }
  }

  const opening = current - fromStart;
  const closing = current - afterEnd;
  const variance = opening + stockIn - stockOut - closing;
  const inflow = castNumber(sku.totalInflow) || castNumber(sku.openingBalance);
  const usagePct = inflow > 0 ? Math.max(0, ((inflow - current) / inflow) * 100) : 0;
  return { opening, stockIn, stockOut, closing, usagePct, lossQty, variance };
}

export interface MonthRow {
  sku: SKU;
  openingQty: number;
  stockInQty: number;
  stockOutQty: number;
  closingQty: number;
}

export function getMonthRows(
  skus: SKU[],
  transactions: StockTransaction[],
  month: string, // 'YYYY-MM'
): MonthRow[] {
  return skus.map((sku) => {
    const mv = getMonthMovement(sku, transactions, month);
    return {
      sku,
      openingQty: mv.opening,
      stockInQty: mv.stockIn,
      stockOutQty: mv.stockOut,
      closingQty: mv.closing,
    };
  });
}

// ── Month End Report rows (quantities + values, MKT / CS / All) ───────────
export interface MonthEndRow {
  /** Stable React key / merge identity (the matched MKT id when a pair merged). */
  key: string;
  /** Display item — the MKT row when a SKU exists in both warehouses. */
  sku: SKU;
  /** Cost per unit behind the value columns (blended for a merged MKT+CS row). */
  cpu: number;
  /** 1 = one warehouse, 2 = a matched MKT + CS pair (quantity and value summed). */
  warehouses: number;
  openingQty: number;
  openingVal: number;
  stockInQty: number;
  stockInVal: number;
  stockOutQty: number;
  stockOutVal: number;
  closingQty: number;
  closingVal: number;
  variance: number;
}

export interface MonthEndArgs {
  month: string; // 'YYYY-MM'
  scope: WarehouseScope | 'all';
  skus: SKU[];
  transactions: StockTransaction[];
  csSkus: CS_SKU[];
  csTransactions: StockTransaction[];
  tickets: Ticket[];
  /** Item category filter — 'All' (default) or an exact category name. */
  category?: string;
  /** Multiply every value by 1.1 (10% VAT) for reporting. */
  vat?: boolean;
}

interface ValuedRow {
  id: string;
  name: string;
  sku: SKU | CS_SKU;
  openingQty: number; openingVal: number;
  stockInQty: number; stockInVal: number;
  stockOutQty: number; stockOutVal: number;
  closingQty: number; closingVal: number;
  variance: number;
}

function valueRow(sku: SKU | CS_SKU, transactions: StockTransaction[], month: string): ValuedRow {
  const mv = getMonthMovement(sku, transactions, month);
  const cpu = castNumber(sku.costPerUnit);
  return {
    id: String(sku.id),
    name: sku.name || '',
    sku,
    openingQty: mv.opening, openingVal: mv.opening * cpu,
    stockInQty: mv.stockIn, stockInVal: mv.stockIn * cpu,
    stockOutQty: mv.stockOut, stockOutVal: mv.stockOut * cpu,
    closingQty: mv.closing, closingVal: mv.closing * cpu,
    variance: mv.variance,
  };
}

/** Apply the VAT factor + pick the display cost/unit (`blend` = average cost of a merged row). */
function finish(key: string, r: ValuedRow, factor: number, blend: boolean): MonthEndRow {
  const baseCpu = castNumber(r.sku.costPerUnit);
  const cpu = blend && r.closingQty > 0 ? r.closingVal / r.closingQty : baseCpu;
  return {
    key,
    sku: r.sku as SKU,
    cpu,
    warehouses: blend ? 2 : 1,
    openingQty: r.openingQty, openingVal: r.openingVal * factor,
    stockInQty: r.stockInQty, stockInVal: r.stockInVal * factor,
    stockOutQty: r.stockOutQty, stockOutVal: r.stockOutVal * factor,
    closingQty: r.closingQty, closingVal: r.closingVal * factor,
    variance: r.variance,
  };
}

const sumRows = (a: ValuedRow, b: ValuedRow): ValuedRow => ({
  id: a.id, name: a.name, sku: a.sku,
  openingQty: a.openingQty + b.openingQty, openingVal: a.openingVal + b.openingVal,
  stockInQty: a.stockInQty + b.stockInQty, stockInVal: a.stockInVal + b.stockInVal,
  stockOutQty: a.stockOutQty + b.stockOutQty, stockOutVal: a.stockOutVal + b.stockOutVal,
  closingQty: a.closingQty + b.closingQty, closingVal: a.closingVal + b.closingVal,
  variance: a.variance + b.variance,
});

const byName = (a: MonthEndRow, b: MonthEndRow) => a.sku.name.localeCompare(b.sku.name, 'la');

/**
 * Build the Month End Report rows for a month. MKT and CS are always computed
 * against their OWN ledger and cost; "all" merges the two results by matched
 * SKU and sums quantities + values (a warehouse's stock is never re-priced).
 */
export function getMonthEndRows(args: MonthEndArgs): MonthEndRow[] {
  const { month, scope, category = 'All', vat = false } = args;
  const factor = vat ? 1.1 : 1;
  const keep = (s: SKU | CS_SKU) => category === 'All' || s.category === category;
  const mktTx = reportableTransactions(args.transactions, args.tickets);
  const csTx = reportableTransactions(args.csTransactions, args.tickets);

  if (scope === 'mkt' || scope === 'cs') {
    const list = scope === 'mkt' ? args.skus : args.csSkus;
    const txs = scope === 'mkt' ? mktTx : csTx;
    return list
      .filter(keep)
      .map((s) => finish(`${scope}:${s.id}`, valueRow(s, txs, month), factor, false))
      .sort(byName);
  }

  const mktRows = args.skus.filter(keep).map((s) => valueRow(s, mktTx, month));
  const csRows = args.csSkus.filter(keep).map((s) => valueRow(s, csTx, month));
  return matchAcrossWarehouses(mktRows, csRows)
    .map((pair) =>
      pair.mkt && pair.cs
        ? finish(pair.key, sumRows(pair.mkt, pair.cs), factor, true)
        : finish(pair.key, (pair.mkt || pair.cs) as ValuedRow, factor, false),
    )
    .sort(byName);
}



export function activeBorrows(tickets: Ticket[], today = todayStr()): Ticket[] {
  return tickets.filter(
    (t) => t.type === 'borrow' && t.status === 'finalized' && !t.returnedProcessed,
  );
}

export function overdueBorrows(tickets: Ticket[], today = todayStr()): Ticket[] {
  return activeBorrows(tickets, today).filter((t) => t.returnDate && t.returnDate < today);
}

export function actionableTicketCount(tickets: Ticket[], role: string): number {
  return tickets.filter((t) => {
    // Finalized borrows waiting for return are tracked in Ticket Tracking
    // ("To return to WH") — they are no longer an Action Center item.
    if (role === 'warehouse') return t.status === 'pending';
    if (role === 'line_manager') return t.status === 'reviewed';
    if (role === 'director' || role === 'finance') return t.status === 'lm_approved';
    if (role === 'admin') return !['finalized', 'rejected', 'returned', 'recalled'].includes(t.status);
    return false;
  }).length;
}