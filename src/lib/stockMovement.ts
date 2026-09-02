// ── Report math (mirrors §7 of the APP MASTER SPEC exactly) ──────────────
import type { SKU, StockTransaction, Ticket } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';

export interface StockMovement {
  stockIn: number;
  stockOut: number;
  opening: number;
  closing: number;
  usagePct: number;
  lossQty: number;
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
  const from = `${month}-01`;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return skus.map((sku) => {
    const mv = getStockMovement(sku, transactions, from, to);
    return {
      sku,
      openingQty: mv.opening,
      stockInQty: mv.stockIn,
      stockOutQty: mv.stockOut,
      closingQty: mv.closing,
    };
  });
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
    if (role === 'warehouse')
      return t.status === 'pending' || (t.status === 'finalized' && t.type === 'borrow' && !t.returnedProcessed);
    if (role === 'line_manager') return t.status === 'reviewed';
    if (role === 'director') return t.status === 'lm_approved';
    if (role === 'admin') return !['finalized', 'rejected', 'returned', 'recalled'].includes(t.status);
    return false;
  }).length;
}