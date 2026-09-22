import type { TicketWithItems, SKU, TicketAction } from '@/lib/types';
import { ROLE_LABELS, STATUS_LABELS, type TicketStatus } from '@/lib/types';
import { fmt, money, lastActionWhen, whenDateTime } from '@/lib/utils';
import { ApprovalPipeline, pipelineSteps } from './ApprovalPipeline';
import { StatusBadge, TypeBadge } from './StatusBadge';
import { Badge } from './ui/primitives';

export function TicketDetail({ ticket, skus, actions = [] }: {
  ticket: TicketWithItems; skus: SKU[]; actions?: TicketAction[];
}) {
  const costOf = (skuId: string) => skus.find((s) => s.id === skuId)?.costPerUnit || 0;
  const total = ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * costOf(it.skuId),
    0,
  );
  const trail = actions
    .filter((a) => a.ticketId === ticket.id)
    .sort((a, b) => String(b.actionAt || '').localeCompare(String(a.actionAt || '')));

  // The three per-level comment columns duplicate the audit trail, which is the
  // authoritative source (it alone knows who acted and when). A level row is
  // therefore only kept when the trail does not carry that comment — legacy /
  // imported tickets whose comments predate ticket_actions.
  const trailComments = new Set(trail.map((a) => String(a.comment || '').trim()).filter(Boolean));
  const legacyComments = [
    { who: 'Warehouse', text: ticket.whComment },
    { who: 'Line Manager', text: ticket.lmComment },
    { who: 'Director', text: ticket.directorComment },
  ].filter((r) => r.text && !trailComments.has(String(r.text).trim()));

  const steps = pipelineSteps(ticket.type);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <TypeBadge type={ticket.type} />
        <Badge className="bg-slate-100 text-slate-600">{ticket.department || '—'}</Badge>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-[13px] font-bold text-brand-700">Approval Pipeline</h3>
        <ApprovalPipeline
          status={ticket.status}
          steps={steps}
          createdAt={ticket.createdAt}
          actions={trail}
        />
      </section>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <InfoItem label="Created by" value={`${ticket.createdByName} (${ticket.createdBy})`} />
        <InfoItem label="Delivery date" value={ticket.deliveryDate || '—'} />
        {ticket.type === 'borrow' && <InfoItem label="Return date" value={ticket.returnDate || '—'} />}
        <InfoItem label="Created" value={lastActionWhen(ticket.createdAt)} />
        {ticket.actualDeliveryDate && <InfoItem label="Delivered on" value={ticket.actualDeliveryDate} />}
        {ticket.actualReturnDate && <InfoItem label="Returned on" value={ticket.actualReturnDate} />}
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

      {legacyComments.length > 0 && (
        <div className="grid gap-2 text-xs text-slate-600">
          {legacyComments.map((r) => (
            <div key={r.who} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
              <span className="shrink-0 font-semibold text-slate-500">{r.who}:</span>
              <span className="min-w-0 flex-1">{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {trail.length > 0 && (
        <div>
          <p className="label">Approval trail — who acted / commented, and when</p>
          <ol className="space-y-1.5">
            {trail.map((a, i) => {
              const label = STATUS_LABELS[(a.status || '') as TicketStatus] || a.action || a.status || 'Action';
              const role = a.role ? ROLE_LABELS[String(a.role).toLowerCase()] || a.role : '';
              return (
                <li
                  key={a.id ?? `${a.actionAt}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-slate-700">{a.actionBy || 'System'}</span>
                  {role && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">{role}</span>}
                  <span className="text-slate-400">· {label}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-slate-400">{whenDateTime(a.actionAt)}</span>
                  {a.comment && <p className="w-full text-slate-600">{a.comment}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
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

export const ticketTotalCost = (ticket: TicketWithItems, skus: SKU[]): number =>
  ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * (skus.find((s) => s.id === it.skuId)?.costPerUnit || 0),
    0,
  );
