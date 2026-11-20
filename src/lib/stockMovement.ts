// ── Report math (mirrors §7 of the APP MASTER SPEC + "Month End Report.md") ─
// Two flavours:
//   * `getStockMovement`  — the date-range roll-back used by the Dashboard and
//                           the Stock Balance / Inventory tab.
//   * `getMonthMovement` / `getMonthEndRows` — the month-snapshot math of the
//                           Month End Report (opening rolls every movement back
//                           from the month start, closing rolls back only the
//                           movements AFTER the month end).
// Finance rule: Opening(M) = Closing(M−1), always. A new item's starting stock
// (its OPENING row) is Stock In in the month it is dated, and only becomes
// Opening from the following month on. Ticket ledger rows are dated on the
// ticket's delivery date (0026); corrections made later (edit / late recall /
// late reject) are dated on the day they are made (0027), and nothing can be
// written into a month before the current one — so a reported month never
// changes.
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

// ── Admin ticket edits (migration 0024) ───────────────────────────────────
// An edit writes NEW ledger rows dated the edit day:
//   MKT 'Edit Issue'   (deduction) — more issued on the ticket   → Stock Out
//   MKT 'Edit Return'  (addition)  — less issued on the ticket   → LESS Stock Out
//   CS  'Edit Receipt' (addition)  — more received on a transfer → Stock In
//   CS  'Edit Return'  (deduction) — less received on a transfer → LESS Stock In
// An 'Edit Return' row therefore OFFSETS the opposite flow instead of showing
// up as a phantom Stock In (MKT) / Stock Out (CS). The net effect on the
// balance is still +qty for an addition and −qty for a deduction, so every
// roll-back (opening / closing) stays exactly the same.
export const EDIT_STATUSES = {
  issue: 'Edit Issue',
  receipt: 'Edit Receipt',
  reversal: 'Edit Return',
} as const;

/**
 * A late cancel (0027): a ticket rejected / recalled after its delivery month
 * was already reported keeps its booking (counted in that month) and writes
 * this addition, dated the cancel day, to give the stock back.
 */
export const CANCEL_RETURN_STATUS = 'Cancel Return';

export function isCancelReturn(tx: StockTransaction): boolean {
  return String(tx.status || '').toLowerCase() === CANCEL_RETURN_STATUS.toLowerCase();
}

/**
 * Gross flow used by the Month End Report (Finance view): every row lands in
 * the column of its direction — an addition is Stock In, a deduction is Stock
 * Out — so an 'Edit Return' / 'Cancel Return' shows as positive Stock In (MKT)
 * and never as a negative Stock Out. Net effect on the balance is identical to
 * `flowOf`, so the roll-back is unchanged.
 */
export function reportFlowOf(tx: StockTransaction): { in: number; out: number } {
  const q = castNumber(tx.qty);
  return tx.type === 'addition' ? { in: q, out: 0 } : { in: 0, out: q };
}

/** A row written by an Admin ticket edit. */
export function isTicketEditRow(tx: StockTransaction): boolean {
  return String(tx.status || '').toLowerCase().startsWith('edit ');
}

/** An edit row that reverses part of the ticket's original movement. */
export function isEditReversal(tx: StockTransaction): boolean {
  return String(tx.status || '').toLowerCase() === EDIT_STATUSES.reversal.toLowerCase();
}

/**
 * Signed contribution of ONE ledger row to the Stock In / Stock Out columns.
 * Normal rows: addition → in, deduction → out. An 'Edit Return' reversal
 * subtracts from the opposite column (see above). `in − out` always equals the
 * row's net effect on the balance.
 */
export function flowOf(tx: StockTransaction): { in: number; out: number } {
  const q = castNumber(tx.qty);
  if (isEditReversal(tx)) return tx.type === 'addition' ? { in: 0, out: -q } : { in: -q, out: 0 };
  return tx.type === 'addition' ? { in: q, out: 0 } : { in: 0, out: q };
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
  // A late-cancelled ticket (it has a 'Cancel Return' row) stays in the
  // ledger: its booking counts in its (already reported) month and the return
  // counts on the cancel day.
  const lateCancelled = new Set(
    transactions.filter((tx) => tx.ticketId && isCancelReturn(tx)).map((tx) => tx.ticketId as string),
  );
  const deadTickets = new Set(
    tickets
      .filter((t) => (t.status === 'rejected' || t.status === 'recalled') && !lateCancelled.has(t.id))
      .map((t) => t.id),
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
    // OPENING additions are not counted as stock-in (they are the starting balance)
    if (tx.type === 'addition' && tx.ticketId === 'OPENING') continue;
    const f = flowOf(tx);
    stockIn += f.in;
    stockOut += f.out;
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
  /** Earliest dated movement for this SKU (null when it has no ledger row) — the birth-date fallback. */
  firstDate: string | null;
  /** `(Opening + Stock In − Stock Out) − Closing` — 0 unless the SKU baseline drifted from the ledger. */
  variance: number;
}

/**
 * Month End Report maths (see `Month End Report.md`). There are no stored
 * snapshots, so the figures are rolled back from the live `currentStock`:
 *
 *   Stock In  = Σ addition qty  in [from, to] — including a new item's OPENING
 *               row and 'Edit Return' / 'Cancel Return' rows (`reportFlowOf`)
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
  let firstDate: string | null = null;

  for (const tx of transactions) {
    if (tx.skuId !== sku.id) continue;
    // Cancelled bookings / rejected-recalled ticket rows never happened.
    if (!isCountedMovement(tx)) continue;
    const date = tx.date || '';
    if (!date) continue; // undated ledger rows are out of period (surfaced by `variance`)
    if (!firstDate || date < firstDate) firstDate = date;
    const qty = castNumber(tx.qty);
    // +qty for an addition, −qty for a deduction → rolling the ledger backwards
    if (date >= from) fromStart += tx.type === 'addition' ? qty : -qty;
    if (date > to) afterEnd += tx.type === 'addition' ? qty : -qty;
    if (date >= from && date <= to) {
      const f = reportFlowOf(tx);
      stockIn += f.in;
      stockOut += f.out;
      lossQty += castNumber(tx.qtyBroken);
    }
  }

  const opening = current - fromStart;
  const closing = current - afterEnd;
  const variance = opening + stockIn - stockOut - closing;
  const inflow = castNumber(sku.totalInflow) || castNumber(sku.openingBalance);
  const usagePct = inflow > 0 ? Math.max(0, ((inflow - current) / inflow) * 100) : 0;
  return { opening, stockIn, stockOut, closing, usagePct, lossQty, firstDate, variance };
}

/**
 * Closing quantity for a SKU as of an arbitrary date — the same rollback
 * technique as `getMonthMovement`'s `afterEnd`/`closing` (current stock minus
 * every reportable movement dated AFTER `asOf`), generalised to a non-month
 * boundary. Pass transactions already filtered by `reportableTransactions()`
 * so cancelled bookings and dead-ticket rows never count.
 */
export function closingQtyAsOf(
  sku: SKU | CS_SKU,
  reportableTx: StockTransaction[],
  asOf: string,
): number {
  const current = castNumber(sku.currentStock);
  let afterEnd = 0;
  for (const tx of reportableTx) {
    if (tx.skuId !== sku.id) continue;
    const date = tx.date || '';
    if (!date || date <= asOf) continue;
    afterEnd += tx.type === 'addition' ? castNumber(tx.qty) : -castNumber(tx.qty);
  }
  return current - afterEnd;
}

/** Day part of an ISO timestamp / date (`2026-09-10T00:00:00Z` → `2026-09-10`). */
const dayOf = (v?: string | null): string | null => {
  const d = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/**
 * When did this item start existing? The earlier of its master `createdAt` and
 * its first ledger row — a real movement always wins over a wrong or imported
 * timestamp. `null` (legacy rows that only carry a baseline) = never hidden.
 */
export function skuBirthDate(sku: SKU | CS_SKU, firstDate?: string | null): string | null {
  const created = dayOf(sku.createdAt);
  const moved = dayOf(firstDate);
  if (created && moved) return created < moved ? created : moved;
  return created || moved;
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
  /** Also list items that had no opening balance and no movement in the month (Finance/audit view). Default false. */
  includeEmpty?: boolean;
}

interface ValuedRow {
  id: string;
  name: string;
  sku: SKU | CS_SKU;
  firstDate: string | null;
  openingQty: number; openingVal: number;
  stockInQty: number; stockInVal: number;
  stockOutQty: number; stockOutVal: number;
  closingQty: number; closingVal: number;
  variance: number;
}

function valueRow(sku: SKU | CS_SKU, transactions: StockTransaction[], month: string): ValuedRow {
  const mv = getMonthMovement(sku, transactions, month);
  const cpu = castNumber(sku.costPerUnit);
  // Finance rule: Opening = last month's Closing. A new item's OPENING row is
  // Stock In in the month it is dated: a hat created in June with 500 and
  // issued 500 in June reads Opening 0 / In 500 / Out 500 / Closing 0.
  const opening = mv.opening;
  const stockIn = mv.stockIn;
  return {
    id: String(sku.id),
    name: sku.name || '',
    sku,
    firstDate: mv.firstDate,
    openingQty: opening, openingVal: opening * cpu,
    stockInQty: stockIn, stockInVal: stockIn * cpu,
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
  firstDate: a.firstDate && b.firstDate ? (a.firstDate < b.firstDate ? a.firstDate : b.firstDate) : (a.firstDate || b.firstDate),
  openingQty: a.openingQty + b.openingQty, openingVal: a.openingVal + b.openingVal,
  stockInQty: a.stockInQty + b.stockInQty, stockInVal: a.stockInVal + b.stockInVal,
  stockOutQty: a.stockOutQty + b.stockOutQty, stockOutVal: a.stockOutVal + b.stockOutVal,
  closingQty: a.closingQty + b.closingQty, closingVal: a.closingVal + b.closingVal,
  variance: a.variance + b.variance,
});

const byName = (a: MonthEndRow, b: MonthEndRow) => a.sku.name.localeCompare(b.sku.name, 'la');

/** Nothing to report: no balance and no movement in the month. */
const isEmptyRow = (r: MonthEndRow) =>
  r.openingQty === 0 && r.stockInQty === 0 && r.stockOutQty === 0 && r.closingQty === 0;

/**
 * Build the Month End Report rows for a month. MKT and CS are always computed
 * against their OWN ledger and cost; "all" merges the two results by matched
 * SKU and sums quantities + values (a warehouse's stock is never re-priced).
 *
 * A row is dropped when the item did not exist yet at the month end (its
 * `createdAt` / first movement is later) — an item never appears before it was
 * created — and, unless `includeEmpty` is set, when it has nothing to report
 * (Opening = Stock In = Stock Out = Closing = 0).
 */
export function getMonthEndRows(args: MonthEndArgs): MonthEndRow[] {
  const { month, scope, category = 'All', vat = false, includeEmpty = false } = args;
  const factor = vat ? 1.1 : 1;
  const { to } = monthBounds(month);
  const keep = (s: SKU | CS_SKU) => category === 'All' || s.category === category;
  // Never show an item in a month that ended before it started existing.
  const existed = (r: ValuedRow) => {
    const birth = skuBirthDate(r.sku, r.firstDate);
    return !birth || birth <= to;
  };
  const mktTx = reportableTransactions(args.transactions, args.tickets);
  const csTx = reportableTransactions(args.csTransactions, args.tickets);
  const emit = (rows: MonthEndRow[]) =>
    (includeEmpty ? rows : rows.filter((r) => !isEmptyRow(r))).sort(byName);

  if (scope === 'mkt' || scope === 'cs') {
    const list = scope === 'mkt' ? args.skus : args.csSkus;
    const txs = scope === 'mkt' ? mktTx : csTx;
    return emit(
      list.filter(keep).map((s) => valueRow(s, txs, month))
        .filter(existed)
        .map((v) => finish(`${scope}:${v.id}`, v, factor, false)),
    );
  }

  const mktRows = args.skus.filter(keep).map((s) => valueRow(s, mktTx, month)).filter(existed);
  const csRows = args.csSkus.filter(keep).map((s) => valueRow(s, csTx, month)).filter(existed);
  return emit(
    matchAcrossWarehouses(mktRows, csRows).map((pair) =>
      pair.mkt && pair.cs
        ? finish(pair.key, sumRows(pair.mkt, pair.cs), factor, true)
        : finish(pair.key, (pair.mkt || pair.cs) as ValuedRow, factor, false),
    ),
  );
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