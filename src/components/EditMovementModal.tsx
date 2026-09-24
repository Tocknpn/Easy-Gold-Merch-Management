// ── Edit one stock movement row (Ticket Tracking → Stock Movements) ──────
// Fixes a wrong refill / issue amount AT THE SOURCE (migration 0015 in live
// mode, demoEditStockMovement in demo mode). The warehouse stock and every
// report re-sync automatically because reports are computed from the ledger.
// Authorization (UI level): admin = both warehouses, warehouse = MKT rows,
// customer_service = CS rows — the server re-checks it from the JWT.
import { useState } from 'react';
import { TriangleAlert, Loader2, PencilLine } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, toast } from '@/components/ui/primitives';
import { fmt, cn } from '@/lib/utils';
import { isCancelledStatus } from '@/lib/stockMovement';
import type { SKU, StockTransaction, MovementEditPatch } from '@/lib/types';

export function EditMovementModal({
  tx, wh, sku, onClose,
}: {
  tx: StockTransaction;
  wh: 'MKT' | 'CS';
  sku?: SKU | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { editStockMovement } = useData();

  const [qty, setQty] = useState(String(tx.qty ?? 0));
  const [broken, setBroken] = useState(String(tx.qtyBroken ?? 0));
  const [date, setDate] = useState(String(tx.date || '').slice(0, 10));
  const [by, setBy] = useState(String(tx.actionBy || ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const oldQty = Number(tx.qty) || 0;
  const newQty = Number(qty);
  const qtyValid = Number.isFinite(newQty) && newQty >= 0;
  const delta = qtyValid ? newQty - oldQty : 0;
  // IN: more stock in = more on the shelf. OUT: more issued = less on the shelf.
  const stockChange = tx.type === 'addition' ? delta : -delta;
  const stockAfter = sku ? Math.max(0, (Number(sku.currentStock) || 0) + stockChange) : null;
  const dateChanged = !!date && date !== String(tx.date || '').slice(0, 10);
  const byChanged = by.trim() !== String(tx.actionBy || '').trim();
  const brokenChanged = wh === 'MKT' && Number(broken) !== Number(tx.qtyBroken || 0);
  const noChange = !qtyValid || (delta === 0 && !dateChanged && !byChanged && !brokenChanged);

  // The row's note accumulates one segment per correction (0015 stamps
  // `<original note> | Edited by <name> (<role>) on <ts> — <reason> · qty 50 → 30`).
  // Show them here so the editor sees what is ALREADY recorded on the record
  // before adding another note — this is the note that used to "disappear".
  const history = String(tx.comment || '')
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean);

  // Rows that must not be edited here (the table hides the button too —
  // this is the server-mirroring double guard).
  const blocked =
    tx.ticketId === 'OPENING'
      ? 'Opening rows follow the SKU opening balance — edit it in Manage Stock → SKU Setup'
      : isCancelledStatus(tx.status)
        ? 'Cancelled bookings are audit-only and cannot be edited'
        : '';

  const save = async () => {
    if (!tx.id) { toast('This row has no id — please refresh', 'error'); return; }
    if (!reason.trim()) { toast('Please write WHY you are correcting this row', 'error'); return; }
    if (!qtyValid) { toast('Quantity must be 0 or greater', 'error'); return; }
    if (noChange) { toast('Nothing changed — adjust a value first', 'info'); return; }

    const patch: MovementEditPatch = {};
    if (delta !== 0) patch.qty = newQty;
    if (brokenChanged) patch.qtyBroken = Math.max(0, Number(broken) || 0);
    if (dateChanged) patch.date = date;
    if (byChanged) patch.actionBy = by.trim();

    setBusy(true);
    try {
      await editStockMovement(wh === 'MKT' ? 'mkt' : 'cs', tx.id, patch, reason.trim(), {
        name: user?.fullName, role: user?.role,
      });
      const dir = stockChange > 0 ? '+' : '';
      toast(
        `Movement corrected${stockChange !== 0 ? ` — stock ${dir}${fmt(stockChange)}${stockAfter !== null ? ` → ${fmt(stockAfter)}` : ''}` : ''}`,
      );
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Edit failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1';
  const input = 'input w-full';

  return (
    <Modal open onClose={onClose} title={
      <span className="flex items-center gap-2">
        <PencilLine className="h-4 w-4 text-brand-600" /> Edit Stock Movement
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
          wh === 'MKT' ? 'bg-brand-50 text-brand-700 ring-brand-600/20' : 'bg-cyan-50 text-cyan-700 ring-cyan-600/20')}>
          {wh}
        </span>
      </span>
    }>
      {/* ── the row being fixed (read-only context) ── */}
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs ring-1 ring-slate-100">
        <p className="text-slate-500">Item</p>
        <p className="truncate text-right font-semibold text-slate-800" title={tx.skuName || ''}>{tx.skuName || '—'}</p>
        <p className="text-slate-500">Direction</p>
        <p className={cn('text-right font-extrabold', tx.type === 'addition' ? 'text-emerald-600' : 'text-rose-600')}>
          {tx.type === 'addition' ? '↓ Stock IN' : '↑ Stock OUT'}
        </p>
        <p className="text-slate-500">Reference</p>
        <p className="truncate text-right font-mono text-slate-600" title={tx.ticketId || ''}>{tx.ticketId || '—'}</p>
        {sku && (
          <>
            <p className="text-slate-500">Current stock</p>
            <p className="text-right font-semibold tabular-nums text-slate-800">{fmt(sku.currentStock)} {sku.unit}</p>
          </>
        )}
      </div>

      {blocked ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-800">
          {blocked}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Quantity {tx.type === 'addition' ? '(stock in)' : '(stock out)'}</label>
              <input className={input} type="number" min={0} step="any" value={qty}
                onChange={(e) => setQty(e.target.value)} />
            </div>
            {wh === 'MKT' && (
              <div>
                <label className={label}>Broken / lost</label>
                <input className={input} type="number" min={0} step="any" value={broken}
                  onChange={(e) => setBroken(e.target.value)} />
              </div>
            )}
            <div>
              <label className={label}>Movement date (reports)</label>
              <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={label}>By (recorded name)</label>
              <input className={input} value={by} placeholder={tx.actionBy || '—'} onChange={(e) => setBy(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <label className={label}>Reason (required — kept on the record)</label>
            <textarea
              className="input w-full" rows={2}
              placeholder="e.g. refill was submitted as 50 but the delivery note says 30…"
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* ── live preview of what the fix does ── */}
          {qtyValid && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs ring-1 ring-slate-100">
              {delta !== 0 ? (
                <p className="font-semibold text-slate-700">
                  {tx.type === 'addition' ? 'Stock in' : 'Stock out'}: {fmt(oldQty)} → {fmt(newQty)}
                  {' · '}
                  <span className={stockChange > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    stock {stockChange > 0 ? '+' : '−'}{fmt(Math.abs(stockChange))}
                  </span>
                  {stockAfter !== null && <span className="text-slate-500"> → {fmt(stockAfter)} {sku?.unit}</span>}
                </p>
              ) : (
                <p className="text-slate-500">Quantity unchanged — only the recorded details will be corrected.</p>
              )}
              {dateChanged && <p className="mt-1 text-slate-500">Report date → {date}</p>}
              {byChanged && <p className="mt-1 text-slate-500">Recorded “By” → {by.trim() || '(cleared)'}</p>}
              {brokenChanged && <p className="mt-1 text-slate-500">Broken / lost → {Math.max(0, Number(broken) || 0)}</p>}
            </div>
          )}

          {/* ── notes already recorded on this row ── */}
          {history.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Already recorded on this row
              </p>
              <ul className="mt-1.5 space-y-1">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                    <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', i === 0 ? 'bg-slate-300' : 'bg-amber-400')} />
                    <span className="break-words">
                      {i > 0 && <b className="font-semibold text-amber-700">correction: </b>}
                      {h}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Saving re-calculates the warehouse stock and every finance report from this row.
              The edit is stamped with your name ({user?.fullName || 'you'}), role and reason — the
              original amount stays visible in the note.
            </p>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
        {!blocked && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || noChange || !reason.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />}
            Save correction
          </button>
        )}
      </div>
    </Modal>
  );
}
