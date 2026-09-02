import type { TicketWithItems, SKU } from '@/lib/types';
import { CURRENCY } from '@/lib/types';
import { fmt, money, lastActionWhen } from '@/lib/utils';
import { StatusBadge, TypeBadge } from './StatusBadge';
import { Badge } from './ui/primitives';

export function TicketDetail({ ticket, skus }: { ticket: TicketWithItems; skus: SKU[] }) {
  const costOf = (skuId: string) => skus.find((s) => s.id === skuId)?.costPerUnit || 0;
  const total = ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * costOf(it.skuId),
    0,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <TypeBadge type={ticket.type} />
        <Badge className="bg-slate-100 text-slate-600">{ticket.department || '—'}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <InfoItem label="Created by" value={`${ticket.createdByName} (${ticket.createdBy})`} />
        <InfoItem label="Delivery date" value={ticket.deliveryDate || '—'} />
        {ticket.type === 'borrow' && <InfoItem label="Return date" value={ticket.returnDate || '—'} />}
        <InfoItem label="Created" value={lastActionWhen(ticket.createdAt)} />
        <InfoItem label="Last action" value={lastActionWhen(ticket.lastActionAt)} />
        <InfoItem label="By" value={ticket.lastActionBy || '—'} />
      </div>

      {ticket.remark && <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">📝 {ticket.remark}</p>}

      <div>
        <p className="label">Items</p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3.5 py-2">Item</th>
                <th className="px-3.5 py-2 text-right">Req</th>
                <th className="px-3.5 py-2 text-right">Appr</th>
                <th className="px-3.5 py-2 text-right">Cost</th>
                <th className="px-3.5 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ticket.items.map((it) => (
                <tr key={it.skuId}>
                  <td className="px-3.5 py-2.5 font-medium">{it.skuName}</td>
                  <td className="px-3.5 py-2.5 text-right">{fmt(it.qtyRequested)} {it.unit}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    {it.qtyApproved !== null && it.qtyApproved !== undefined ? fmt(it.qtyApproved) : '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">{money(costOf(it.skuId))}</td>
                  <td className="px-3.5 py-2.5 text-right font-medium">
                    {money((it.qtyApproved ?? it.qtyRequested) * costOf(it.skuId))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-3.5 py-2.5" colSpan={4}>Estimated total</td>
                <td className="px-3.5 py-2.5 text-right">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-2 text-xs text-slate-600">
        {ticket.whComment && <CommentRow who="Warehouse" text={ticket.whComment} />}
        {ticket.lmComment && <CommentRow who="Line Manager" text={ticket.lmComment} />}
        {ticket.directorComment && <CommentRow who="Director" text={ticket.directorComment} />}
        {ticket.actualDeliveryDate && <CommentRow who="Actual delivery" text={ticket.actualDeliveryDate} />}
        {ticket.actualReturnDate && <CommentRow who="Actual return" text={ticket.actualReturnDate} />}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}

function CommentRow({ who, text }: { who: string; text: string }) {
  return (
    <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <span className="shrink-0 font-semibold text-slate-500">{who}:</span>
      <span>{text}</span>
    </div>
  );
}

export const ticketTotalCost = (ticket: TicketWithItems, skus: SKU[]): number =>
  ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * (skus.find((s) => s.id === it.skuId)?.costPerUnit || 0),
    0,
  );