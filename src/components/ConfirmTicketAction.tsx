import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Undo2, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/primitives';
import { calculateTicketTotal } from '@/lib/types';
import { fmt, money } from '@/lib/utils';
import type { SKU, TicketWithItems } from '@/lib/types';

export type ConfirmKind = 'reject' | 'recall';

/**
 * "Are you sure?" gate for the two irreversible ticket actions. Reject and
 * Recall release the booked stock back to the warehouse and notify the
 * requester, so they must never fire straight from a single click.
 */
export function ConfirmTicketAction({
  ticket, kind, skus, busy, initialReason = '', onCancel, onConfirm,
}: {
  ticket: TicketWithItems;
  kind: ConfirmKind;
  skus: SKU[];
  busy?: boolean;
  /** Comment already typed on the screen (pre-fills the reason box). */
  initialReason?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(initialReason);

  // This dialog can open on top of the ticket modal and both listen for Escape.
  // Capture the key first, otherwise Escape would close the ticket modal too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const isReject = kind === 'reject';
  const total = calculateTicketTotal(ticket, skus);
  const units = ticket.items.reduce((n, it) => n + (it.qtyApproved ?? it.qtyRequested), 0);

  return (
    <Modal open onClose={onCancel} title={`${isReject ? 'Reject' : 'Recall'} ${ticket.id}?`}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Are you sure you want to {isReject ? 'reject' : 'recall'} this ticket?{' '}
          {isReject
            ? 'The approval stops here and cannot be resumed.'
            : 'It is pulled back out of the approval chain.'}
        </p>

        <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Booked stock — <b>{ticket.items.length} item{ticket.items.length === 1 ? '' : 's'}</b>
            {units > 0 && <> ({fmt(units)} {ticket.items[0]?.unit || 'units'}, {money(total)})</>} — returns to the
            warehouse and the requester is notified. This is logged in the approval trail and cannot be undone.
          </span>
        </p>

        <div>
          <label className="label" htmlFor="confirm-ticket-reason">Reason (optional)</label>
          <input
            id="confirm-ticket-reason"
            className="input"
            maxLength={500}
            placeholder={isReject ? 'e.g. not budgeted this quarter…' : 'e.g. requester cancelled the order…'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">Shown to the requester and saved in the approval trail.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className={isReject ? 'btn btn-danger btn-sm' : 'btn btn-warning btn-sm'}
            disabled={busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isReject ? <XCircle className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
            {isReject ? 'Yes, reject' : 'Yes, recall'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
