import type { ReactNode } from 'react';
import {
  ArrowRightLeft, Building2, CalendarClock, CalendarDays, CheckCircle2, Clock, FileText,
  Flag, Info, Package, Tag, Truck, Undo2, User, UserRound, Workflow, XCircle,
} from 'lucide-react';
import type { TicketWithItems, SKU, TicketAction } from '@/lib/types';
import { ROLE_LABELS, STATUS_LABELS, type TicketStatus, type TicketType } from '@/lib/types';
import { fmt, money, whenStamp, safeImageUrl } from '@/lib/utils';
import { ApprovalPipeline, pipelineSteps } from './ApprovalPipeline';
import { StatusBadge, TypeBadge } from './StatusBadge';
import { Badge } from './ui/primitives';

export function TicketDetail({ ticket, skus, actions = [] }: {
  ticket: TicketWithItems; skus: SKU[]; actions?: TicketAction[];
}) {
  const skuOf = (skuId: string) => skus.find((s) => s.id === skuId);
  const costOf = (skuId: string) => skuOf(skuId)?.costPerUnit || 0;
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
      {/* Status chips + created-on stamp — mirrors the reference modal header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
        <StatusBadge status={ticket.status} icon={STATUS_ICON[ticket.status] ?? <CheckCircle2 className="h-3 w-3" />} />
        <TypeBadge type={ticket.type} icon={TYPE_ICON[ticket.type]} />
        <Badge className="bg-slate-100 text-slate-600">
          <Tag className="h-3 w-3" />
          {ticket.department || '—'}
        </Badge>
        {ticket.createdAt && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            Created on {whenStamp(ticket.createdAt)}
          </span>
        )}
      </div>

      {/* 1 — Ticket Info: who asked, when, and the requester's remark */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
            <Info className="h-4 w-4" />
          </span>
          Ticket Info
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3">
          <DetailCell icon={<User className="h-3.5 w-3.5" />} label="Created by">
            <p className="truncate text-sm font-semibold text-slate-900">{ticket.createdByName}</p>
            <p className="truncate text-xs text-slate-500">{ticket.createdBy}</p>
          </DetailCell>
          <DetailCell icon={<CalendarDays className="h-3.5 w-3.5" />} label="Delivery date">
            <p className="text-sm text-slate-800">{ticket.deliveryDate || '—'}</p>
          </DetailCell>
          {ticket.type === 'borrow' && (
            <DetailCell icon={<CalendarClock className="h-3.5 w-3.5" />} label="Return date">
              <p className="text-sm text-slate-800">{ticket.returnDate || '—'}</p>
            </DetailCell>
          )}
          <DetailCell icon={<CalendarClock className="h-3.5 w-3.5" />} label="Created">
            <p className="text-sm tabular-nums text-slate-800">{whenStamp(ticket.createdAt)}</p>
          </DetailCell>
          {ticket.actualDeliveryDate && (
            <DetailCell icon={<Truck className="h-3.5 w-3.5" />} label="Delivered on">
              <p className="text-sm text-slate-800">{ticket.actualDeliveryDate}</p>
            </DetailCell>
          )}
          {ticket.actualReturnDate && (
            <DetailCell icon={<Undo2 className="h-3.5 w-3.5" />} label="Returned on">
              <p className="text-sm text-slate-800">{ticket.actualReturnDate}</p>
            </DetailCell>
          )}
          <DetailCell icon={<Clock className="h-3.5 w-3.5" />} label="Last action">
            <p className="text-sm tabular-nums text-slate-800">{whenStamp(ticket.lastActionAt)}</p>
          </DetailCell>
          <DetailCell icon={<Building2 className="h-3.5 w-3.5" />} label="By">
            <p className="truncate text-sm text-slate-800">{ticket.lastActionBy || '—'}</p>
          </DetailCell>
        </div>
        {ticket.remark && (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
            <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p className="min-w-0 break-words">
              <span className="font-semibold text-slate-700">Ref:</span> {ticket.remark}
            </p>
          </div>
        )}
      </section>

      {/* 2 — Items: card header with count, SKU image/category per row */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
            <FileText className="h-4 w-4" />
          </span>
          Items ({ticket.items.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-3.5 py-2 text-right font-semibold">Req</th>
                <th className="px-3.5 py-2 text-right font-semibold">Apr</th>
                <th className="px-3.5 py-2 text-right font-semibold">Cost</th>
                <th className="px-4 py-2 text-right font-semibold">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ticket.items.map((it) => {
                const sku = skuOf(it.skuId);
                const img = safeImageUrl(sku?.imageUrl);
                return (
                  <tr key={it.skuId}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {img ? (
                          <img
                            src={img} alt="" loading="lazy"
                            className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                            <Package className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{it.skuName}</p>
                          {sku?.category && <p className="truncate text-[11px] text-slate-400">{sku.category}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right">{fmt(it.qtyRequested)} {it.unit}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {it.qtyApproved !== null && it.qtyApproved !== undefined ? fmt(it.qtyApproved) : '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">{money(costOf(it.skuId))}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {money((it.qtyApproved ?? it.qtyRequested) * costOf(it.skuId))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-2.5" colSpan={4}>Estimated total</td>
                <td className="px-4 py-2.5 text-right">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 3 — Approval Pipeline */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
            <Workflow className="h-4 w-4" />
          </span>
          Approval Pipeline
        </h3>
        <div className="px-4 pb-4 pt-5">
          <ApprovalPipeline
            status={ticket.status}
            steps={steps}
            createdAt={ticket.createdAt}
            actions={trail}
          />
        </div>
      </section>

      {/* 4 — Approval Trail: who acted / commented, and when */}
      {trail.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
              <UserRound className="h-4 w-4" />
            </span>
            Approval Trail
          </h3>
          <ol className="p-4">
            {trail.map((a, i) => {
              const label = STATUS_LABELS[(a.status || '') as TicketStatus] || a.action || a.status || 'Action';
              const role = a.role ? ROLE_LABELS[String(a.role).toLowerCase()] || a.role : '';
              const name = a.actionBy || 'System';
              return (
                <li key={a.id ?? `${a.actionAt}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < trail.length - 1 && (
                    <span aria-hidden className="absolute left-[13px] top-9 h-full w-px bg-slate-200" />
                  )}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                    {initialsOf(name)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
                    <span className="text-[13px] font-semibold text-slate-800">{name}</span>
                    {role && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {role}
                      </span>
                    )}
                    <Badge className={TRAIL_TONES[a.status || ''] || 'bg-slate-100 text-slate-600 ring-slate-400/20'}>{label}</Badge>
                    <span className="min-w-0 flex-1 break-words text-xs text-slate-500">{a.comment || '-'}</span>
                    <span className="text-[10px] tabular-nums text-slate-400">{whenStamp(a.actionAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Legacy approval comments (imported tickets only) — kept out of the way
          of the 4 main sections so the modal order stays predictable. */}
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
    </div>
  );
}

/* ── Visual helpers for the detail modal ────────────────────────────────── */

/** Icon inside the top status chip — ✓, except waiting / cancelled states. */
const STATUS_ICON: Partial<Record<TicketStatus, ReactNode>> = {
  pending: <Clock className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
  recalled: <XCircle className="h-3 w-3" />,
};

const TYPE_ICON: Record<TicketType, ReactNode> = {
  request: <FileText className="h-3 w-3" />,
  borrow: <Undo2 className="h-3 w-3" />,
  cs_transfer: <ArrowRightLeft className="h-3 w-3" />,
};

/** Trail badge palette — approved levels green, review blue, rejected rose.
 *  (The avatars themselves stay neutral; see the trail markup.) */
const TRAIL_TONES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reviewed: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  lm_approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  finalized: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  recalled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  returned: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SY';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
};

function DetailCell({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
        <span className="text-slate-300">{icon}</span>
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export const ticketTotalCost = (ticket: TicketWithItems, skus: SKU[]): number =>
  ticket.items.reduce(
    (sum, it) => sum + (it.qtyApproved ?? it.qtyRequested) * (skus.find((s) => s.id === it.skuId)?.costPerUnit || 0),
    0,
  );
