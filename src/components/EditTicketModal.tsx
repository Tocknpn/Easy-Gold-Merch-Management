// ── Admin "Edit Ticket" (Ticket Tracking → All Tickets → ⋯ → Edit ticket) ──
// Adjust an item's quantity, remove an item, or add a new item on a FINALIZED
// ticket, with one required remark per save (migration 0024 / demoEditTicket).
// The engine writes append-only ledger rows dated today, keeps the ticket's
// status and timestamps, and refuses stale or impossible edits as a whole —
// this modal only previews the same maths so the Admin sees every stock move
// before confirming.
import { useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Loader2, Minus, Package, PencilLine, Plus, RotateCcw, Trash2, TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, toast } from '@/components/ui/primitives';
import { cn, fmt } from '@/lib/utils';
import type { TicketWithItems } from '@/lib/types';
import { TYPE_LABELS } from '@/lib/types';

/** Tickets an Admin may edit: finalized (a returned borrow is status 'returned'). */
export const isEditableTicket = (t: TicketWithItems) => t.status === 'finalized';

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

export function EditTicketModal({ ticket, onClose }: { ticket: TicketWithItems; onClose: () => void }) {
  const { user } = useAuth();
  const { skus, editTicket } = useData();

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
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [busy, setBusy] = useState(false);

  const skuById = useMemo(() => new Map(skus.map((s) => [s.id, s])), [skus]);
  const isTransfer = ticket.type === 'cs_transfer';

  // ── per-line preview (mirrors the engine's phase-1 checks) ──
  const rows = useMemo(
    () =>
      lines.map((l) => {
        const n = Number(l.qty);
        const valid = l.qty.trim() !== '' && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
        const from = l.expectedQty ?? 0;
        const to = valid ? n : from;
        const delta = to - from;
        const stock = skuById.get(l.skuId)?.currentStock ?? 0;
        const short = delta > 0 && delta > stock;
        const kind: 'added' | 'removed' | 'adjusted' | 'same' =
          delta === 0 ? 'same' : l.expectedQty === null ? 'added' : to === 0 ? 'removed' : 'adjusted';
        return { ...l, valid, from, to, delta, stock, short, kind };
      }),
    [lines, skuById],
  );

  const changes = rows.filter((r) => r.kind !== 'same');
  const anyInvalid = rows.some((r) => !r.valid);
  const anyShort = rows.some((r) => r.short);
  const keepsAnItem = rows.some((r) => r.to > 0);
  const remarkOk = remark.trim().length >= MIN_REMARK;
  const blocker =
    anyInvalid ? 'Quantities must be whole numbers of 0 or more'
      : anyShort ? 'Not enough stock for one of the increases'
        : !keepsAnItem ? 'A ticket must keep at least one item — use Reject / Recall to cancel it'
          : changes.length === 0 ? 'Nothing changed yet'
            : !remarkOk ? `Write a remark (at least ${MIN_REMARK} characters) explaining the edit`
              : '';

  const addable = useMemo(
    () =>
      skus
        .filter((s) => String(s.status || 'active').toLowerCase() === 'active')
        .filter((s) => !lines.some((l) => l.skuId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'la')),
    [skus, lines],
  );

  const setQty = (skuId: string, qty: string) =>
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, qty } : l)));
  const bump = (skuId: string, by: number) =>
    setLines((ls) => ls.map((l) => (l.skuId === skuId ? { ...l, qty: String(Math.max(0, (Number(l.qty) || 0) + by)) } : l)));
  const removeLine = (l: Line) =>
    l.expectedQty === null
      ? setLines((ls) => ls.filter((x) => x.skuId !== l.skuId)) // a line added here simply disappears
      : setQty(l.skuId, '0');
  const restoreLine = (l: Line) => setQty(l.skuId, String(l.expectedQty ?? 0));

  const addLine = () => {
    const s = skuById.get(addId);
    if (!s) return;
    setLines((ls) => [...ls, { skuId: s.id, skuName: s.name, unit: s.unit || 'pcs', expectedQty: null, qty: '1' }]);
    setAddId('');
  };

  const save = async () => {
    if (blocker) { toast(blocker, 'error'); return; }
    setBusy(true);
    try {
      const { editId } = await editTicket(
        ticket.id,
        rows.map((r) => ({ skuId: r.skuId, qty: r.to, expectedQty: r.expectedQty })),
        remark.trim(),
        { name: user?.fullName, role: user?.role },
      );
      toast(`Ticket ${ticket.id} edited (edit #${editId}) — stock updated`);
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Edit failed', 'error');
      setStep('edit');
    } finally {
      setBusy(false);
    }
  };

  // "+2 back to stock" / "−5 from stock" for the MKT warehouse
  const stockWord = (delta: number) =>
    delta < 0 ? `+${fmt(-delta)} back to stock` : `−${fmt(delta)} from stock`;

  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';

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
          <span>Edit {ticket.id} · {TYPE_LABELS[ticket.type]}</span>
        </span>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        {ticket.createdByName || '—'} · {ticket.department || '—'} · created {(ticket.createdAt || '').slice(0, 10)}.
        The ticket keeps its status and dates; each change is recorded as a stock movement dated today.
        {isTransfer && ' This is a CS transfer — the CS warehouse is adjusted by the same amount.'}
      </p>

      {step === 'edit' ? (
        <>
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
                          <button
                            type="button" className="btn btn-secondary btn-sm h-8 w-8 p-0"
                            onClick={() => bump(r.skuId, -1)} disabled={r.to <= 0} aria-label={`Decrease ${r.skuName}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            className={cn('input h-8 w-16 text-center tabular-nums', (!r.valid || r.short) && 'border-rose-300 ring-rose-200')}
                            type="number" min={0} step={1} inputMode="numeric"
                            value={r.qty} onChange={(e) => setQty(r.skuId, e.target.value)}
                            aria-label={`New quantity for ${r.skuName}`}
                          />
                          <button
                            type="button" className="btn btn-secondary btn-sm h-8 w-8 p-0"
                            onClick={() => bump(r.skuId, 1)} aria-label={`Increase ${r.skuName}`}
                          >
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
                        ) : (
                          <span className={cn('font-semibold', r.delta < 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {r.kind === 'removed' ? 'Removed · ' : r.kind === 'added' ? 'Added · ' : ''}
                            {stockWord(r.delta)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {r.kind === 'removed' ? (
                          <button
                            type="button" title="Restore this item" aria-label={`Restore ${r.skuName}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-brand-600"
                            onClick={() => restoreLine(r)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button" title="Remove this item from the ticket" aria-label={`Remove ${r.skuName}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
                            onClick={() => removeLine(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── add an item ── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <select
                className="input min-w-0 flex-1 sm:max-w-sm"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                aria-label="Item to add"
              >
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

          {/* ── remark ── */}
          <div className="mt-3">
            <label className={label} htmlFor="edit-ticket-remark">Remark (required — kept on the audit trail)</label>
            <textarea
              id="edit-ticket-remark"
              className="input w-full" rows={2}
              placeholder="e.g. delivery note shows 8 pcs, item B was not sent, +5 of C added on site…"
              value={remark} onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          {blocker && changes.length > 0 && (
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
      ) : (
        <>
          {/* ── confirm: exactly what the save will do ── */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <h3 className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
              {changes.length} change{changes.length > 1 ? 's' : ''} will be saved
            </h3>
            <ul className="divide-y divide-slate-100">
              {changes.map((c) => (
                <li key={c.skuId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <b className="font-semibold text-slate-800">{c.skuName}</b>{' '}
                    <span className="tabular-nums text-slate-500">
                      {c.kind === 'added' ? `added × ${fmt(c.to)}` : c.kind === 'removed' ? `removed (was ${fmt(c.from)})` : `${fmt(c.from)} → ${fmt(c.to)}`}
                    </span>
                  </span>
                  <span className={cn('text-xs font-bold tabular-nums', c.delta < 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    MKT {stockWord(c.delta)}
                    {isTransfer && <span className="ml-1.5 text-cyan-700">· CS {c.delta > 0 ? '+' : '−'}{fmt(Math.abs(c.delta))}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Remark:</span> {remark.trim()}
            </div>
          </section>

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Each change becomes a stock movement dated today on {ticket.id}, signed by {user?.fullName || 'you'}.
              The original movements stay as they are. If anything changed since you opened this ticket the
              whole edit is refused and nothing is saved.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('edit')} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirm & save edit
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
