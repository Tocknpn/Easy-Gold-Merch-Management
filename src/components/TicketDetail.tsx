import type { TicketWithItems, SKU, TicketAction } from '@/lib/types';
import { CURRENCY, ROLE_LABELS, STATUS_LABELS, type TicketStatus } from '@/lib/types';
import { fmt, money, lastActionWhen, whenDateTime } from '@/lib/utils';
import { StatusBadge, TypeBadge } from './StatusBadge';
import { Badge } from './ui/primitives';

/** Which action rows belong to each approval level (legacy labels included). */
const LEVELS: { key: 'wh' | 'lm' | 'director'; label: string; roles: string[]; labels: string[] }[] = [
  { key: 'wh', label: 'Warehouse', roles: ['warehouse'], labels: ['reviewed', 'review', 'moved', 'approved'] },
  { key: 'lm', label: 'Line Manager', roles: ['line_manager'], labels: ['lm_approved', 'lm approved', 'approved'] },
  { key: 'director', label: 'Director', roles: ['director'], labels: ['finalized', 'finalize', 'approved'] },
];

/** Timestamp of the first time this approval level acted (ticket_actions trail). */
function levelActionAt(actions: TicketAction[], level: (typeof LEVELS)[number]): string | null {
  const rows = actions
    .filter((a) => {
      const role = String(a.role || '').toLowerCase();
      const status = String(a.status || '').toLowerCase();
      const action = String(a.action || '').toLowerCase();
      if (!level.roles.includes(role)) return false;
      return level.labels.some((l) => status.includes(l) || action.includes(l));
    })
    .map((a) => a.actionAt || '')
    .filter(Boolean)
    .sort();
  return rows[0] || null;
}

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

  /** When did this level write its comment? Stored column first, then the trail. */
  const stamp = (level: (typeof LEVELS)[number], comment?: string | null, stored?: string | null): string | null => {
    if (stored) return stored;
    const fromTrail = levelActionAt(trail, level);
    if (fromTrail) return fromTrail;
    // last resort: the ticket's last action, when it is that level's comment
    const last = String(ticket.lastActionComment || '');
    if (comment && last && last === comment && ticket.lastActionAt) {
      const status = String(ticket.lastActionStatus || '').toLowerCase();
      if (level.labels.some((l) => status.includes(l))) return ticket.lastActionAt;
    }
    return null;
  };
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
        {ticket.whComment && (
          <CommentRow who="Warehouse" text={ticket.whComment} when={stamp(LEVELS[0], ticket.whComment, ticket.whCommentAt)} />
        )}
        {ticket.lmComment && (
          <CommentRow who="Line Manager" text={ticket.lmComment} when={stamp(LEVELS[1], ticket.lmComment, ticket.lmCommentAt)} />
        )}
        {ticket.directorComment && (
          <CommentRow who="Director" text={ticket.directorComment} when={stamp(LEVELS[2], ticket.directorComment, ticket.directorCommentAt)} />
        )}
        {ticket.actualDeliveryDate && <CommentRow who="Actual delivery" text={ticket.actualDeliveryDate} />}
        {ticket.actualReturnDate && <CommentRow who="Actual return" text={ticket.actualReturnDate} />}
      </div>

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

function CommentRow({ who, text, when }: { who: string; text: string; when?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
      <span className="shrink-0 font-semibold text-slate-500">{who}:</span>
      <span className="min-w-0 flex-1">{text}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
        {when ? whenDateTime(when) : 'time not recorded'}
      </span>
    </div>
  );
}

export const ticketTotalCost = (ticket: TicketWithItems, skus: SKU[]): number =>
  ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * (skus.find((s) => s.id === it.skuId)?.costPerUnit || 0),
    0,
  );