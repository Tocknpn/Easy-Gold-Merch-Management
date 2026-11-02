// ── Stock Analytics aggregation helpers ───────────────────────────────────
// Pure, synchronous functions over the already-normalized arrays DataContext
// exposes (identical shape in demo and live mode) — no I/O, no branching.
import type { CS_SKU, SKU, StockTransaction, Ticket } from './types';
import { castNumber } from './types';
import { closingQtyAsOf, reportableTransactions } from './stockMovement';
import { shiftDay } from './utils';

type AnySku = SKU | CS_SKU;

const inRange = (date: string | null | undefined, from: string, to: string): boolean =>
  !!date && date >= from && date <= to;

const cpuOf = (skus: AnySku[], skuId?: string | null, skuName?: string | null): number =>
  skus.find((s) => s.id === skuId || (skuName && s.name === skuName))?.costPerUnit || 0;

// ── Top-N stock-out by SKU (bar chart) ────────────────────────────────────
export interface StockOutRow { skuId: string; skuName: string; qty: number; value: number }

export function topStockOutBySku(args: {
  skus: AnySku[]; transactions: StockTransaction[]; tickets: Ticket[];
  from: string; to: string; topN?: number;
}): StockOutRow[] {
  const { skus, transactions, tickets, from, to, topN = 20 } = args;
  const rows = new Map<string, StockOutRow>();
  for (const tx of reportableTransactions(transactions, tickets)) {
    if (tx.type !== 'deduction' || !inRange(tx.date, from, to)) continue;
    const skuId = tx.skuId || tx.skuName || '';
    if (!skuId) continue;
    const skuName = tx.skuName || skuId;
    const cpu = cpuOf(skus, tx.skuId, tx.skuName);
    const existing = rows.get(skuId) || { skuId, skuName, qty: 0, value: 0 };
    existing.qty += castNumber(tx.qty);
    existing.value += castNumber(tx.qty) * cpu;
    rows.set(skuId, existing);
  }
  return [...rows.values()].sort((a, b) => b.qty - a.qty).slice(0, topN);
}

// ── Period-over-period stock-out VALUE comparison (header stat) ──────────
export interface PeriodComparison {
  currentValue: number; priorValue: number; deltaValue: number;
  pctChange: number | null; priorFrom: string; priorTo: string;
}

/** Equal-length immediately-prior window: [from,to] → the same-length range ending the day before `from`. */
export function priorPeriod(from: string, to: string): { from: string; to: string } {
  const lengthDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const priorTo = shiftDay(from, -1);
  const priorFrom = shiftDay(priorTo, -(lengthDays - 1));
  return { from: priorFrom, to: priorTo };
}

function stockOutValue(skus: AnySku[], tx: StockTransaction[], tickets: Ticket[], from: string, to: string): number {
  let total = 0;
  for (const t of reportableTransactions(tx, tickets)) {
    if (t.type !== 'deduction' || !inRange(t.date, from, to)) continue;
    total += castNumber(t.qty) * cpuOf(skus, t.skuId, t.skuName);
  }
  return total;
}

export function stockOutValueComparison(args: {
  skus: AnySku[]; transactions: StockTransaction[]; tickets: Ticket[];
  from: string; to: string;
}): PeriodComparison {
  const { skus, transactions, tickets, from, to } = args;
  const prior = priorPeriod(from, to);
  const currentValue = stockOutValue(skus, transactions, tickets, from, to);
  const priorValue = stockOutValue(skus, transactions, tickets, prior.from, prior.to);
  const deltaValue = currentValue - priorValue;
  return {
    currentValue, priorValue, deltaValue,
    pctChange: priorValue > 0 ? (deltaValue / priorValue) * 100 : null,
    priorFrom: prior.from, priorTo: prior.to,
  };
}

// ── Stock-out value by department (ranked list / mini-pie) ───────────────
export interface DeptUsageRow { department: string; value: number; pct: number }

export function stockOutValueByDept(args: {
  skus: AnySku[]; transactions: StockTransaction[]; tickets: Ticket[];
  from: string; to: string;
}): DeptUsageRow[] {
  const { skus, transactions, tickets, from, to } = args;
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const byDept = new Map<string, number>();
  let total = 0;
  for (const tx of reportableTransactions(transactions, tickets)) {
    if (tx.type !== 'deduction' || !inRange(tx.date, from, to)) continue;
    const dept = (tx.ticketId && ticketById.get(tx.ticketId)?.department) || 'Unassigned';
    const value = castNumber(tx.qty) * cpuOf(skus, tx.skuId, tx.skuName);
    byDept.set(dept, (byDept.get(dept) || 0) + value);
    total += value;
  }
  return [...byDept.entries()]
    .map(([department, value]) => ({ department, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ── Current stock value contribution per SKU (pie) + stat-card totals ────
export interface SkuValueRow { skuId: string; skuName: string; qty: number; value: number; pct: number }
export interface StockRemainResult { totalValue: number; skuCount: number; unitCount: number; bySku: SkuValueRow[] }

export function stockRemainAsOf(args: {
  skus: AnySku[]; transactions: StockTransaction[]; tickets: Ticket[]; asOf: string;
}): StockRemainResult {
  const { skus, transactions, tickets, asOf } = args;
  const reportableTx = reportableTransactions(transactions, tickets);
  const rows = skus.map((sku) => {
    const qty = closingQtyAsOf(sku, reportableTx, asOf);
    return { skuId: sku.id, skuName: sku.name, qty, value: qty * sku.costPerUnit, pct: 0 };
  });
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const bySku = rows
    .filter((r) => r.qty > 0)
    .map((r) => ({ ...r, pct: totalValue > 0 ? (r.value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return {
    totalValue,
    skuCount: bySku.length,
    unitCount: bySku.reduce((a, r) => a + r.qty, 0),
    bySku,
  };
}
