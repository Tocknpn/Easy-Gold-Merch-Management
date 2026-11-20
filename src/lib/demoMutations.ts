// ── In-memory demo engine: mutations (mirrors the SQL engine) ────────────
import { demoDB, nextId, nextLedgerId } from './demoStore';
import type { SKU, CS_SKU, TicketStatus, TicketType, TicketEditChange, TicketEditLine } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';
import { minBalanceFrom } from './demoData';
import { demoCancelBooking, demoSetTicketRowQty, ledgerInsertDate } from './demoLedgerLock';
import { ticketEditWindowStart } from './ledgerLock';

/** Ledger date of a ticket's movements = its delivery date, else its created
 *  day (mirrors ticket_ledger_date in migration 0026). */
export const ticketLedgerDate = (t: { deliveryDate?: string | null; createdAt?: string | null }): string =>
  ledgerInsertDate(String(t.deliveryDate || '').slice(0, 10) || String(t.createdAt || '').slice(0, 10) || todayStr(), {});
// ↑ 0027: a ticket row is never dated into a month already reported to
//   Finance — corrections made later land on today instead.

/** Ledger date of an Admin ticket edit (mirrors the 0027 trigger): the
 *  delivery date when it is in the current or PREVIOUS month, else today. */
const ticketEditDate = (t: { deliveryDate?: string | null; createdAt?: string | null }): string => {
  const raw = String(t.deliveryDate || '').slice(0, 10) || String(t.createdAt || '').slice(0, 10) || todayStr();
  return raw >= ticketEditWindowStart() ? raw : ticketLedgerDate(t);
};

/** A deduction of `qty` dated `day` must not push any day's balance below zero
 *  (mirrors dated_out_error in 0026). `sku.currentStock` = stock BEFORE it. */
function assertTicketDatedOut(sku: SKU | CS_SKU, cs: boolean, day: string, qty: number): void {
  if (!(qty > 0)) return;
  const { min, at } = minBalanceFrom(sku, cs ? demoDB.csTransactions : demoDB.transactions, day);
  if (min < qty) {
    throw new Error(
      `Not enough stock of "${sku.name}" on ${at}: only ${min} left that day — ${qty} dated ${day} (delivery date) would make it negative`,
    );
  }
}

/** Comment written when a Warehouse Manager's own request skips warehouse review
 *  (mirrored by create_ticket in migration 0017). */
export const AUTO_REVIEW_NOTE =
  'Auto-reviewed — requested by the Warehouse Manager; routed to the Line Manager';

/** Trimmed/lowercased item name — the fallback identity used to pair an item
 *  across warehouses when the ids differ (mirrors src/lib/warehouseMerge.ts and
 *  the CS lookup in transfer_mkt_to_cs / update_ticket_status). */
const normName = (s?: string | null) => (s || '').trim().toLowerCase();

export function demoCreateTicket(p: {
  createdBy: string; createdByName: string; department: string;
  deliveryDate?: string | null; remark?: string; type: TicketType; returnDate?: string | null;
  items: { skuId: string; skuName: string; qtyRequested: number; unit?: string }[];
}): string {
  const items = p.items.filter((i) => castNumber(i.qtyRequested) > 0);
  if (items.length === 0) throw new Error('Ticket must have at least one item');

  // ── Warehouse Manager self-request: skip the warehouse review step ─────
  // The requester IS the reviewing authority, so the ticket is created already
  // 'reviewed' (booking confirmed, qty_approved = requested) and lands straight
  // in the Line Manager's queue instead of the manager's own Action Center.
  const creatorRole = demoDB.users.find(
    (u) => u.email.toLowerCase() === String(p.createdBy).trim().toLowerCase(),
  )?.role;
  const autoReviewed = creatorRole === 'warehouse';

  // ── availability guard (mirrors create_ticket SQL) ─────────────
  // Stock requested by tickets that are still pending is already
  // booked (deducted at submission), so currentStock IS availability —
  // except for legacy pending tickets created before booking-at-creation.
  const hasBooking = (ticketId: string, skuId: string) =>
    demoDB.transactions.some((tx) => tx.ticketId === ticketId && tx.skuId === skuId && tx.type === 'deduction' && tx.status === 'Booked');
  const ledgerDay = ledgerInsertDate(String(p.deliveryDate || '').slice(0, 10) || todayStr(), {});
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
    // 0026: a PAST delivery date puts this Stock Out in an earlier month.
    if (ledgerDay < todayStr()) assertTicketDatedOut(sku, false, ledgerDay, qty);
  }

  const id = nextId('TKT-');
  const submittedAt = new Date().toISOString();
  demoDB.tickets.unshift({
    id, createdBy: p.createdBy, createdByName: p.createdByName, department: p.department,
    deliveryDate: p.deliveryDate || null, remark: p.remark || '',
    status: autoReviewed ? 'reviewed' : 'pending', type: p.type,
    returnDate: p.returnDate || null, createdAt: submittedAt,
    // The reviewed level's comment/timestamp is stamped right away so the modal
    // shows why the warehouse step is already green.
    ...(autoReviewed ? { whComment: AUTO_REVIEW_NOTE, whCommentAt: submittedAt } : {}),
    lastActionAt: submittedAt, lastActionBy: p.createdByName,
    lastActionStatus: autoReviewed ? 'Reviewed' : 'Pending',
    lastActionComment: autoReviewed ? AUTO_REVIEW_NOTE : 'Ticket submitted',
  });
  demoDB.items[id] = items.map((i) => ({
    skuId: i.skuId, skuName: i.skuName, qtyRequested: i.qtyRequested,
    // A warehouse manager's request confirms the booking with the requested qty
    // (the same value the 'reviewed' step would have written).
    qtyApproved: autoReviewed ? i.qtyRequested : null,
    unit: i.unit || 'pcs',
  }));
  demoDB.actions.unshift({ ticketId: id, action: 'Created', status: 'pending', actionAt: submittedAt, actionBy: p.createdByName, role: creatorRole || '', comment: 'Ticket submitted' });
  if (autoReviewed) {
    demoDB.actions.unshift({ ticketId: id, action: 'Reviewed', status: 'reviewed', actionAt: submittedAt, actionBy: p.createdByName, role: 'warehouse', comment: AUTO_REVIEW_NOTE });
  }

  // ── BOOK the requested qty right away (accrual) ────────────────
  for (const i of items) {
    const sku = demoDB.skus.find((s) => s.id === i.skuId);
    if (!sku) continue;
    sku.currentStock -= i.qtyRequested;
    demoDB.transactions.unshift({
      id: nextLedgerId(),
      ticketId: id, skuId: i.skuId, skuName: i.skuName, qty: i.qtyRequested, type: 'deduction',
      date: ledgerDay, actionAt: new Date().toISOString(), actionBy: p.createdByName,
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
    (status === 'recalled' && ['pending', 'reviewed', 'lm_approved'].includes(old)) ||
    (status === 'returned' && old === 'finalized' && t.type === 'borrow');
  if (!allowed) throw new Error(`Illegal transition: ${old} → ${status}`);

  const actor = meta.actorName || 'System';

  // APPROVAL STEPS (reviewed / lm_approved / finalized) all decide the approved
  // quantity — "last value wins". The ceiling is what is actually AVAILABLE:
  // current stock + what this ticket already booked (the booking is already
  // deducted from current_stock). Approving MORE than the request is allowed —
  // the engine true-ups the booking by the difference at each step.
  const qtyNotes: string[] = [];
  const applyItems = () => {
    for (const it of demoDB.items[t.id] || []) {
      const mt = meta.items?.find((m) => m.skuId === it.skuId);
      const booking = demoDB.transactions.find(
        (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction' && tx.status === 'Booked',
      );
      const bookedQty = booking ? booking.qty : 0;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      const available = (sku ? sku.currentStock : 0) + bookedQty;

      // Payload wins. Otherwise, at the first step a stale 0 means "not decided
      // yet" → fall back to the requested qty; at later steps keep the approved.
      const raw = mt && mt.qtyApproved !== undefined
        ? Math.max(0, mt.qtyApproved)
        : status === 'reviewed'
          ? (it.qtyApproved || it.qtyRequested)
          : (it.qtyApproved ?? it.qtyRequested ?? 0);
      const qty = Math.min(Math.floor(raw), available);

      if (qty <= 0) {
        // nothing approved → release whatever was booked
        it.qtyApproved = 0;
        if (booking) {
          if (sku) sku.currentStock += bookedQty;
          demoCancelBooking(booking, 'Booking released - nothing approved at review', actor);
        }
        continue;
      }

      it.qtyApproved = qty;
      if (booking) {
        // booking exists: true-up only the difference (never deduct twice)
        if (qty !== bookedQty) {
          if (sku && qty > bookedQty) assertTicketDatedOut(sku, false, ticketLedgerDate(t), qty - bookedQty);
          if (sku) sku.currentStock = Math.max(0, sku.currentStock - (qty - bookedQty));
          demoSetTicketRowQty(demoDB.transactions, booking, qty, false, actor);
          booking.comment = 'Stock booked - confirmed at review';
          qtyNotes.push(`${it.skuName}: ${bookedQty} → ${qty}`);
        }
      } else if (sku) {
        // legacy ticket submitted before booking-at-creation: deduct now
        sku.currentStock = Math.max(0, sku.currentStock - qty);
        demoDB.transactions.unshift({
          id: nextLedgerId(),
          ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty, type: 'deduction',
          date: ticketLedgerDate(t), actionAt: new Date().toISOString(), actionBy: actor, status: 'Booked', comment: 'Stock booked on review',
        });
        qtyNotes.push(`${it.skuName}: ${bookedQty} → ${qty}`);
      }
    }
  };

  if (['reviewed', 'lm_approved', 'finalized'].includes(status)) applyItems();

  // FINALIZED + cs_transfer → auto-restock CS warehouse
  // The arrival that CREATES the CS item is its opening balance, so that ledger
  // row is stamped 'OPENING' and the Dashboard shows the qty under Opening ONLY
  // (a ticket reference there made it count as Opening AND Stock In). Every
  // later arrival of the same item is a real Stock In under the ticket id.
  // The CS row is matched by shared id first, then by trimmed/lowercased name.
  if (status === 'finalized' && t.type === 'cs_transfer' && old !== 'finalized') {
    for (const it of (demoDB.items[t.id] || [])) {
      const qty = it.qtyApproved ?? it.qtyRequested;
      if (qty <= 0) continue;
      const cs = demoDB.csSkus.find((s) => s.id === it.skuId)
        || demoDB.csSkus.find((s) => normName(s.name) === normName(it.skuName));
      const genesis = !cs;
      if (cs) { cs.currentStock += qty; cs.totalInflow += qty; }
      else {
        const mkt = demoDB.skus.find((s) => s.id === it.skuId);
        demoDB.csSkus.push({
          id: it.skuId, name: it.skuName, category: mkt?.category || 'General', unit: mkt?.unit || 'pcs',
          openingBalance: qty, currentStock: qty, totalInflow: qty, imageUrl: mkt?.imageUrl || null,
          lowStockThreshold: mkt?.lowStockThreshold || 0, costPerUnit: mkt?.costPerUnit || 0,
          createdAt: todayStr(), status: 'active',
        });
      }
      demoDB.csTransactions.unshift({
        id: nextLedgerId(),
        ticketId: genesis ? 'OPENING' : t.id,
        skuId: cs ? cs.id : it.skuId, skuName: it.skuName, qty, type: 'addition',
        date: ticketLedgerDate(t), actionAt: new Date().toISOString(), actionBy: 'MKT Warehouse',
        comment: 'Auto-transferred from MKT WH - Ticket: ' + t.id,
      });
    }
  }
  // FINALIZED: mark the confirmed MKT booking as deducted (Book → Deduct)
  if (status === 'finalized') {
    for (const tx of demoDB.transactions) {
      if (tx.ticketId === t.id && tx.type === 'deduction' && tx.status === 'Booked') {
        tx.status = 'Deducted';
        tx.comment = 'Stock deducted on finalize';
      }
    }
  }

  // REJECTED / RECALLED: release the booking. CHANGED (0013): the booking is
  // cancelled and the stock restored, but NO reversal `addition` row is
  // written any more — that phantom row was counted as Stock In for a ticket
  // that never moved stock, which made the Stock In / Out reports look wrong.
  // The cancelled booking keeps the audit trail and is ignored by the reports.
  if ((status === 'rejected' || status === 'recalled') && ['pending', 'reviewed', 'lm_approved'].includes(old)) {
    for (const it of demoDB.items[t.id] || []) {
      const note = status === 'rejected' ? 'ticket rejected' : 'ticket recalled';
      let qty: number;
      if (old === 'pending') {
        // rejected/recalled before review → release the booking made at submission
        const booking = demoDB.transactions.find(
          (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction' && tx.status === 'Booked',
        );
        qty = booking ? booking.qty : 0;
        if (booking) demoCancelBooking(booking, `Booking released - ${note}`, actor);
      } else {
        // reviewed/lm_approved → qty is already deducted; cancel the booking
        qty = it.qtyApproved ?? it.qtyRequested;
        const rows = demoDB.transactions.filter(
          (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction' && tx.status === 'Booked',
        );
        // Fallback: ledger rows written by an older engine (other status labels)
        const fallback = rows.length
          ? rows
          : demoDB.transactions.filter(
              (tx) => tx.ticketId === t.id && tx.skuId === it.skuId && tx.type === 'deduction'
                && !['Booking Cancelled', 'Deducted'].includes(String(tx.status || '')),
            );
        for (const tx of fallback) demoCancelBooking(tx, `Booking cancelled - ${note}`, actor);
      }
      if (qty <= 0) continue;
      const sku = demoDB.skus.find((s) => s.id === it.skuId);
      if (sku) sku.currentStock += qty;
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
        id: nextLedgerId(),
        ticketId: t.id, skuId: it.skuId, skuName: it.skuName, qty: ret, qtyBroken: broken, type: 'addition',
        date: todayStr(), actionAt: new Date().toISOString(), actionBy: actor, status: 'Returned',
        comment: (meta.comment || '') + (broken > 0 ? ` (${broken} broken/lost)` : ''),
      });
    }
  }



  const nowIso = new Date().toISOString();
  const baseComment = meta.comment || '';
  // When an approver changes a quantity, say so in the trail so the final
  // number is explained ("any approver until finalize — last value wins").
  const effectiveComment = qtyNotes.length
    ? `${baseComment}${baseComment ? ' · ' : ''}approved qty: ${qtyNotes.join('; ')}`
    : baseComment;
  t.status = status;
  t.returnedProcessed = status === 'returned';
  t.lastActionAt = nowIso;
  t.lastActionBy = actor;
  t.lastActionStatus = status;
  t.lastActionComment = effectiveComment;
  // Per-level comments + WHEN that level commented (shown in My Ticket)
  if (status === 'reviewed') {
    t.whComment = effectiveComment || t.whComment;
    if (effectiveComment) t.whCommentAt = nowIso;
  }
  if (status === 'lm_approved') {
    t.lmComment = effectiveComment || t.lmComment;
    if (effectiveComment) t.lmCommentAt = nowIso;
  }
  if (status === 'finalized') {
    t.directorComment = effectiveComment || t.directorComment;
    if (effectiveComment && callerRole === 'director') t.directorCommentAt = nowIso;
  }
  if (meta.actualDeliveryDate) t.actualDeliveryDate = meta.actualDeliveryDate;
  if (status === 'returned') t.actualReturnDate = todayStr();
  demoDB.actions.unshift({ ticketId: t.id, action: status, status, actionAt: nowIso, actionBy: actor, role: meta.actorRole, comment: effectiveComment });
}

// ── Admin "Edit Ticket" (mirrors edit_ticket in migration 0024) ───────────
// Adjust / add / remove items on a FINALIZED ticket. Phase 1 validates every
// line and builds the change list without touching anything; phase 2 applies
// it — so a refused edit never leaves a half-applied ticket (all-or-nothing).
// Ledger rows are APPENDED, dated on the delivery date — or today when that
// date is in a month already reported to Finance (0027):
//   MKT more/added → deduction 'Edit Issue'   · less/removed → addition 'Edit Return'
//   CS mirror (cs_transfer): addition 'Edit Receipt' · deduction 'Edit Return'
// The ticket's status, dates and last-action stamp are never touched.
export function demoEditTicket(
  ticketId: string,
  lines: TicketEditLine[],
  remark: string,
  editorName?: string,
  editorRole?: string,
): number {
  // Resolve the caller's REAL role from the user directory (demo has no JWT).
  let role = String(editorRole || '').toLowerCase();
  const u = demoDB.users.find(
    (x) => x.fullName && x.fullName.toLowerCase() === String(editorName || '').trim().toLowerCase(),
  );
  if (u) role = u.role;
  if (role !== 'admin') throw new Error('Not authorized: only an Admin can edit a ticket');
  const actor = editorName || 'Admin';

  const note = String(remark || '').trim();
  if (note.length < 5) throw new Error('A remark (at least 5 characters) is required to edit a ticket');
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('The edit has no items');
  for (const l of lines) {
    if (!l.skuId || typeof l.qty !== 'number' || !Number.isFinite(l.qty) || l.qty < 0)
      throw new Error('Every line needs an item and a quantity of 0 or more');
  }
  if (new Set(lines.map((l) => l.skuId)).size !== lines.length)
    throw new Error('The same item appears twice in the edit');

  const t = demoDB.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error('Ticket not found');
  if (t.status !== 'finalized')
    throw new Error(`Only finalized tickets can be edited (this ticket is ${t.status})`);

  const items = demoDB.items[t.id] || (demoDB.items[t.id] = []);
  const curOf = (it: { qtyApproved: number | null; qtyRequested: number }) => it.qtyApproved ?? it.qtyRequested ?? 0;
  const stale = () => new Error('This ticket was changed by someone else — please reload it and try again');
  for (const it of items) {
    const l = lines.find((x) => x.skuId === it.skuId);
    if (!l || l.expectedQty === null || l.expectedQty === undefined || l.expectedQty !== curOf(it)) throw stale();
  }
  for (const l of lines) {
    const isNew = !items.some((it) => it.skuId === l.skuId);
    if (isNew && l.expectedQty !== null && l.expectedQty !== undefined && l.expectedQty !== 0) throw stale();
  }
  if (!lines.some((l) => l.qty > 0))
    throw new Error('A ticket must keep at least one item — use Reject / Recall to cancel a ticket');

  const findCs = (skuId: string, name: string) =>
    demoDB.csSkus.find((s) => s.id === skuId) || demoDB.csSkus.find((s) => normName(s.name) === normName(name));

  // ═══ PHASE 1: validate + build the change list (no writes) ═══
  const changes: TicketEditChange[] = [];
  for (const l of [...lines].sort((a, b) => a.skuId.localeCompare(b.skuId))) {
    const it = items.find((x) => x.skuId === l.skuId);
    const cur = it ? curOf(it) : 0;
    const delta = l.qty - cur;
    if (delta === 0) continue;
    const sku = demoDB.skus.find((s) => s.id === l.skuId);
    if (!sku) throw new Error(`Unknown item: ${l.skuId}`);
    const name = it?.skuName || sku.name;
    if (!it && String(sku.status || 'active').toLowerCase() !== 'active')
      throw new Error(`"${sku.name}" is inactive and cannot be added`);
    if (delta > 0 && sku.currentStock < delta)
      throw new Error(`Not enough stock for "${name}": need ${delta}, available ${sku.currentStock}`);
    // 0026: the extra Stock Out is dated on the delivery date
    if (delta > 0) assertTicketDatedOut(sku, false, ticketEditDate(t), delta);
    if (t.type === 'cs_transfer' && delta < 0) {
      const cs = findCs(l.skuId, name);
      if (!cs || cs.currentStock < -delta)
        throw new Error(`CS warehouse has only ${cs?.currentStock ?? 0} of "${name}" — cannot take back ${-delta}`);
      assertTicketDatedOut(cs, true, ticketEditDate(t), -delta);
    }
    changes.push({
      skuId: l.skuId, skuName: name, from: cur, to: l.qty, delta,
      action: !it ? 'added' : l.qty === 0 ? 'removed' : 'adjusted',
    });
  }
  if (changes.length === 0) throw new Error('Nothing changed — adjust a quantity first');

  // ═══ PHASE 2: apply ═══
  const editId = demoDB.ticketEdits.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const nowIso = new Date().toISOString();
  const today = todayStr();
  // 0026: edit rows land on the ticket's delivery date. 0027: an Admin edit
  // may still correct the PREVIOUS month; anything older lands today.
  const ledgerDay = ticketEditDate(t);
  demoDB.ticketEdits.unshift({
    id: editId, ticketId: t.id, at: nowIso, actorName: actor, actorRole: 'admin',
    remark: note, changes: changes.map((c) => ({ ...c })),
  });

  const parts: string[] = [];
  for (const c of changes) {
    const qty = Math.abs(c.delta);
    const rowNote = `Ticket edit #${editId} by ${actor} — ${note} · qty ${c.from} → ${c.to}`;
    const sku = demoDB.skus.find((s) => s.id === c.skuId)!;

    // (a) the ticket line
    if (c.action === 'added') {
      items.push({ skuId: c.skuId, skuName: c.skuName, qtyRequested: 0, qtyApproved: c.to, unit: sku.unit || 'pcs' });
    } else if (c.action === 'removed') {
      const i = items.findIndex((x) => x.skuId === c.skuId);
      if (i >= 0) items.splice(i, 1);
    } else {
      items.find((x) => x.skuId === c.skuId)!.qtyApproved = c.to;
    }
    parts.push(`${c.skuName} ${c.from} → ${c.to}${c.action === 'added' ? ' (added)' : c.action === 'removed' ? ' (removed)' : ''}`);

    // (b) MKT stock + ledger
    if (c.delta > 0) {
      sku.currentStock -= qty;
      demoDB.transactions.unshift({
        id: nextLedgerId(), ticketId: t.id, skuId: c.skuId, skuName: c.skuName, qty, type: 'deduction',
        date: ledgerDay, actionAt: nowIso, actionBy: actor, status: 'Edit Issue', comment: rowNote,
      });
    } else {
      sku.currentStock += qty;
      demoDB.transactions.unshift({
        id: nextLedgerId(), ticketId: t.id, skuId: c.skuId, skuName: c.skuName, qty, type: 'addition',
        date: ledgerDay, actionAt: nowIso, actionBy: actor, status: 'Edit Return', comment: rowNote,
      });
    }

    // (c) cs_transfer → mirror on the CS warehouse
    if (t.type === 'cs_transfer') {
      let cs = findCs(c.skuId, c.skuName);
      if (c.delta > 0) {
        if (!cs) {
          // first arrival through an edit: created empty, then received (Stock In)
          cs = {
            id: c.skuId, name: c.skuName, category: sku.category || 'General', unit: sku.unit || 'pcs',
            openingBalance: 0, currentStock: 0, totalInflow: 0, imageUrl: sku.imageUrl || null,
            lowStockThreshold: sku.lowStockThreshold || 0, costPerUnit: sku.costPerUnit || 0,
            createdAt: today, status: 'active',
          };
          demoDB.csSkus.push(cs);
        }
        cs.currentStock += qty;
        cs.totalInflow += qty;
        demoDB.csTransactions.unshift({
          id: nextLedgerId(), ticketId: t.id, skuId: cs.id, skuName: c.skuName, qty, type: 'addition',
          date: ledgerDay, actionAt: nowIso, actionBy: actor, status: 'Edit Receipt', comment: rowNote,
        });
      } else if (cs) {
        cs.currentStock -= qty;
        cs.totalInflow -= qty;
        demoDB.csTransactions.unshift({
          id: nextLedgerId(), ticketId: t.id, skuId: cs.id, skuName: c.skuName, qty, type: 'deduction',
          date: ledgerDay, actionAt: nowIso, actionBy: actor, status: 'Edit Return', comment: rowNote,
        });
      }
    }
  }

  demoDB.actions.unshift({
    ticketId: t.id, action: 'Edited', status: 'edited', actionAt: nowIso, actionBy: actor, role: 'admin',
    comment: `Edit #${editId} — ${note} · ${parts.join('; ')}`,
  });
  return editId;
}