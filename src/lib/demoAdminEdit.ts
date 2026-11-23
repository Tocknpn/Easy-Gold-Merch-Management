// ── Demo engine: Admin full ticket edit (mirrors migration 0028) ──────────
// admin_edit_ticket + admin_ticket_reconcile + redate_ticket_ledger, run on
// the in-memory store. Same rules as the SQL:
//   * Admin only, remark ≥ 5 chars, stale `from` / `expectedQty` → refused,
//   * any status, any month (Admin bypasses the reported-month lock),
//   * the ticket is updated first, then its stock is RECONCILED with what it
//     now says (PRE → one Booked row, FINAL → Deducted + Edit rows,
//     OFF → everything cancelled; CS receipt for a finalized cs_transfer),
//   * the edit is applied, checked, and rolled back (snapshot) when a warning
//     still needs the Admin's confirmation or a hard check fails.
import { demoDB, nextLedgerId } from './demoStore';
import type {
  AdminEditResult, AdminEditWarning, AuditChange, CS_SKU, StockTransaction, TicketEditChange,
  TicketEditLine, TicketFieldChange, TicketFieldPatch, TicketEditableField, TicketStatus, TicketType,
} from './types';
import { isCancelledStatus } from './stockMovement';
import { minBalanceFrom } from './demoData';
import { reportingPeriodStart } from './ledgerLock';
import { todayStr, vientianeDay } from './utils';

const FIELD_LABELS: Record<TicketEditableField, string> = {
  created_at: 'created date', delivery_date: 'delivery date', actual_delivery_date: 'delivered on',
  return_date: 'return date', remark: 'remark', department: 'department', created_by: 'requester account',
  created_by_name: 'requester', type: 'type', status: 'status',
};
const DATE_FIELDS: TicketEditableField[] = ['created_at', 'delivery_date', 'actual_delivery_date', 'return_date'];
const STATUSES: TicketStatus[] = ['pending', 'reviewed', 'lm_approved', 'finalized', 'rejected', 'returned', 'recalled'];
const TYPES: TicketType[] = ['request', 'borrow', 'cs_transfer'];

const normName = (s?: string | null) => (s || '').trim().toLowerCase();
const isDead = (status?: string | null) => isCancelledStatus(status);
const day = (s?: string | null) => String(s || '').slice(0, 10);

type DemoTicket = (typeof demoDB.tickets)[number];

/** Current value of a header field, in the form the client sends as `from`. */
function fieldValue(t: DemoTicket, f: TicketEditableField): string | null {
  const v = (() => {
    switch (f) {
      case 'created_at': return vientianeDay(t.createdAt);
      case 'delivery_date': return day(t.deliveryDate);
      case 'actual_delivery_date': return day(t.actualDeliveryDate);
      case 'return_date': return day(t.returnDate);
      case 'remark': return t.remark ?? '';
      case 'department': return t.department ?? '';
      case 'created_by': return t.createdBy ?? '';
      case 'created_by_name': return t.createdByName ?? '';
      case 'type': return t.type;
      case 'status': return t.status;
    }
  })();
  return v === '' ? null : v;
}

const ledgerDay = (t: DemoTicket) => day(t.deliveryDate) || vientianeDay(t.createdAt) || todayStr();

/** CS rows of a ticket: its own rows + the OPENING row its transfer wrote. */
const csRowsOf = (ticketId: string) =>
  demoDB.csTransactions.filter(
    (r) => r.ticketId === ticketId
      || (r.ticketId === 'OPENING' && /Ticket: (\S+)/.exec(String(r.comment || ''))?.[1] === ticketId),
  );

/** redate_ticket_ledger: every movement follows the ticket's ledger date. */
export function demoRedateTicket(ticketId: string): void {
  const t = demoDB.tickets.find((x) => x.id === ticketId);
  if (!t) return;
  const d = ledgerDay(t);
  for (const r of demoDB.transactions) if (r.ticketId === ticketId && r.status !== 'Returned') r.date = d;
  for (const r of csRowsOf(ticketId)) if (r.status !== 'Returned') r.date = d;
}

/** admin_ticket_reconcile: make the ledger match what the ticket says. */
function reconcile(t: DemoTicket, prevStatus: TicketStatus, actor: string, note: string): void {
  const d = ledgerDay(t);
  const today = todayStr();
  const nowIso = new Date().toISOString();
  const grp = ['pending', 'reviewed', 'lm_approved'].includes(t.status) ? 'PRE'
    : ['finalized', 'returned'].includes(t.status) ? 'FINAL' : 'OFF';
  const items = demoDB.items[t.id] || [];
  const append = (r: StockTransaction) => { r.comment = `${r.comment || ''} · ${note}`; };
  const cancel = (r: StockTransaction) => { r.status = r.type === 'deduction' ? 'Booking Cancelled' : 'Cancelled'; append(r); };

  const skuIds = [...new Set([
    ...items.map((i) => i.skuId),
    ...demoDB.transactions.filter((r) => r.ticketId === t.id && r.skuId).map((r) => r.skuId as string),
  ])].sort();
  const csTarget = new Map<string, number>();

  for (const skuId of skuIds) {
    const sku = demoDB.skus.find((s) => s.id === skuId);
    const it = items.find((i) => i.skuId === skuId);
    const name = it?.skuName || demoDB.transactions.find((r) => r.ticketId === t.id && r.skuId === skuId)?.skuName || sku?.name || skuId;
    let target = it ? (it.qtyApproved ?? it.qtyRequested ?? 0) : 0;
    if (grp === 'OFF') target = 0;
    const rows = () => demoDB.transactions.filter((r) => r.ticketId === t.id && r.skuId === skuId);
    const bump = (by: number) => { if (sku) sku.currentStock += by; };

    if (t.status !== 'returned') {
      for (const r of rows().filter((r) => r.status === 'Returned')) {
        bump(-r.qty);
        r.status = 'Cancelled';
        append(r);
      }
    }
    const live = () => rows().filter((r) => !isDead(r.status) && r.status !== 'Returned');
    const net = live().reduce((s, r) => s + (r.type === 'deduction' ? r.qty : -r.qty), 0);

    if (grp === 'PRE') {
      let pick: StockTransaction | undefined;
      if (target > 0) {
        pick = rows()
          .filter((r) => r.type === 'deduction' && r.status !== 'Returned')
          .sort((a, b) =>
            Number(b.status === 'Booked') - Number(a.status === 'Booked')
            || Number(!isDead(b.status)) - Number(!isDead(a.status))
            || (a.id ?? 0) - (b.id ?? 0))[0];
        if (!pick) {
          pick = { id: nextLedgerId(), ticketId: t.id, skuId, skuName: name, qty: target, type: 'deduction',
            date: d, actionAt: nowIso, actionBy: actor, status: 'Booked', comment: note };
          demoDB.transactions.unshift(pick);
        } else {
          if (!(pick.status === 'Booked' && pick.qty === target && pick.date === d)) append(pick);
          pick.status = 'Booked'; pick.qty = target; pick.date = d;
        }
      }
      for (const r of live()) if (r !== pick) cancel(r);
      bump(net - target);
    } else if (grp === 'FINAL') {
      for (const r of rows()) if (r.type === 'deduction' && r.status === 'Booked') r.status = 'Deducted';
      const delta = target - net;
      if (delta !== 0) {
        demoDB.transactions.unshift({
          id: nextLedgerId(), ticketId: t.id, skuId, skuName: name, qty: Math.abs(delta),
          type: delta > 0 ? 'deduction' : 'addition', date: d, actionAt: nowIso, actionBy: actor,
          status: delta > 0 ? 'Edit Issue' : 'Edit Return', comment: `${note} · qty ${net} → ${target}`,
        });
        bump(-delta);
      }
      if (t.status === 'returned' && prevStatus !== 'returned' && target > 0) {
        demoDB.transactions.unshift({
          id: nextLedgerId(), ticketId: t.id, skuId, skuName: name, qty: target, qtyBroken: 0, type: 'addition',
          date: today, actionAt: nowIso, actionBy: actor, status: 'Returned', comment: `${note} · returned (status set by Admin)`,
        });
        bump(target);
      }
    } else {
      for (const r of live()) cancel(r);
      bump(net);
    }

    if (t.type === 'cs_transfer' && t.status === 'finalized' && target > 0) {
      let cs: CS_SKU | undefined =
        demoDB.csSkus.find((s) => s.id === skuId) || demoDB.csSkus.find((s) => normName(s.name) === normName(name));
      if (!cs) {
        cs = {
          id: skuId, name, category: sku?.category || 'General', unit: sku?.unit || 'pcs',
          openingBalance: 0, currentStock: 0, totalInflow: 0, imageUrl: sku?.imageUrl || null,
          lowStockThreshold: sku?.lowStockThreshold || 0, costPerUnit: sku?.costPerUnit || 0,
          createdAt: today, status: 'active',
        };
        demoDB.csSkus.push(cs);
      }
      csTarget.set(cs.id, (csTarget.get(cs.id) || 0) + target);
    }
  }

  const csIds = [...new Set([...csTarget.keys(), ...csRowsOf(t.id).map((r) => r.skuId as string).filter(Boolean)])].sort();
  for (const csId of csIds) {
    const target = csTarget.get(csId) || 0;
    const net = csRowsOf(t.id)
      .filter((r) => r.skuId === csId && !isDead(r.status))
      .reduce((s, r) => s + (r.type === 'addition' ? r.qty : -r.qty), 0);
    const delta = target - net;
    if (delta === 0) continue;
    const cs = demoDB.csSkus.find((s) => s.id === csId);
    if (!cs) throw new Error(`CS item ${csId} no longer exists — its stock cannot be adjusted`);
    demoDB.csTransactions.unshift({
      id: nextLedgerId(), ticketId: t.id, skuId: csId, skuName: cs.name, qty: Math.abs(delta),
      type: delta > 0 ? 'addition' : 'deduction', date: d, actionAt: nowIso, actionBy: actor,
      status: delta > 0 ? 'Edit Receipt' : 'Edit Return', comment: `${note} · CS qty ${net} → ${target}`,
    });
    cs.currentStock += delta;
    cs.totalInflow += delta;
  }
}

type Snap = Map<string, string>;
const rowKey = (r: StockTransaction) => JSON.stringify([day(r.date), r.qty, r.status ?? null, r.type, r.skuId]);
function snapOf(ticketId: string): Snap {
  const m: Snap = new Map();
  for (const r of demoDB.transactions) if (r.ticketId === ticketId) m.set(`m${r.id}`, rowKey(r));
  for (const r of csRowsOf(ticketId)) m.set(`c${r.id}`, rowKey(r));
  return m;
}

export function demoAdminEditTicket(
  ticketId: string,
  fields: TicketFieldPatch,
  lines: TicketEditLine[] | null,
  remark: string,
  confirm: boolean,
  editorName?: string,
  editorRole?: string,
): AdminEditResult {
  // ── caller (demo has no JWT → resolve the real role from the directory) ──
  let role = String(editorRole || '').toLowerCase();
  const u = demoDB.users.find((x) => x.fullName && x.fullName.toLowerCase() === String(editorName || '').trim().toLowerCase());
  if (u) role = u.role;
  if (role !== 'admin') throw new Error('Not authorized: only an Admin can edit a ticket');
  const actor = editorName || 'Admin';
  const note0 = String(remark || '').trim();
  if (note0.length < 5) throw new Error('A remark (at least 5 characters) is required to edit a ticket');

  const t = demoDB.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error('Ticket not found');
  const stale = () => new Error('This ticket was changed by someone else — please reload it and try again');

  // ═══ header fields ═══
  const set: Partial<Record<TicketEditableField, string | null>> = {};
  const fieldChanges: TicketFieldChange[] = [];
  for (const [k, v] of Object.entries(fields || {}) as [TicketEditableField, { from: string | null; to: string | null }][]) {
    if (!(k in FIELD_LABELS)) throw new Error(`Field "${k}" cannot be edited`);
    const cur = fieldValue(t, k);
    if ((cur ?? '') !== (v?.from ?? '')) throw stale();
    const to = String(v?.to ?? '').trim() || null;
    if ((cur ?? '') === (to ?? '')) continue;
    if (DATE_FIELDS.includes(k)) {
      if (to !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(to) || Number.isNaN(new Date(`${to}T00:00:00Z`).getTime())))
        throw new Error(`Invalid ${FIELD_LABELS[k]}: ${to}`);
      if (k === 'created_at' && to === null) throw new Error('The created date cannot be empty');
      if (k === 'created_at' && to! > todayStr()) throw new Error('The created date cannot be in the future');
    } else if (k === 'type' && !TYPES.includes(to as TicketType)) {
      throw new Error(`Unknown ticket type: ${to ?? '—'}`);
    } else if (k === 'status' && !STATUSES.includes(to as TicketStatus)) {
      throw new Error(`Unknown status: ${to ?? '—'}`);
    } else if (k === 'created_by_name' && to === null) {
      throw new Error('The requester cannot be empty');
    }
    set[k] = to;
    fieldChanges.push({ field: k, label: FIELD_LABELS[k], from: cur, to });
  }
  const status = (set.status ?? t.status) as TicketStatus;
  const type = (set.type ?? t.type) as TicketType;
  if (status === 'returned' && type !== 'borrow') throw new Error('Only a borrow ticket can be "returned"');

  // ═══ items ═══
  const items = demoDB.items[t.id] || (demoDB.items[t.id] = []);
  const curOf = (it: { qtyApproved: number | null; qtyRequested: number }) => it.qtyApproved ?? it.qtyRequested ?? 0;
  const itemChanges: (TicketEditChange & { unit: string })[] = [];
  if (lines) {
    if (lines.length === 0) throw new Error('The edit has no items');
    for (const l of lines) {
      if (!l.skuId || typeof l.qty !== 'number' || !Number.isFinite(l.qty) || l.qty < 0)
        throw new Error('Every line needs an item and a quantity of 0 or more');
    }
    if (new Set(lines.map((l) => l.skuId)).size !== lines.length) throw new Error('The same item appears twice in the edit');
    for (const it of items) {
      const l = lines.find((x) => x.skuId === it.skuId);
      if (!l || l.expectedQty === null || l.expectedQty === undefined || l.expectedQty !== curOf(it)) throw stale();
    }
    if (!lines.some((l) => l.qty > 0))
      throw new Error('A ticket must keep at least one item — set the status to Rejected / Recalled to cancel it');
    for (const l of [...lines].sort((a, b) => a.skuId.localeCompare(b.skuId))) {
      const it = items.find((x) => x.skuId === l.skuId);
      const cur = it ? curOf(it) : 0;
      if (l.qty === cur) continue;
      const sku = demoDB.skus.find((s) => s.id === l.skuId);
      if (!sku) throw new Error(`Unknown item: ${l.skuId}`);
      if (!it && String(sku.status || 'active').toLowerCase() !== 'active')
        throw new Error(`"${sku.name}" is inactive and cannot be added`);
      itemChanges.push({
        skuId: l.skuId, skuName: it?.skuName || sku.name, unit: sku.unit || 'pcs', from: cur, to: l.qty, delta: l.qty - cur,
        action: !it ? 'added' : l.qty === 0 ? 'removed' : 'adjusted',
      });
    }
  }
  if (fieldChanges.length === 0 && itemChanges.length === 0) throw new Error('Nothing changed');

  // ═══ apply on a snapshot (rolled back on a warning / hard failure) ═══
  const backup = structuredClone({
    tickets: demoDB.tickets, items: demoDB.items, transactions: demoDB.transactions,
    csTransactions: demoDB.csTransactions, skus: demoDB.skus, csSkus: demoDB.csSkus,
    ticketEdits: demoDB.ticketEdits, actions: demoDB.actions, audit: demoDB.audit,
  });
  const rollback = () => Object.assign(demoDB, backup);
  const before = snapOf(t.id);
  const prevStatus = t.status;
  const prevDay = ledgerDay(t);

  try {
    const editId = demoDB.ticketEdits.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    const nowIso = new Date().toISOString();
    const note = `Ticket edit #${editId} by ${actor} — ${note0}`;
    demoDB.ticketEdits.unshift({
      id: editId, ticketId: t.id, at: nowIso, actorName: actor, actorRole: 'admin', remark: note0,
      changes: itemChanges.map(({ unit: _u, ...c }) => ({ ...c })), fieldChanges: fieldChanges.map((c) => ({ ...c })),
    });

    // (1) header
    if ('created_at' in set) {
      const keepTime = t.createdAt ? new Date(t.createdAt) : null;
      const hhmm = keepTime
        ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(keepTime)
        : '12:00:00';
      t.createdAt = new Date(`${set.created_at}T${hhmm}+07:00`).toISOString();
    }
    if ('delivery_date' in set) t.deliveryDate = set.delivery_date ?? null;
    if ('actual_delivery_date' in set) t.actualDeliveryDate = set.actual_delivery_date ?? null;
    if ('return_date' in set) t.returnDate = set.return_date ?? null;
    if ('remark' in set) t.remark = set.remark ?? '';
    if ('department' in set) t.department = set.department ?? '';
    if ('created_by' in set) t.createdBy = set.created_by ?? '';
    if ('created_by_name' in set) t.createdByName = set.created_by_name ?? '';
    t.type = type;
    t.status = status;
    if (status === 'returned' && prevStatus !== 'returned') t.actualReturnDate = t.actualReturnDate || todayStr();
    if (status !== 'returned') t.actualReturnDate = null;
    t.returnedProcessed = status === 'returned';
    if ('status' in set) {
      t.lastActionAt = nowIso; t.lastActionBy = actor; t.lastActionStatus = 'Edited'; t.lastActionComment = note;
    }
    if (ledgerDay(t) !== prevDay) demoRedateTicket(t.id);

    // (2) items
    const parts: string[] = [];
    for (const c of itemChanges) {
      if (c.action === 'added') {
        items.push({ skuId: c.skuId, skuName: c.skuName, qtyRequested: status === 'pending' ? c.to : 0,
          qtyApproved: status === 'pending' ? null : c.to, unit: c.unit });
      } else if (c.action === 'removed') {
        items.splice(items.findIndex((x) => x.skuId === c.skuId), 1);
      } else {
        const it = items.find((x) => x.skuId === c.skuId)!;
        if (status === 'pending' && it.qtyApproved === null) it.qtyRequested = c.to;
        else it.qtyApproved = c.to;
      }
      parts.push(`${c.skuName} ${c.from} → ${c.to}${c.action === 'added' ? ' (added)' : c.action === 'removed' ? ' (removed)' : ''}`);
    }
    if (!['pending', 'rejected', 'recalled'].includes(status)) {
      for (const it of items) if (it.qtyApproved === null) it.qtyApproved = it.qtyRequested;
    }
    for (const c of fieldChanges) parts.push(`${c.label} ${c.from ?? '—'} → ${c.to ?? '—'}`);

    // (3) stock follows the ticket
    reconcile(t, prevStatus, actor, note);

    // (4) never below zero today
    const touched = new Set(demoDB.transactions.filter((r) => r.ticketId === t.id).map((r) => r.skuId));
    const badMkt = demoDB.skus.filter((s) => touched.has(s.id) && s.currentStock < 0);
    if (badMkt.length)
      throw new Error(`Not enough MKT stock — this edit would leave ${badMkt.map((s) => `"${s.name}" (${s.currentStock})`).join(', ')} below zero. Record a Stock In first.`);
    const csTouched = new Set(csRowsOf(t.id).map((r) => r.skuId));
    const badCs = demoDB.csSkus.filter((s) => csTouched.has(s.id) && s.currentStock < 0);
    if (badCs.length)
      throw new Error(`The CS warehouse does not have enough stock to take back — ${badCs.map((s) => `"${s.name}" (${s.currentStock})`).join(', ')} would go below zero`);

    // (5) what changed in the ledger?
    const after = snapOf(t.id);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
    const days = changed.flatMap((k) => [before.get(k), after.get(k)])
      .filter((v): v is string => !!v).map((v) => JSON.parse(v)[0] as string).filter(Boolean);
    const start = reportingPeriodStart();
    const months = [...new Set(days.filter((d) => d < start).map((d) => d.slice(0, 7)))].sort();
    const warnings: AdminEditWarning[] = [];
    const flags: string[] = [];
    if (months.length) {
      flags.push('reported_month_changed');
      warnings.push({ kind: 'reported_month', months,
        message: `Changes the Month End Report of ${months.join(', ')} — already reported to Finance` });
    }

    // (6) day balances
    const fromDay = days.length ? days.reduce((a, b) => (a < b ? a : b)) : null;
    let neg = false;
    if (fromDay) {
      const skuOfKey = (k: string) => [before.get(k), after.get(k)].filter((v): v is string => !!v).map((v) => JSON.parse(v)[4] as string);
      const mktIds = new Set(changed.filter((k) => k.startsWith('m')).flatMap(skuOfKey));
      const csIds = new Set(changed.filter((k) => k.startsWith('c')).flatMap(skuOfKey));
      for (const s of demoDB.skus.filter((x) => mktIds.has(x.id))) {
        const { min, at } = minBalanceFrom(s, demoDB.transactions, fromDay);
        if (min < 0) {
          neg = true;
          warnings.push({ kind: 'negative', warehouse: 'MKT', item: s.name, day: at, balance: min,
            message: `MKT "${s.name}" would be ${min} at the end of ${at}` });
        }
      }
      for (const s of demoDB.csSkus.filter((x) => csIds.has(x.id))) {
        const { min, at } = minBalanceFrom(s, demoDB.csTransactions, fromDay);
        if (min < 0) {
          neg = true;
          warnings.push({ kind: 'negative', warehouse: 'CS', item: s.name, day: at, balance: min,
            message: `CS "${s.name}" would be ${min} at the end of ${at}` });
        }
      }
    }
    if (neg) flags.push('negative_balance_override');

    // (7) confirmation gate
    if (warnings.length && !confirm) {
      rollback();
      return { ok: false, needsConfirm: true, warnings };
    }

    // (8) the record
    const summary = parts.join('; ');
    demoDB.actions.unshift({
      ticketId: t.id, action: 'Edited', status: 'edited', actionAt: nowIso, actionBy: actor, role: 'admin',
      comment: `Edit #${editId} — ${note0} · ${summary}`,
    });
    const auditChanges: AuditChange[] = [
      ...itemChanges.map((c) => ({ field: `item "${c.skuName}"`, from: String(c.from), to: String(c.to) })),
      ...fieldChanges.map((c) => ({ field: c.label, from: c.from, to: c.to })),
    ];
    demoDB.audit.unshift({
      id: demoDB.audit.reduce((m, e) => Math.max(m, e.id), 0) + 1,
      at: nowIso, actorName: actor, actorRole: 'admin', module: 'ticket', action: 'admin_edit',
      entity: 'tickets', entityId: t.id, entityName: t.id, refTicket: t.id,
      summary: `Admin edited ticket ${t.id} (edit #${editId}) — ${summary}`,
      comment: note0 + (warnings.length ? `\nConfirmed warnings: ${warnings.map((w) => w.message).join('; ')}` : ''),
      changes: auditChanges, origin: 'app', flags,
    });
    return { ok: true, editId, warnings, flags };
  } catch (e) {
    rollback();
    throw e;
  }
}
