// ── In-memory demo engine: mutations (mirrors the SQL engine) ────────────
import { demoDB, nextId } from './demoStore';
import type { SKU, CS_SKU, TicketStatus, TicketType } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';

export function demoCreateTicket(p: {
  createdBy: string; createdByName: string; department: string;
  deliveryDate?: string | null; remark?: string; type: TicketType; returnDate?: string | null;
  items: { skuId: string; skuName: string; qtyRequested: number; unit?: string }[];
}): string {
  const items = p.items.filter((i) => castNumber(i.qtyRequested) > 0);
  if (items.length === 0) throw new Error('Ticket must have at least one item');
  const id = nextId('TKT-');
  demoDB.tickets.unshift({
    id, createdBy: p.createdBy, createdByName: p.createdByName, department: p.department,
    deliveryDate: p.deliveryDate || null, remark: p.remark || '', status: 'pending', type: p.type,
    returnDate: p.returnDate || null, createdAt: new Date().toISOString(),
    lastActionAt: new Date().toISOString(), lastActionBy: p.createdByName,
    lastActionStatus: 'Pending', lastActionComment: 'Ticket submitted',
  });
  demoDB.items[id] = items.map((i) => ({ skuId: i.skuId, skuName: i.skuName, qtyRequested: i.qtyRequested, qtyApproved: null, unit: i.unit || 'pcs' }));
  demoDB.actions.unshift({ ticketId: id, action: 'Created', status: 'pending', actionAt: new Date().toISOString(), actionBy: p.createdByName, role: '', comment: 'Ticket submitted' });
  return id;
}

export function demoUpdateTicketStatus(
  ticketId: string, status: TicketStatus, meta: {
    actorName?: string; actorRole?: string; comment?: string;
    actualDeliveryDate?: string | null; items?: ({ skuId: string; qtyApproved: number })[] | null;
    returns?: ({ skuId: string; qtyReturned: number; qtyBroken: number })[] | null;
    forceFinalize?: boolean;
  } = {},
): void {
  const t = demoDB.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error('Ticket not found');
  const old = t.status;

  const allowed =
    (status === 'reviewed' && old === 'pending') ||
    (status === 'lm_approved' && old === 'reviewed') ||
    (status === 'finalized' && (old === 'lm_approved' || (meta.forceFinalize && (old === 'pending' || old === 'reviewed')))) ||
    (status === 'rejected' && ['pending', 'reviewed', 'lm_approved'].includes(old)) ||
    (status === 'recalled' && ['reviewed', 'lm_approved'].includes(old)) ||
    (status === 'returned' && old === 'finalized' && t.type === 'borrow');
  if (!allowed) throw new Error(`Illegal transition: ${old} → ${status}`);

  const actor = meta.actorName || 'System';

  // REVIEWED: deduct (book) stock, apply approved quantities
  if (status === 'reviewed') {
    for (const it of demoDB.items[t.id] || []) {
      const mt = meta.items?.find((m) => m.skuId === it.skuId);
      const qty = mt && mt.qtyApproved !== undefined ? mt.qtyApproved : (it.qtyApproved ?? it.qtyRequested);
      it.qtyApproved = qty;
      if (qty <= 0) continue;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (sku) sku.currentStock = Math.max(0, sku.currentStock - qty);
      demoDB.transactions.unshift({
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'deduction',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor, status: 'Booked', comment: 'Stock booked on review',
      });
    }
  }

  // FINALIZED + cs_transfer → auto-restock CS warehouse
  if (status === 'finalized' && t.type === 'cs_transfer' && old !== 'finalized') {
    for (const it of (demoDB.items[t.id] || [])) {
      const qty = it.qtyApproved ?? it.qtyRequested;
      if (qty <= 0) continue;
      const cs = demoDB.csSkus.find((s) => s.id === it.skuId);
      if (cs) { cs.currentStock += qty; cs.totalInflow += qty; }
      else {
        const mkt = demoDB.skus.find((s) => s.id === it.skuId);
        demoDB.csSkus.push({
          id: it.skuId, name: it.skuName, category: mkt?.category || 'General', unit: mkt?.unit || 'pcs',
          openingBalance: qty, currentStock: qty, totalInflow: qty, imageUrl: mkt?.imageUrl || null,
          lowStockThreshold: mkt?.lowStockThreshold || 0, costPerUnit: mkt?.costPerUnit || 0,
        });
      }
      demoDB.csTransactions.unshift({
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'addition',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: 'MKT Warehouse',
        comment: 'Auto-transferred from MKT WH - Ticket: ' + t.id,
      });
    }
  }
// REJECTED / RECALLED: return booked stock (addition)
  if ((status === 'rejected' || status === 'recalled') && (old === 'reviewed' || old === 'lm_approved')) {
    for (const it of demoDB.items[t.id] || []) {
      const qty = it.qtyApproved ?? it.qtyRequested;
      if (qty <= 0) continue;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (sku) sku.currentStock += qty;
      demoDB.transactions.unshift({
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'addition',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor,
        status: status === 'rejected' ? 'Rejected - Stock Returned' : 'Recalled - Stock Returned',
        comment: meta.comment || '',
      });
    }
  }

  // RETURNED (borrow): add back returned qty + broken
  if (status === 'returned') {
    for (const it of demoDB.items[t.id] || []) {
      const rt = meta.returns?.find((m) => m.skuId === it.skuId);
      const ret = rt && rt.qtyReturned !== undefined ? rt.qtyReturned : (it.qtyApproved ?? it.qtyRequested ?? 0);
      const broken = rt?.qtyBroken || 0;
      if (ret <= 0) continue;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (sku) sku.currentStock += ret;
      demoDB.transactions.unshift({
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty: ret, qtyBroken: broken, type: 'addition',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor, status: 'Returned',
        comment: (meta.comment || '') + (broken > 0 ? ` (${broken} broken/lost)` : ''),
      });
    }
  }



  t.status = status;
  t.returnedProcessed = status === 'returned';
  t.lastActionAt = new Date().toISOString();
  t.lastActionBy = actor;
  t.lastActionStatus = status;
  t.lastActionComment = meta.comment || '';
  if (status === 'reviewed') t.whComment = meta.comment || t.whComment;
  if (status === 'lm_approved') t.lmComment = meta.comment || t.lmComment;
  if (status === 'finalized') t.directorComment = meta.comment || t.directorComment;
  if (meta.actualDeliveryDate) t.actualDeliveryDate = meta.actualDeliveryDate;
  if (status === 'returned') t.actualReturnDate = todayStr();
  demoDB.actions.unshift({ ticketId: t.id, action: status, status, actionAt: new Date().toISOString(), actionBy: actor, role: meta.actorRole, comment: meta.comment || '' });
}