import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/primitives';
import { todayStr } from '@/lib/utils';
import type { TicketWithItems } from '@/lib/types';

export type ActionKind = 'approve' | 'reject' | 'return' | 'recall';

export function ActionModal({
  ticket, kind, role, busy, onClose,
  onApprove, onReject, onRecall, onReturn,
}: {
  ticket: TicketWithItems; kind: ActionKind; role: string; busy: boolean; onClose: () => void;
  onApprove: (m: { comment?: string; actualDeliveryDate?: string | null; items?: { skuId: string; qtyApproved: number }[] }) => void;
  onReject: (comment: string) => void;
  onRecall: (comment: string) => void;
  onReturn: (returns: { skuId: string; qtyReturned: number; qtyBroken: number }[], comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [delivery, setDelivery] = useState(ticket.actualDeliveryDate || todayStr());
  const [qtys, setQtys] = useState<Record<string, string>>(
    Object.fromEntries(ticket.items.map((i) => [i.skuId, String(i.qtyApproved ?? i.qtyRequested ?? '')])),
  );
	 const [returns, setReturns] = useState<Record<string, { ret: string; broken: string }>>(
    Object.fromEntries(ticket.items.map((i) => [i.skuId, { ret: String(i.qtyApproved ?? i.qtyRequested ?? ''), broken: '0' }])),
  );

  const title =
    kind === 'return' ? `Return Borrow — ${ticket.id}`
      : kind === 'reject' ? `Reject — ${ticket.id}`
      : kind === 'recall' ? `Recall — ${ticket.id}`
      : `${ticket.id} → ${role === 'warehouse' ? 'Reviewed' : role === 'line_manager' ? 'LM Approved' : 'Finalized'}`;

  const SpinnerIcon = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null;

  return (
    <Modal open onClose={onClose} title={title} wide={kind === 'approve'}>
      {kind === 'approve' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {role === 'warehouse'
              ? 'Stock will be booked (deducted) immediately. Adjust approved quantities below.'
              : role === 'line_manager' ? 'Approve the reviewed quantities.'
              : ticket.type === 'cs_transfer' ? 'Finalize — items will auto-restock the CS warehouse.'
              : 'Finalize this ticket.'}
          </p>
          <div>
            <p className="label">Approved quantity per item</p>
            <div className="space-y-2">
              {ticket.items.map((i) => (
                <div key={i.skuId} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-700">{i.skuName}</span>
                  <input className="input w-24" type="number" min={0} value={qtys[i.skuId] ?? ''}
                    onChange={(e) => setQtys((q) => ({ ...q, [i.skuId]: e.target.value }))} />
                  <span className="w-10 text-xs text-slate-400">{i.unit}</span>
                </div>
              ))}
            </div>
          </div>
          {role === 'warehouse' && (
            <div>
              <label className="label">Actual delivery date</label>
              <input className="input" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">Comment</label>
            <input className="input" placeholder="Optional" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => onApprove({
                comment, actualDeliveryDate: role === 'warehouse' ? delivery : null,
                items: Object.entries(qtys).map(([skuId, q]) => ({ skuId, qtyApproved: Number(q) || 0 })),
              })}>
              {SpinnerIcon || <CheckCircle2 className="h-3.5 w-3.5" />} Confirm
            </button>
          </div>
        </div>
      )}
{kind === 'return' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Record what came back and any broken/lost quantity.</p>
          <div className="space-y-2">
            {ticket.items.map((i) => (
              <div key={i.skuId} className="flex flex-wrap items-center gap-3">
                <span className="flex-1 text-sm text-slate-700">{i.skuName}</span>
                <div className="flex items-center gap-2">
                  <input className="input w-24" type="number" min={0} value={returns[i.skuId]?.ret ?? ''}
                    onChange={(e) => setReturns((r) => ({ ...r, [i.skuId]: { ...r[i.skuId], ret: e.target.value } }))}
                    placeholder="returned" />
                  <input className="input w-20" type="number" min={0} value={returns[i.skuId]?.broken ?? '0'}
                    onChange={(e) => setReturns((r) => ({ ...r, [i.skuId]: { ...r[i.skuId], broken: e.target.value } }))}
                    placeholder="broken" />
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="label">Comment</label>
            <input className="input" placeholder="Optional" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-success btn-sm" disabled={busy}
              onClick={() => onReturn(
                Object.entries(returns).map(([skuId, v]) => ({ skuId, qtyReturned: Number(v.ret) || 0, qtyBroken: Number(v.broken) || 0 })),
                comment,
              )}>
              {SpinnerIcon || <CheckCircle2 className="h-3.5 w-3.5" />} Return Completed
            </button>
          </div>
        </div>
      )}

      {(kind === 'reject' || kind === 'recall') && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {kind === 'reject' ? 'Rejecting returns the booked stock back to the warehouse.' : 'Recalling returns the booked stock back to the warehouse.'}
          </p>
          <div>
            <label className="label">Reason</label>
            <input className="input" placeholder="Reason…" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className={kind === 'reject' ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm'} disabled={busy}
              onClick={() => (kind === 'reject' ? onReject(comment) : onRecall(comment))}>
              {SpinnerIcon || (kind === 'reject' ? <XCircle className="h-3.5 w-3.5" /> : <Undo2Icon />)}
              {kind === 'reject' ? 'Reject Ticket' : 'Recall Ticket'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Undo2Icon() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>;
}