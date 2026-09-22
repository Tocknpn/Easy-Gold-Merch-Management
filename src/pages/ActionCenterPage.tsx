import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import {
  Inbox, CheckCircle2, XCircle, Undo2, PackageCheck, MessageSquare,
  CalendarDays, User2, Users, Loader2, ChevronRight, Clock, ChevronDown,
  AlertTriangle, Package, FileText, X, Search, Send, ArrowUpDown, Gift, MoreHorizontal, Eye,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, EmptyState, toast } from '@/components/ui/primitives';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import { ApprovalPipeline } from '@/components/ApprovalPipeline';
import { ConfirmTicketAction, type ConfirmKind } from '@/components/ConfirmTicketAction';
import { cn, fmt, money, lastActionWhen, todayStr, safeImageUrl } from '@/lib/utils';
import type { TicketWithItems, TicketStatus, SKU, TicketAction } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';

/* Status visuals for the queue-card icon tile (color tint + corner badge) */
const CARD_STATUS: Record<string, { badge: string; tile: string; icon: ReactNode }> = {
  pending:     { badge: 'text-amber-600 ring-amber-200',   tile: 'bg-amber-50 text-amber-600 ring-amber-100',   icon: <Clock className="h-3 w-3" /> },
  reviewed:    { badge: 'text-sky-600 ring-sky-200',       tile: 'bg-sky-50 text-sky-600 ring-sky-100',         icon: <Eye className="h-3 w-3" /> },
  lm_approved: { badge: 'text-violet-600 ring-violet-200', tile: 'bg-violet-50 text-violet-600 ring-violet-100', icon: <CheckCircle2 className="h-3 w-3" /> },
  finalized:   { badge: 'text-emerald-600 ring-emerald-200', tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:    { badge: 'text-rose-600 ring-rose-200',     tile: 'bg-rose-50 text-rose-600 ring-rose-100',      icon: <XCircle className="h-3 w-3" /> },
  returned:    { badge: 'text-slate-500 ring-slate-200',   tile: 'bg-slate-100 text-slate-500 ring-slate-200',  icon: <Undo2 className="h-3 w-3" /> },
  recalled:    { badge: 'text-slate-500 ring-slate-200',   tile: 'bg-slate-100 text-slate-500 ring-slate-200',  icon: <Undo2 className="h-3 w-3" /> },
};

type DecisionKind = 'approve' | 'reject' | 'recall' | 'return';

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : format(d, 'MMM d, yyyy');
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy h:mm a');
};

function ItemThumb({ imageUrl, name, className }: { imageUrl?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = safeImageUrl(imageUrl);
  if (!url || broken) {
    return <div className={cn('flex items-center justify-center bg-slate-100 text-slate-300', className)}><Package className="h-4 w-4" /></div>;
  }
  return <img src={url} alt={name} loading="lazy" onError={() => setBroken(true)} className={cn('h-full w-full object-cover', className)} />;
}

export function ActionCenterPage() {
  const { user } = useAuth();
  const { tickets, skus, actions, updateTicketStatus, loading, error, refresh, config } = useData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const role = user?.role || 'staff';

  const roleQueue = useMemo(() => tickets.filter((t) => {
    // Finalized borrows waiting for return live in Ticket Tracking → "To return
    // to WH" (the warehouse processes the return there), so they no longer
    // clutter the approval queue.
    if (role === 'warehouse') return t.status === 'pending';
    if (role === 'line_manager') return t.status === 'reviewed';
    if (role === 'director') return t.status === 'lm_approved';
    if (role === 'admin') return !['finalized', 'rejected', 'returned', 'recalled'].includes(t.status);
    return false;
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [tickets, role]);

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return roleQueue;
    return roleQueue.filter((t) =>
      t.id.toLowerCase().includes(s) ||
      (t.createdByName || '').toLowerCase().includes(s) ||
      (t.department || '').toLowerCase().includes(s) ||
      t.items.some((i) => (i.skuName || '').toLowerCase().includes(s)),
    );
  }, [roleQueue, q]);

  const queue = useMemo(() => {
    const arr = searched;
    return sort === 'newest' ? arr : [...arr].reverse();
  }, [searched, sort]);

  const selected = queue.find((t) => t.id === selectedId) || null;

  if (loading) return <Spinner label="Loading action center…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  // Borrow returns are recorded in Ticket Tracking -> "To return to WH" now, so
  // the queue above never yields a finalized borrow. The flag (and the return form
  // it drives) is kept as the Action Center fallback should a waiting borrow ever
  // be routed back here.
  const isReturn = (t: TicketWithItems) => role === 'warehouse' && t.type === 'borrow' && t.status === 'finalized';
  const nxt = (s: TicketStatus): TicketStatus =>
    role === 'warehouse' ? 'reviewed'
    : role === 'line_manager' ? 'lm_approved'
    : s === 'pending' ? 'reviewed' : s === 'reviewed' ? 'lm_approved' : 'finalized';

  const run = async (ticket: TicketWithItems, status: TicketStatus, meta: {
    comment?: string; actualDeliveryDate?: string | null;
    items?: { skuId: string; qtyApproved: number }[] | null;
    returns?: { skuId: string; qtyReturned: number; qtyBroken: number }[] | null;
  }) => {
    setBusy(true);
    try {
      await updateTicketStatus(ticket.id, status, { actorName: user?.fullName || '', actorRole: role, ...meta });
      toast(`${ticket.id} → ${STATUS_LABELS[status]}`);
      const remaining = queue.filter((t) => t.id !== ticket.id);
      setSelectedId(remaining[0]?.id ?? null);
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <Send className="h-5 w-5" />
        </span>
        <h1 className="text-[20px] font-bold leading-none tracking-tight text-slate-900">Action Center</h1>
      </div>

      {roleQueue.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nothing needs your action right now 🎉" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
          <div className={cn('space-y-2.5 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1', selected && 'hidden lg:block')}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input h-10 rounded-xl pl-9 text-[13px]"
                placeholder="Search by ticket, requester, item or department…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                className="input h-10 rounded-xl pl-9 pr-8 text-[13px]"
                value={sort}
                onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
              </select>
            </div>
            {queue.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                No tickets match your search.
              </p>
            ) : (
              <div className="space-y-2">
                {queue.map((t) => (
                  <QueueCard
                    key={t.id}
                    ticket={t}
                    active={t.id === selectedId}
                    onClick={() => setSelectedId(t.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {selected ? (
            <DetailPanel
              key={selected.id}
              ticket={selected}
              actions={actions.filter((a) => a.ticketId === selected.id)}
              skus={skus}
              role={role}
              busy={busy}
              isReturn={isReturn(selected)}
              canOverApprove={String(config?.engine_version || '') === '0014'}
              onBack={() => setSelectedId(null)}
              onApprove={(meta) => run(selected, nxt(selected.status), meta)}
              onReject={(comment) => run(selected, 'rejected', { comment })}
              onRecall={(comment) => run(selected, 'recalled', { comment })}
              onReturn={(returns, comment) => run(selected, 'returned', { returns, comment })}
            />
          ) : (
            <div className="hidden lg:flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
              <div>
                <Package className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">Select a ticket to review</p>
                <p className="text-xs text-slate-400">Click any item in the queue on the left</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Queue card (left) ───────────────────── */

function QueueCard({ ticket, active, onClick }: {
  ticket: TicketWithItems; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-all',
        active
          ? 'border-brand-500 bg-brand-50/70 shadow-sm ring-1 ring-brand-200'
          : 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-card-hover',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <span className={cn(
            'grid h-10 w-10 place-items-center rounded-xl ring-1',
            ticket.type === 'borrow'
              ? 'bg-violet-50 text-violet-600 ring-violet-100'
              : CARD_STATUS[ticket.status]?.tile || 'bg-brand-50 text-brand-600 ring-brand-100',
          )}>
            {ticket.type === 'borrow' ? <Undo2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <span
            title={STATUS_LABELS[ticket.status] || ticket.status}
            className={cn(
              'absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm ring-1',
              CARD_STATUS[ticket.status]?.badge || 'text-slate-500 ring-slate-200',
            )}
          >
            {CARD_STATUS[ticket.status]?.icon}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-bold text-brand-700">{ticket.id}</span>
            <TypeBadge type={ticket.type} />
          </div>
          <p className="mt-1 truncate text-[13px] font-medium text-slate-800">{ticket.createdByName}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {ticket.department} · {ticket.items.length} item{ticket.items.length > 1 ? 's' : ''}
          </p>
          {ticket.type === 'borrow' && ticket.returnDate && (
            <p className={cn('mt-1 truncate text-[11px] font-semibold', ticket.returnDate < todayStr() ? 'text-rose-600' : 'text-indigo-600')}>
              Return by {fmtDate(ticket.returnDate)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
          <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-400">
            <CalendarDays className="h-3 w-3" />{fmtDate(ticket.createdAt)}
          </span>
          <ChevronRight className={cn('h-4 w-4', active ? 'text-brand-500' : 'text-slate-300')} />
        </div>
      </div>
    </button>
  );
}

/* ───────────────────── Small building blocks ───────────────────── */

function Tile({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-medium text-slate-800" title={value}>{value}</p>
    </div>
  );
}

function NumInput({ value, onChange, tone, ariaLabel }: {
  value: string; onChange: (v: string) => void; tone?: 'danger'; ariaLabel?: string;
}) {
  return (
    <input
      className={cn(
        'w-16 rounded-lg border py-1 text-center text-sm font-semibold focus:outline-none focus:ring-2',
        tone === 'danger'
          ? 'border-rose-200 text-rose-700 focus:border-rose-300 focus:ring-rose-100'
          : 'border-slate-200 text-slate-800 focus:border-brand-400 focus:ring-brand-100',
      )}
      type="number" min={0} value={value} aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ───────────────────── Comment & action trail ───────────────────── */

function ActionTrail({ actions }: { actions: TicketAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
        No comments yet — be the first to add one below.
      </p>
    );
  }
  const dot: Record<string, string> = {
    pending: 'bg-amber-500', reviewed: 'bg-sky-500', lm_approved: 'bg-indigo-500',
    finalized: 'bg-emerald-500', rejected: 'bg-rose-500', recalled: 'bg-slate-400', returned: 'bg-blue-500',
  };
  return (
    <ol>
      {actions.map((a, i) => {
        const label = STATUS_LABELS[(a.status || '') as TicketStatus] || a.action || a.status || 'Action';
        return (
          <li key={a.id ?? `${a.actionAt}-${i}`} className="relative flex gap-3 pb-3.5 last:pb-0">
            {i < actions.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />}
            <span className={cn('mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-white', dot[a.status || ''] || 'bg-slate-400')}>
              {a.status === 'rejected' || a.status === 'recalled'
                ? <XCircle className="h-3 w-3" />
                : a.status === 'returned'
                  ? <Undo2 className="h-2.5 w-2.5" />
                  : <CheckCircle2 className="h-3 w-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                <span className="font-semibold text-slate-700">{a.actionBy || 'System'}</span>
                <span className="text-slate-400">· {label}</span>
                <span className="ml-auto text-[10px] text-slate-300">{lastActionWhen(a.actionAt)}</span>
              </p>
              {a.comment && (
                <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
                  {a.comment}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────── Detail panel (right) ───────────────────── */

function DetailPanel({ ticket, actions, skus, role, busy, isReturn, canOverApprove, onBack, onApprove, onReject, onRecall, onReturn }: {
  ticket: TicketWithItems;
  actions: TicketAction[];
  skus: SKU[];
  role: string;
  busy: boolean;
  isReturn: boolean;
  canOverApprove: boolean;
  onBack: () => void;
  onApprove: (m: { comment?: string; actualDeliveryDate?: string | null; items?: { skuId: string; qtyApproved: number }[] | null }) => void;
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
  const [pipeOpen, setPipeOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ask, setAsk] = useState<ConfirmKind | null>(null);

  // Keep the sheets in sync when a different ticket, a fresh status or new
  // quantities arrive (realtime refresh / switching selection). Keyed on
  // primitives so an unrelated ticket update never wipes what the user types.
  const itemsKey = ticket.items.map((i) => `${i.skuId}:${i.qtyApproved ?? ''}:${i.qtyRequested}`).join('|');
  useEffect(() => {
    setQtys(Object.fromEntries(ticket.items.map((i) => [i.skuId, String(i.qtyApproved ?? i.qtyRequested ?? '')])));
    setReturns(Object.fromEntries(ticket.items.map((i) => [i.skuId, { ret: String(i.qtyApproved ?? i.qtyRequested ?? ''), broken: '0' }])));
    setComment('');
    setDelivery(ticket.actualDeliveryDate || todayStr());
  }, [ticket.id, ticket.status, itemsKey]);

  // Ceiling rule — an approver may approve MORE than was requested (the engine
  // true-ups the booking at each level), but never more than is actually
  // available: current stock + what this ticket already booked (the booking is
  // already deducted from current_stock).
  const availableOf = (it: TicketWithItems['items'][number]) => {
    const sku = skus.find((s) => s.id === it.skuId);
    const booked = it.qtyApproved ?? it.qtyRequested ?? 0;
    return Math.max(0, (sku?.currentStock || 0) + booked);
  };
  // Ceiling for THIS deployment. Over-approval (up to available stock) needs
  // migration 0014 (sets engine_version) — until it is applied, cap at the
  // requested qty so a frontend-only deploy can never silently drop an
  // over-approval again (the exact bug this change fixes).
  const capOf = (it: TicketWithItems['items'][number]) =>
    canOverApprove ? availableOf(it) : it.qtyRequested;

  const setQty = (skuId: string, v: number) => {
    const it = ticket.items.find((i) => i.skuId === skuId);
    const cap = it ? capOf(it) : Math.max(0, v);
    setQtys((q) => ({ ...q, [skuId]: String(Math.min(Math.max(0, Math.floor(v)), cap)) }));
  };
  const setReturn = (skuId: string, field: 'ret' | 'broken', v: string) =>
    setReturns((r) => ({ ...r, [skuId]: { ...r[skuId], [field]: v } }));

  // Per-item validation — blocks submit with a clear message instead of
  // silently changing the number the user typed.
  const qtyIssues: Record<string, string> = {};
  const hasIssue = !isReturn && ticket.items.some((it) => {
    const raw = qtys[it.skuId] ?? '';
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0) { qtyIssues[it.skuId] = 'Enter a quantity (0 or more)'; return true; }
    const cap = capOf(it);
    if (n > cap) {
      qtyIssues[it.skuId] = canOverApprove
        ? `Only ${fmt(cap)} available — cannot approve ${fmt(n)}`
        : `Approving more than requested (${fmt(cap)}) needs migration 0014`;
      return true;
    }
    return false;
  });

  const canRecall = ['reviewed', 'lm_approved'].includes(ticket.status) && (role === 'admin' || role === 'warehouse');
  const primaryLabel = isReturn
    ? 'Confirm Return'
    : role === 'warehouse' ? 'Review & Book Stock' : role === 'line_manager' ? 'Approve' : 'Finalize';

  const estTotal = ticket.items.reduce((sum, it) => {
    const sku = skus.find((s) => s.id === it.skuId);
    const qty = isReturn ? (it.qtyApproved ?? it.qtyRequested) : Number(qtys[it.skuId]) || (it.qtyApproved ?? it.qtyRequested);
    return sum + qty * (sku?.costPerUnit ?? 0);
  }, 0);

  const confirm = () => {
    if (isReturn) {
      onReturn(
        Object.entries(returns).map(([skuId, v]) => ({ skuId, qtyReturned: Number(v.ret) || 0, qtyBroken: Number(v.broken) || 0 })),
        comment,
      );
    } else {
      onApprove({
        comment,
        actualDeliveryDate: role === 'warehouse' ? delivery : null,
        // Send exactly what was entered — validation above already guarantees a
        // number within the availability ceiling, so nothing is re-clamped here
        // (the old Math.min(..., requested) is what silently dropped over-approval).
        items: ticket.items.map((it) => ({ skuId: it.skuId, qtyApproved: Math.floor(Number(qtys[it.skuId]) || 0) })),
      });
    }
  };

  return (
    <div className="card lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto">
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-brand-700">{ticket.id}</h2>
              <TypeBadge type={ticket.type} />
              <StatusBadge status={ticket.status} />
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">
              {ticket.createdByName || '—'} · {ticket.department || '—'} · {fmtDateTime(ticket.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="grid h-8 w-8 place-items-center rounded-lg text-slate-300" title={ticket.type.replace('_', ' ')}>
            <MoreHorizontal className="h-4 w-4" />
          </span>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
            onClick={onBack} title="Close" aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* decision bar — comment + actions, always visible at the top */}
      <div className="sticky top-14 z-10 border-b border-slate-100 bg-white/95 p-4 backdrop-blur lg:top-0">
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <MessageSquare className="h-3.5 w-3.5 text-brand-500" />
          Comments {isReturn ? '' : '(Optional)'} — shared with the requester & next approver
        </label>
        <div className="relative">
          <textarea
            className="input min-h-[64px] resize-y pb-6"
            maxLength={500}
            placeholder={isReturn
              ? 'e.g. all items returned in good condition…'
              : role === 'warehouse'
                ? 'e.g. stock booked, 2 units unavailable until next restock…'
                : 'e.g. approved — please deliver before Friday…'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-medium text-slate-300">{comment.length}/500</span>
        </div>
        {hasIssue && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {Object.values(qtyIssues)[0]}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isReturn && canRecall && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setAsk('recall')}>
              <Undo2 className="h-3.5 w-3.5" /> Recall
            </button>
          )}
          {!isReturn && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setAsk('reject')}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          )}
          <button className="btn btn-primary btn-sm ml-auto" disabled={busy || hasIssue} onClick={confirm}>
            {busy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isReturn ? <PackageCheck className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {primaryLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* pipeline (collapsible) */}
        <section className="relative rounded-xl border border-slate-200 bg-white p-4">
          <button
            className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-md text-slate-300 transition hover:bg-slate-50 hover:text-slate-500"
            onClick={() => setPipeOpen((o) => !o)}
            aria-expanded={pipeOpen}
            aria-label={pipeOpen ? 'Collapse pipeline' : 'Expand pipeline'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {pipeOpen && (
            <>
              <h3 className="mb-3 text-[13px] font-bold text-brand-700">Approval Pipeline</h3>
              <ApprovalPipeline status={ticket.status} type={ticket.type} createdAt={ticket.createdAt} />
            </>
          )}
        </section>

        {/* request details (left) + items (right) — one screen */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* request details */}
        <section className="order-2 lg:order-1">
          <h3 className="mb-2 text-[13px] font-bold text-slate-800">Request Details</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile icon={<User2 className="h-3 w-3" />} label="Requester" value={ticket.createdByName} />
            <Tile icon={<Users className="h-3 w-3" />} label="Department" value={ticket.department} />
            <Tile icon={<Clock className="h-3 w-3" />} label="Created" value={fmtDate(ticket.createdAt)} />
            <Tile icon={<CalendarDays className="h-3 w-3" />} label="Needed by" value={ticket.deliveryDate || '—'} />
            {ticket.type === 'borrow' && (
              <Tile icon={<CalendarDays className="h-3 w-3" />} label="Return date" value={ticket.returnDate || '—'} />
            )}
            {ticket.actualDeliveryDate && (
              <Tile icon={<CheckCircle2 className="h-3 w-3" />} label="Delivered on" value={ticket.actualDeliveryDate} />
            )}
          </div>
          {ticket.remark && (
            <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
              <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold">Remark: </span>{ticket.remark}</span>
            </p>
          )}
        </section>
        {/* items */}
        <section className="order-1 lg:order-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-slate-800">Items <span className="font-semibold text-slate-400">({ticket.items.length})</span></h3>
            <span className="text-xs text-slate-400">
              Est. value <span className="font-bold text-slate-700">{money(estTotal)}</span>
            </span>
          </div>
          {!canOverApprove && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
              Over-approval (more than requested) is disabled until migration 0014 is applied — the approved qty is capped at the request.
            </p>
          )}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-[300px] lg:overflow-y-auto">
            {ticket.items.map((it) => {
              const sku = skus.find((s) => s.id === it.skuId);
              const q = Number(qtys[it.skuId]) || 0;
              const avail = sku ? (canOverApprove ? availableOf(it) : it.qtyRequested) : q;
              const over = !isReturn && q > avail;
              const beyondRequested = !isReturn && canOverApprove && q > it.qtyRequested;
              return (
                <div key={it.skuId} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <ItemThumb imageUrl={sku?.imageUrl} name={it.skuName} className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-slate-200" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[13px] font-semibold', over ? 'text-rose-700' : 'text-slate-800')} title={it.skuName}>{it.skuName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Requested {fmt(it.qtyRequested)} {it.unit}
                      {sku && <> · {canOverApprove ? 'available' : 'requested'} <span className={cn('font-semibold', q <= avail ? 'text-emerald-600' : 'text-rose-600')} title={canOverApprove ? 'Available = stock on hand + what this ticket already booked' : 'Approved qty cannot exceed what was requested'}>{fmt(avail)}</span></>}
                      {beyondRequested && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                          more than requested ({fmt(it.qtyRequested)})
                        </span>
                      )}
                    </p>
                  </div>
                  {isReturn ? (
                    <div className="flex items-center gap-1.5">
                      <NumInput ariaLabel={`Returned qty of ${it.skuName}`} value={returns[it.skuId]?.ret ?? ''}
                        onChange={(v) => setReturn(it.skuId, 'ret', v)} />
                      <span className="text-[10px] font-medium uppercase text-slate-400">ret</span>
                      <NumInput ariaLabel={`Broken/lost qty of ${it.skuName}`} tone="danger" value={returns[it.skuId]?.broken ?? '0'}
                        onChange={(v) => setReturn(it.skuId, 'broken', v)} />
                      <span className="text-[10px] font-medium uppercase text-slate-400">broken</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy} onClick={() => setQty(it.skuId, q - 1)} aria-label={`Decrease approved qty of ${it.skuName}`}
                      >−</button>
                      <input
                        className={cn(
                          'w-12 rounded-lg border py-1 text-center text-[13px] font-semibold focus:outline-none focus:ring-2',
                          qtyIssues[it.skuId]
                            ? 'border-rose-300 text-rose-700 focus:border-rose-300 focus:ring-rose-100'
                            : 'border-slate-200 text-slate-800 focus:border-brand-400 focus:ring-brand-100',
                        )}
                        type="number" min={0} value={qtys[it.skuId] ?? ''}
                        onChange={(e) => setQtys((s) => ({ ...s, [it.skuId]: e.target.value }))}
                        onBlur={(e) => setQty(it.skuId, Number(e.target.value) || 0)}
                        aria-label={`Approved qty of ${it.skuName}`}
                      />
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy} onClick={() => setQty(it.skuId, q + 1)} aria-label={`Increase approved qty of ${it.skuName}`}
                      >+</button>
                      <span className="w-7 shrink-0 text-[11px] text-slate-400">{it.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {role === 'warehouse' && !isReturn && (
            <div className="mt-2.5">
              <label className="label">Actual delivery date</label>
              <input className="input" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
          )}
        </section>
        </div>

        {/* comments & history (collapsible) */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <button
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600"><MessageSquare className="h-3.5 w-3.5" /></span>
            <span className="flex-1 text-[13px] font-bold text-slate-800">Comments & History</span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', historyOpen && 'rotate-180')} />
          </button>
          {historyOpen && (
            <div className="border-t border-slate-100 p-4">
              <ActionTrail actions={actions} />
            </div>
          )}
        </section>
      </div>

      {ask && (
        <ConfirmTicketAction
          ticket={ticket}
          kind={ask}
          skus={skus}
          busy={busy}
          initialReason={comment}
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => { setAsk(null); if (ask === 'reject') onReject(reason); else onRecall(reason); }}
        />
      )}
    </div>
  );
}
