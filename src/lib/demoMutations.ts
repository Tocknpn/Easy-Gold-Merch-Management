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

  // ── availability guard (mirrors create_ticket SQL) ─────────────
  // Stock requested by tickets that are still pending is already
  // booked (deducted at submission), so currentStock IS availability —
  // except for legacy pending tickets created before booking-at-creation.
  const hasBooking = (ticketId: string, skuId: string) =>
    demoDB.transactions.some((tx) => tx.ticketId === ticketId && tx.skuId === skuId && tx.type === 'deduction' && tx.status === 'Booked');
  const need = new Map<string, number>();
  for (const i of items) need.set(i.skuId, (need.get(i.skuId) || 0) + i.qtyRequested);
  for (const [skuId, qty] of need) {
    const sku = demoDB.skus.find((s) => s.id === skuId);
    if (!sku) throw new Error(`Unknown item: ${skuId}`);
    let unbooked = 0;
    for (const t of demoDB.tickets) {
      if (t.status !== 'pending') continue;
      for (const it of demoDB.items[t.id] || []) {
        if (it.skuId === skuId && !hasBooking(t.id, skuId)) unbooked += it.qtyRequested;
      }
    }
    if (qty > sku.currentStock - unbooked) {
      throw new Error(
        `Insufficient stock for "${sku.name}" — available: ${sku.currentStock - unbooked}, requested: ${qty}. ` +
        'Someone may have just booked it — please refresh and try again.',
      );
    }
  }

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

  // ── BOOK the requested qty right away (accrual) ────────────────
  for (const i of items) {
    const sku = demoDB.skus.find((s) => s.id === i.skuId);
    if (!sku) continue;
    sku.currentStock -= i.qtyRequested;
    demoDB.transactions.unshift({
      ticketId: id, skuId: i.skuId, skuName: i.skuName, qty: i.qtyRequested, type: 'deduction',
      date: todayStr(), actionAt: new Date().toISOString(), actionBy: p.createdByName,
      status: 'Booked', comment: 'Stock booked on ticket submission',
    });
  }
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

  // Resolve the caller's REAL role from the known user directory (demo mode has
  // no JWT — the UI always passes the logged-in user's name/role). Mirrors the
  // live engine's enforcement: auth.uid() → public.users.role.
  let callerRole = meta.actorRole || '';
  let callerEmail = '';
  const actorUser = demoDB.users.find(
    (u) => u.fullName && u.fullName.toLowerCase() === String(meta.actorName || '').trim().toLowerCase(),
  );
  if (actorUser) { callerRole = actorUser.role; callerEmail = actorUser.email; }

  const roleOk =
    (status === 'reviewed' && ['warehouse', 'admin'].includes(callerRole)) ||
    (status === 'lm_approved' && callerRole === 'line_manager') ||
    (status === 'finalized' && ['director', 'admin'].includes(callerRole)) ||
    (status === 'rejected' && ['warehouse', 'line_manager', 'director', 'admin'].includes(callerRole)) ||
    (status === 'recalled' && (['warehouse', 'admin'].includes(callerRole) || (callerEmail && callerEmail === t.createdBy))) ||
    (status === 'returned' && ['warehouse', 'admin'].includes(callerRole));
  if (!roleOk) throw new Error(`Not authorized: ${callerRole || 'unknown'} cannot ${status}`);

  const allowed =
    (status === 'reviewed' && old === 'pending') ||
    (status === 'lm_approved' && old === 'reviewed') ||
    (status === 'finalized' && (old === 'lm_approved' || (meta.forceFinalize && (old === 'pending' || old === 'reviewed')))) ||
    (status === 'rejected' && ['pending', 'reviewed', 'lm_approved'].includes(old)) ||
    (status === 'recalled' && ['reviewed', 'lm_approved'].includes(old)) ||
    (status === 'returned' && old === 'finalized' && t.type === 'borrow');
  if (!allowed) throw new Error(`Illegal transition: ${old} → ${status}`);

  const actor = meta.actorName || 'System';

  // REVIEWED: confirm the booking made at submission (true-up to approved qty)
  if (status === 'reviewed') {
    for (const it of demoDB.items[t.id] || []) {
      const mt = meta.items?.find((m) => m.skuId === it.skuId);
      // NULL-safe: a stale 0 on pending rows means "not approved yet".
      // Cap qty_approved at qty_requested — the warehouse can never approve
      // (and book) MORE than was requested (mirrors the SQL cap).
      const qty = mt && mt.qtyApproved !== undefined
        ? Math.min(Math.max(0, mt.qtyApproved), it.qtyRequested)
        : (it.qtyApproved || it.qtyRequested);
      const booking = demoDB.transactions.find(
        (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction' && tx.status === 'Booked',
      );
      const bookedQty = booking ? booking.qty : 0;

      if (qty <= 0) {
        // nothing approved → release whatever was booked
        it.qtyApproved = 0;
        if (booking) {
          const sku0 = demoDB.skus.find((s) => s.id === it.skuId);
          if (sku0) sku0.currentStock += bookedQty;
          booking.status = 'Booking Cancelled';
          booking.comment = 'Booking released - nothing approved at review';
        }
        continue;
      }

      it.qtyApproved = qty;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (booking) {
        // booking exists: true-up only the difference (never deduct twice)
        if (qty !== bookedQty) {
          if (sku) sku.currentStock = Math.max(0, sku.currentStock - (qty - bookedQty));
          booking.qty = qty;
          booking.comment = 'Stock booked - confirmed at review';
        }
      } else if (sku) {
        // legacy ticket submitted before booking-at-creation: deduct now
        sku.currentStock = Math.max(0, sku.currentStock - qty);
        demoDB.transactions.unshift({
          ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'deduction',
          date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor, status: 'Booked', comment: 'Stock booked on review',
        });
      }
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
  if ((status === 'rejected' || status === 'recalled') && ['pending', 'reviewed', 'lm_approved'].includes(old)) {
    for (const it of demoDB.items[t.id] || []) {
      let qty: number;
      if (old === 'pending') {
        // rejected/recalled before review → release the booking made at submission
        const booking = demoDB.transactions.find(
          (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction' && tx.status === 'Booked',
        );
        qty = booking ? booking.qty : 0;
        if (booking) booking.status = 'Booking Cancelled';
      } else {
        qty = it.qtyApproved ?? it.qtyRequested;
      }
      if (qty <= 0) continue;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (sku) sku.currentStock += qty;
      demoDB.transactions.unshift({
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'addition',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor,
        status: status === 'rejected'
          ? (old === 'pending' ? 'Rejected - Booking Released' : 'Rejected - Stock Returned')
          : (old === 'pending' ? 'Recalled - Booking Released' : 'Recalled - Stock Returned'),
        comment: meta.comment || '',
      });
    }
  }

  // RETURNED (borrow): add back returned qty + broken
  if (status === 'returned') {
    for (const it of demoDB.items[t.id] || []) {
      const rt = meta.returns?.find((m) => m.skuId === it.skuId);
      // Returned qty is capped at the approved qty (mirrors the SQL cap).
      const approved = it.qtyApproved ?? it.qtyRequested ?? 0;
      const ret = rt && rt.qtyReturned !== undefined
        ? Math.min(Math.max(0, rt.qtyReturned), approved)
        : approved;
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