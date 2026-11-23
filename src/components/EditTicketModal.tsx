// ── Admin "Edit Ticket" (Ticket Tracking → All Tickets → ⋯ → Edit ticket) ──
// Migration 0028 / demoAdminEditTicket: an Admin may correct ANY ticket, in
// any status and any month — created date, delivery date, delivered-on,
// return date, requester, department, remark, type, status and its items —
// with one required reason per save. Stock follows the ticket (movements move
// with the delivery date, a status change books / cancels / returns stock,
// cs_transfer adds / removes the CS receipt). Every save is recorded on the
// ticket's Edit history, its Approval Trail and the Audit Trail.
//
// Flow: edit → review → save. When the save would change a month already
// reported to Finance or push a day's balance below zero, the server saves
// NOTHING and returns the warnings; the Admin then confirms ("Save anyway").
import { useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Loader2, Minus, Package, PencilLine, Plus, RotateCcw, Trash2, TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, toast } from '@/components/ui/primitives';
import { cn, fmt, todayStr, vientianeDay } from '@/lib/utils';
import { reportingPeriodStart } from '@/lib/ledgerLock';
import type {
  AdminEditWarning, TicketEditableField, TicketFieldPatch, TicketStatus, TicketType, TicketWithItems,
} from '@/lib/types';
import { STATUS_LABELS, TYPE_LABELS } from '@/lib/types';

/** 0028: an Admin may edit a ticket in any status. */
export const isEditableTicket = (_t: TicketWithItems) => true;

const MIN_REMARK = 5;

interface Line {
  skuId: string;
  skuName: string;
  unit: string;
  /** qty on the ticket when the modal opened — null for a line added here. */
  expectedQty: number | null;
  /** the typed value (kept as text so the field can be cleared while typing). */
  qty: string;
}

/** Header fields as the form holds them (dates YYYY-MM-DD, '' = empty). */
type Details = Record<TicketEditableField, string>;

const FIELD_LABELS: Record<TicketEditableField, string> = {
  created_at: 'Created date', delivery_date: 'Delivery date', actual_delivery_date: 'Delivered on',
  return_date: 'Return date', remark: 'Ticket remark', department: 'Department', created_by: 'Requester account',
  created_by_name: 'Requester', type: 'Type', status: 'Status',
};
const STATUS_ORDER: TicketStatus[] = ['pending', 'reviewed', 'lm_approved', 'finalized', 'returned', 'rejected', 'recalled'];
const TYPE_ORDER: TicketType[] = ['request', 'borrow', 'cs_transfer'];
const OFF: TicketStatus[] = ['rejected', 'recalled'];

const detailsOf = (t: TicketWithItems): Details => ({
  created_at: vientianeDay(t.createdAt),
  delivery_date: String(t.deliveryDate || '').slice(0, 10),
  actual_delivery_date: String(t.actualDeliveryDate || '').slice(0, 10),
  return_date: String(t.returnDate || '').slice(0, 10),
  remark: t.remark || '',
  department: t.department || '',
  created_by: t.createdBy || '',
  created_by_name: t.createdByName || '',
  type: t.type,
  status: t.status,
});

const show = (f: TicketEditableField, v: string) =>
  !v ? '—' : f === 'status' ? STATUS_LABELS[v as TicketStatus] || v : f === 'type' ? TYPE_LABELS[v as TicketType] || v : v;

export function EditTicketModal({ ticket, onClose }: { ticket: TicketWithItems; onClose: () => void }) {
  const { user } = useAuth();
  const { skus, users, adminEditTicket } = useData();

  const original = useMemo(() => detailsOf(ticket), [ticket]);
  const [details, setDetails] = useState<Details>(original);
  const [lines, setLines] = useState<Line[]>(() =>
    ticket.items.map((it) => ({
      skuId: it.skuId,
      skuName: it.skuName,
      unit: it.unit || 'pcs',
      expectedQty: it.qtyApproved ?? it.qtyRequested ?? 0,
      qty: String(it.qtyApproved ?? it.qtyRequested ?? 0),
    })),
  );
  const [addId, setAddId] = useState('');
  const [remark, setRemark] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm' | 'warn'>('edit');
  const [warnings, setWarnings] = useState<AdminEditWarning[]>([]);
  const [busy, setBusy] = useState(false);

  const skuById = useMemo(() => new Map(skus.map((s) => [s.id, s])), [skus]);
  const set = (f: TicketEditableField, v: string) => setDetails((d) => ({ ...d, [f]: v }));

  // ── header diff ──
  const fieldChanges = (Object.keys(FIELD_LABELS) as TicketEditableField[])
    .filter((f) => details[f].trim() !== original[f].trim());
  const newStatus = details.status as TicketStatus;
  const newType = details.type as TicketType;
  const ledgerDay = (d: Details) => d.delivery_date || d.created_at;
  const oldDay = ledgerDay(original);
  const newDay = ledgerDay(details);
  const stockHeld = !OFF.includes(newStatus);

  // ── per-line preview ──
  const rows = useMemo(
    () =>
      lines.map((l) => {
        const n = Number(l.qty);
        const valid = l.qty.trim() !== '' && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
        const from = l.expectedQty ?? 0;
        const to = valid ? n : from;
        const delta = to - from;
        const stock = skuById.get(l.skuId)?.currentStock ?? 0;
        const short = stockHeld && !OFF.includes(ticket.status) && delta > 0 && delta > stock;
        const kind: 'added' | 'removed' | 'adjusted' | 'same' =
          delta === 0 ? 'same' : l.expectedQty === null ? 'added' : to === 0 ? 'removed' : 'adjusted';
        return { ...l, valid, from, to, delta, stock, short, kind };
      }),
    [lines, skuById, stockHeld, ticket.status],
  );

  const itemChanges = rows.filter((r) => r.kind !== 'same');
  const anyInvalid = rows.some((r) => !r.valid);
  const anyShort = rows.some((r) => r.short);
  const keepsAnItem = rows.some((r) => r.to > 0);
  const remarkOk = remark.trim().length >= MIN_REMARK;
  const anyChange = fieldChanges.length > 0 || itemChanges.length > 0;
  const blocker =
    anyInvalid ? 'Quantities must be whole numbers of 0 or more'
      : anyShort ? 'Not enough stock for one of the increases'
        : !keepsAnItem ? 'A ticket must keep at least one item — set the status to Rejected / Recalled to cancel it'
          : !details.created_at ? 'The created date cannot be empty'
            : details.created_at > todayStr() ? 'The created date cannot be in the future'
              : !details.created_by_name.trim() ? 'The requester cannot be empty'
                : newStatus === 'returned' && newType !== 'borrow' ? 'Only a borrow ticket can be "Returned"'
                  : !anyChange ? 'Nothing changed yet'
                    : !remarkOk ? `Write a reason (at least ${MIN_REMARK} characters) explaining the edit`
                      : '';

  // What the save will do to stock, in plain words (the server is authoritative).
  const consequences: string[] = [];
  if (oldDay !== newDay) {
    consequences.push(`All stock movements of ${ticket.id} move from ${oldDay || '—'} to ${newDay || '—'} (borrow returns keep their day).`);
  }
  if (newStatus !== ticket.status) {
    if (OFF.includes(newStatus) && !OFF.includes(ticket.status)) consequences.push('The ticket\'s stock movements are cancelled and the items go back to stock.');
    else if (!OFF.includes(newStatus) && OFF.includes(ticket.status)) consequences.push('The items are booked out of stock again on the delivery date.');
    else if (newStatus === 'returned') consequences.push('Everything issued comes back to stock today (Returned).');
    else if (ticket.status === 'returned') consequences.push('The return is cancelled — the items count as issued again.');
    else if (newStatus === 'finalized') consequences.push('The booking becomes a final Stock Out (Deducted).');
    else if (ticket.status === 'finalized') consequences.push('The Stock Out goes back to a booking that the workflow will confirm again.');
  }
  const csBefore = ticket.type === 'cs_transfer' && ticket.status === 'finalized';
  const csAfter = newType === 'cs_transfer' && newStatus === 'finalized';
  if (csBefore && !csAfter) consequences.push('The CS warehouse receipt is taken back (CS stock goes down).');
  if (!csBefore && csAfter) consequences.push('The CS warehouse receives the items (CS Stock In on the delivery date).');
  const start = reportingPeriodStart();
  const touchesReported = [oldDay, newDay].some((d) => d && d < start) && (oldDay !== newDay || itemChanges.length > 0 || newStatus !== ticket.status || newType !== ticket.type);

  const addable = useMemo(
    () =>
      skus
        .filter((s) => String(s.status || 'active').toLowerCase() === 'active')
        .filter((s) => !lines.some((l) => l.skuId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'la')),
    [skus, lines],
  );
  const people = useMemo(
    () => [...users].filter((u) => u.fullName).sort((a, b) => a.fullName.localeCompare(b.fullName, 'la')),
    [users],
  );
  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort(),
    [users],
  );

  const setQty = (skuId: string, qty: string) =>
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, qty } : l)));
  const bump = (skuId: string, by: number) =>
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, qty: String(Math.max(0, (Number(l.qty) || 0) + by)) } : l)));
  const removeLine = (l: Line) =>
    l.expectedQty === null
      ? setLines((ls) => ls.filter((x) => x.skuId !== l.skuId))
      : setQty(l.skuId, '0');
  const restoreLine = (l: Line) => setQty(l.skuId, String(l.expectedQty ?? 0));
  const addLine = () => {
    const s = skuById.get(addId);
    if (!s) return;
    setLines((ls) => [...ls, { skuId: s.id, skuName: s.name, unit: s.unit || 'pcs', expectedQty: null, qty: '1' }]);
    setAddId('');
  };
  const pickRequester = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) return;
    setDetails((d) => ({ ...d, created_by: u.email, created_by_name: u.fullName, department: u.department || d.department }));
  };

  const save = async (confirm: boolean) => {
    if (blocker) { toast(blocker, 'error'); return; }
    setBusy(true);
    try {
      const patch: TicketFieldPatch = {};
      for (const f of fieldChanges) patch[f] = { from: original[f] || null, to: details[f].trim() || null };
      const res = await adminEditTicket(
        ticket.id,
        patch,
        itemChanges.length ? rows.map((r) => ({ skuId: r.skuId, qty: r.to, expectedQty: r.expectedQty })) : null,
        remark.trim(),
        confirm,
        { name: user?.fullName, role: user?.role },
      );
      if (!res.ok) {
        setWarnings(res.warnings);
        setStep('warn');
        return;
      }
      toast(`Ticket ${ticket.id} edited (edit #${res.editId}) — recorded on the Audit Trail`);
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Edit failed', 'error');
      setStep('edit');
    } finally {
      setBusy(false);
    }
  };

  const stockWord = (delta: number) =>
    delta < 0 ? `+${fmt(-delta)} back to stock` : `−${fmt(delta)} from stock`;
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const changedRing = (f: TicketEditableField) => fieldChanges.includes(f) && 'border-amber-300 bg-amber-50/40';

  const dateInput = (f: TicketEditableField, opts: { required?: boolean; max?: string } = {}) => (
    <div>
      <label className={label} htmlFor={`edit-${f}`}>{FIELD_LABELS[f]}</label>
      <div className="flex items-center gap-1">
        <input
          id={`edit-${f}`}
          className={cn('input h-9 w-full tabular-nums', changedRing(f))}
          type="date" value={details[f]} max={opts.max}
          onChange={(e) => set(f, e.target.value)}
        />
        {!opts.required && details[f] && (
          <button type="button" className="btn btn-secondary btn-sm h-9 px-2 text-[11px]" onClick={() => set(f, '')} title={`Clear ${FIELD_LABELS[f]}`}>
            Clear
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      wide
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <PencilLine className="h-5 w-5" />
          </span>
          <span>Edit {ticket.id} · {TYPE_LABELS[ticket.type]} · {STATUS_LABELS[ticket.status]}</span>
        </span>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Admin correction — any field, any status, any month. Stock follows the ticket, and every change is
        recorded with your name and reason on the ticket&apos;s Edit history and the Audit Trail.
      </p>

      {step === 'edit' && (
        <>
          {/* ── ticket details ── */}
          <section className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <CalendarDays className="h-4 w-4 text-slate-400" /> Ticket details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {dateInput('created_at', { required: true, max: todayStr() })}
              {dateInput('delivery_date')}
              {dateInput('actual_delivery_date')}
              {dateInput('return_date')}
              <div>
                <label className={label} htmlFor="edit-requester">Requester</label>
                <select
                  id="edit-requester"
                  className={cn('input h-9 w-full', (fieldChanges.includes('created_by') || fieldChanges.includes('created_by_name')) && 'border-amber-300 bg-amber-50/40')}
                  value={people.some((u) => u.email === details.created_by) ? details.created_by : ''}
                  onChange={(e) => pickRequester(e.target.value)}
                >
                  {!people.some((u) => u.email === details.created_by) && (
                    <option value="">{details.created_by_name || '—'} (not in user list)</option>
                  )}
                  {people.map((u) => <option key={u.email} value={u.email}>{u.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="edit-department">Department</label>
                <input
                  id="edit-department" list="edit-departments"
                  className={cn('input h-9 w-full', changedRing('department'))}
                  value={details.department} onChange={(e) => set('department', e.target.value)}
                />
                <datalist id="edit-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
              </div>
              <div>
                <label className={label} htmlFor="edit-type">Type</label>
                <select id="edit-type" className={cn('input h-9 w-full', changedRing('type'))}
                  value={details.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="edit-status">Status</label>
                <select id="edit-status" className={cn('input h-9 w-full', changedRing('status'))}
                  value={details.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s} disabled={s === 'returned' && newType !== 'borrow'}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={label} htmlFor="edit-ticket-note">Ticket remark (the requester&apos;s note)</label>
                <input id="edit-ticket-note" className={cn('input h-9 w-full', changedRing('remark'))}
                  value={details.remark} onChange={(e) => set('remark', e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── items ── */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 text-right font-semibold">On ticket</th>
                    <th className="px-3 py-2 text-center font-semibold">New qty</th>
                    <th className="px-3 py-2 font-semibold">Stock effect</th>
                    <th className="w-10 px-2" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.skuId} className={cn(r.kind === 'removed' && 'bg-rose-50/40')}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 shrink-0 text-slate-300" />
                          <div className="min-w-0">
                            <p className={cn('truncate font-medium text-slate-800', r.kind === 'removed' && 'text-slate-400 line-through')}>
                              {r.skuName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {fmt(r.stock)} {r.unit} in MKT stock
                              {r.expectedQty === null && <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-600/20">new</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                        {r.expectedQty === null ? '—' : fmt(r.expectedQty)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="mx-auto flex w-36 items-center gap-1">
                          <button type="button" className="btn btn-secondary btn-sm h-8 w-8 p-0"
                            onClick={() => bump(r.skuId, -1)} disabled={r.to <= 0} aria-label={`Decrease ${r.skuName}`}>
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            className={cn('input h-8 w-16 text-center tabular-nums', (!r.valid || r.short) && 'border-rose-300 ring-rose-200')}
                            type="number" min={0} step={1} inputMode="numeric"
                            value={r.qty} onChange={(e) => setQty(r.skuId, e.target.value)}
                            aria-label={`New quantity for ${r.skuName}`}
                          />
                          <button type="button" className="btn btn-secondary btn-sm h-8 w-8 p-0"
                            onClick={() => bump(r.skuId, 1)} aria-label={`Increase ${r.skuName}`}>
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {!r.valid ? (
                          <span className="font-semibold text-rose-600">Whole number ≥ 0</span>
                        ) : r.short ? (
                          <span className="font-semibold text-rose-600">Need {fmt(r.delta)}, only {fmt(r.stock)} available</span>
                        ) : r.kind === 'same' ? (
                          <span className="text-slate-400">No change</span>
                        ) : !stockHeld ? (
                          <span className="text-slate-500">{r.kind === 'removed' ? 'Removed' : r.kind === 'added' ? 'Added' : 'Changed'} · no stock (cancelled ticket)</span>
                        ) : (
                          <span className={cn('font-semibold', r.delta < 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {r.kind === 'removed' ? 'Removed · ' : r.kind === 'added' ? 'Added · ' : ''}
                            {stockWord(r.delta)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {r.kind === 'removed' ? (
                          <button type="button" title="Restore this item" aria-label={`Restore ${r.skuName}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-brand-600"
                            onClick={() => restoreLine(r)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button type="button" title="Remove this item from the ticket" aria-label={`Remove ${r.skuName}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
                            onClick={() => removeLine(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <select className="input min-w-0 flex-1 sm:max-w-sm" value={addId}
                onChange={(e) => setAddId(e.target.value)} aria-label="Item to add">
                <option value="">Add an item…</option>
                {addable.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.currentStock <= 0}>
                    {s.name} — {fmt(s.currentStock)} {s.unit} available
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-outline btn-sm" onClick={addLine} disabled={!addId}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </button>
            </div>
          </section>

          {/* ── reason ── */}
          <div className="mt-3">
            <label className={label} htmlFor="edit-ticket-remark">Reason for this edit (required — kept on the audit trail)</label>
            <textarea
              id="edit-ticket-remark" className="input w-full" rows={2}
              placeholder="e.g. delivery actually happened on 05 Oct, item B was not sent, ticket was keyed under the wrong person…"
              value={remark} onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          {blocker && anyChange && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {blocker}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => setStep('confirm')} disabled={!!blocker}>
              Review changes
            </button>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white">
            <h3 className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
              {fieldChanges.length + itemChanges.length} change{fieldChanges.length + itemChanges.length > 1 ? 's' : ''} will be saved
            </h3>
            <ul className="divide-y divide-slate-100">
              {fieldChanges.map((f) => (
                <li key={f} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <b className="font-semibold text-slate-800">{FIELD_LABELS[f]}</b>
                  <span className="tabular-nums text-slate-600">
                    {show(f, original[f])} <span className="text-slate-400">→</span> <b className="text-slate-800">{show(f, details[f])}</b>
                  </span>
                </li>
              ))}
              {itemChanges.map((c) => (
                <li key={c.skuId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <b className="font-semibold text-slate-800">{c.skuName}</b>{' '}
                    <span className="tabular-nums text-slate-500">
                      {c.kind === 'added' ? `added × ${fmt(c.to)}` : c.kind === 'removed' ? `removed (was ${fmt(c.from)})` : `${fmt(c.from)} → ${fmt(c.to)}`}
                    </span>
                  </span>
                  {stockHeld && (
                    <span className={cn('text-xs font-bold tabular-nums', c.delta < 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      MKT {stockWord(c.delta)}
                      {csAfter && <span className="ml-1.5 text-cyan-700">· CS {c.delta > 0 ? '+' : '−'}{fmt(Math.abs(c.delta))}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {consequences.length > 0 && (
              <ul className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                {consequences.map((c) => <li key={c}>• {c}</li>)}
              </ul>
            )}
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Reason:</span> {remark.trim()}
            </div>
          </section>

          {touchesReported && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-rose-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                This touches a month already reported to Finance (before {start}). Its Month End Report will change
                after you save. The edit is flagged &ldquo;Reported month changed&rdquo; on the Audit Trail.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Saved as edit of {ticket.id} by {user?.fullName || 'you'}. No e-mail is sent for a correction. If anything
              changed since you opened this ticket the whole edit is refused and nothing is saved.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('edit')} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirm &amp; save edit
            </button>
          </div>
        </>
      )}

      {step === 'warn' && (
        <>
          <section className="rounded-xl border border-rose-200 bg-white">
            <h3 className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/60 px-4 py-3 text-[13px] font-bold text-rose-800">
              <TriangleAlert className="h-4 w-4" /> Nothing saved yet — please confirm
            </h3>
            <ul className="divide-y divide-slate-100">
              {warnings.map((w, i) => (
                <li key={i} className="px-4 py-2.5 text-sm text-slate-700">
                  <span className={cn('mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                    w.kind === 'negative' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20')}>
                    {w.kind === 'negative' ? 'Negative balance' : 'Reported month'}
                  </span>
                  {w.message}
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
              &ldquo;Save anyway&rdquo; keeps the edit and records these warnings with it on the Audit Trail.
            </p>
          </section>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('edit')} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to edit
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => save(true)} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save anyway
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
