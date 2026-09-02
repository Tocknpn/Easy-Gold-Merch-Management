import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Inbox, CheckCircle2, XCircle, Undo2, PackageCheck, MessageSquare,
  CalendarDays, User2, Loader2, ChevronRight, Clock,
  AlertTriangle, Package, FileText, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, EmptyState, toast } from '@/components/ui/primitives';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import { cn, fmt, money, lastActionWhen, todayStr } from '@/lib/utils';
import type { TicketWithItems, TicketStatus, SKU, TicketAction } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';

type DecisionKind = 'approve' | 'reject' | 'recall' | 'return';

const PIPELINE = [
  { status: 'pending', label: 'Submitted', who: 'Staff' },
  { status: 'reviewed', label: 'Review & Book', who: 'Warehouse' },
  { status: 'lm_approved', label: 'Approve', who: 'Line Manager' },
  { status: 'finalized', label: 'Finalize', who: 'Director / Admin' },
];

export function ActionCenterPage() {
  const { user } = useAuth();
  const { tickets, skus, actions, updateTicketStatus, loading, error, refresh } = useData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = user?.role || 'staff';

  const queue = useMemo(() => tickets.filter((t) => {
    if (role === 'warehouse') return t.status === 'pending' || (t.status === 'finalized' && t.type === 'borrow' && !t.returnedProcessed);
    if (role === 'line_manager') return t.status === 'reviewed';
    if (role === 'director') return t.status === 'lm_approved';
    if (role === 'admin') return !['finalized', 'rejected', 'returned', 'recalled'].includes(t.status);
    return false;
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [tickets, role]);

  const selected = queue.find((t) => t.id === selectedId) || null;

  if (loading) return <Spinner label="Loading action center…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

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
      <div>
        <h1 className="text-xl font-bold text-slate-900">Action Center</h1>
        <p className="text-sm text-slate-500">
          {queue.length} ticket{queue.length === 1 ? '' : 's'} need your action
        </p>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nothing needs your action right now 🎉" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
          <div className={cn('space-y-2 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1', selected && 'hidden lg:block')}>
            {queue.map((t) => (
              <QueueCard
                key={t.id}
                ticket={t}
                active={t.id === selectedId}
                isReturn={isReturn(t)}
                onClick={() => setSelectedId(t.id)}
              />
            ))}
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

function QueueCard({ ticket, active, isReturn, onClick }: {
  ticket: TicketWithItems; active: boolean; isReturn: boolean; onClick: () => void;
}) {
  const totalItems = ticket.items.reduce((s, i) => s + (i.qtyApproved ?? i.qtyRequested), 0);
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-all',
        active
          ? 'border-brand-400 bg-brand-50 shadow-sm ring-2 ring-brand-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-brand-700">{ticket.id}</span>
            {isReturn && <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-600">{ticket.createdByName}</p>
          <p className="text-[11px] text-slate-400">{ticket.department}</p>
        </div>
        <ChevronRight className={cn('mt-1 h-4 w-4 shrink-0', active ? 'text-brand-500' : 'text-slate-300')} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TypeBadge type={ticket.type} />
        <StatusBadge status={ticket.status} />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><Package className="h-3 w-3" />{totalItems} pcs · {ticket.items.length} item{ticket.items.length > 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{lastActionWhen(ticket.createdAt)}</span>
      </div>

      {ticket.deliveryDate && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
          <CalendarDays className="h-3 w-3" />Due {ticket.deliveryDate}
        </p>
      )}
    </button>
  );
}

/* ───────────────────── Pipeline stepper ───────────────────── */

const RETURNED_STEP = { status: 'returned', label: 'Returned', who: 'Warehouse' };

function Pipeline({ status, steps }: { status: TicketStatus; steps: typeof PIPELINE }) {
  const idx = steps.findIndex((s) => s.status === status);
  const pct = idx <= 0 ? 0 : (idx / (steps.length - 1)) * 100;
  return (
    <div className="relative px-1 pt-1">
      <div className="absolute left-[17px] right-[17px] top-[17px] h-0.5 rounded bg-slate-200" />
      {idx > 0 && (
        <div
          className="absolute left-[17px] top-[17px] h-0.5 rounded bg-brand-500 transition-all duration-500"
          style={{ width: `calc((100% - 34px) * ${pct / 100})` }}
        />
      )}
      <div className="relative flex items-start justify-between">
        {steps.map((s, i) => {
          const done = idx > i;
          const current = idx === i;
          return (
            <div key={s.status} className="flex w-16 flex-col items-center text-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-white',
                  done && 'bg-brand-600 text-white',
                  current && 'border-2 border-brand-500 bg-brand-50 text-brand-700',
                  !done && !current && 'bg-slate-100 text-slate-400',
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <p className={cn('mt-1.5 text-[10px] font-semibold leading-tight', current ? 'text-brand-700' : done ? 'text-slate-600' : 'text-slate-400')}>
                {s.label}
              </p>
              <p className="text-[9px] leading-tight text-slate-400">{s.who}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────── Small building blocks ───────────────────── */

function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
      {icon}
      {children}
    </h3>
  );
}

function Tile({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-800" title={value}>{value}</p>
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

function DetailPanel({ ticket, actions, skus, role, busy, isReturn, onBack, onApprove, onReject, onRecall, onReturn }: {
  ticket: TicketWithItems;
  actions: TicketAction[];
  skus: SKU[];
  role: string;
  busy: boolean;
  isReturn: boolean;
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

  const setQty = (skuId: string, v: number) => setQtys((q) => ({ ...q, [skuId]: String(Math.max(0, v)) }));
  const setReturn = (skuId: string, field: 'ret' | 'broken', v: string) =>
    setReturns((r) => ({ ...r, [skuId]: { ...r[skuId], [field]: v } }));

  const overStock = !isReturn && ticket.items.some((it) => {
    const sku = skus.find((s) => s.id === it.skuId);
    return sku && (Number(qtys[it.skuId]) || 0) > sku.currentStock;
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
        items: Object.entries(qtys).map(([skuId, q]) => ({ skuId, qtyApproved: Number(q) || 0 })),
      });
    }
  };

  return (
    <div className="card lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto">
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-brand-700">{ticket.id}</h2>
            <TypeBadge type={ticket.type} />
            <StatusBadge status={ticket.status} />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Last action: {ticket.lastActionStatus
              ? STATUS_LABELS[ticket.lastActionStatus as TicketStatus] || ticket.lastActionStatus
              : '—'}
            {ticket.lastActionBy ? ` · ${ticket.lastActionBy}` : ''}
            {ticket.lastActionAt ? ` · ${lastActionWhen(ticket.lastActionAt)}` : ''}
          </p>
        </div>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
          onClick={onBack} title="Close" aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* decision bar — comment + actions, always visible at the top */}
      <div className="sticky top-14 z-10 border-b border-slate-100 bg-white/95 p-4 backdrop-blur lg:top-0">
        <label className="label">
          Comment {isReturn ? '' : '(optional)'} — shared with the requester & next approver
        </label>
        <textarea
          className="input min-h-[60px] resize-y"
          placeholder={isReturn
            ? 'e.g. all items returned in good condition…'
            : role === 'warehouse'
              ? 'e.g. stock booked, 2 units unavailable until next restock…'
              : 'e.g. approved — please deliver before Friday…'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isReturn && canRecall && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onRecall(comment)}>
              <Undo2 className="h-3.5 w-3.5" /> Recall
            </button>
          )}
          {!isReturn && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onReject(comment)}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          )}
          <button className="btn btn-primary btn-sm ml-auto" disabled={busy} onClick={confirm}>
            {busy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isReturn ? <PackageCheck className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {primaryLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* pipeline */}
        <section>
          <SectionTitle>Approval pipeline</SectionTitle>
          <Pipeline status={ticket.status} steps={ticket.type === 'borrow' ? [...PIPELINE, RETURNED_STEP] : PIPELINE} />
        </section>

        {/* request details (left) + items (right) — one screen */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* request details */}
        <section className="order-2 lg:order-1">
          <SectionTitle>Request details</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile icon={<User2 className="h-3.5 w-3.5" />} label="Requester" value={ticket.createdByName} />
            <Tile label="Department" value={ticket.department} />
            <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Created" value={lastActionWhen(ticket.createdAt)} />
            <Tile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Needed by" value={ticket.deliveryDate || '—'} />
            {ticket.type === 'borrow' && (
              <Tile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Return date" value={ticket.returnDate || '—'} />
            )}
            {ticket.actualDeliveryDate && (
              <Tile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Delivered on" value={ticket.actualDeliveryDate} />
            )}
          </div>
          {ticket.remark && (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-amber-100">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold">Remark: </span>{ticket.remark}</span>
            </p>
          )}
        </section>
        {/* items */}
        <section className="order-1 lg:order-2">
          <div className="flex items-center justify-between">
            <SectionTitle>{isReturn ? 'Items to return' : 'Items'}</SectionTitle>
            <span className="-mt-2 text-xs font-medium text-slate-500">
              Est. value <span className="font-bold text-slate-700">{money(estTotal)}</span>
            </span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 lg:max-h-[300px] lg:overflow-y-auto">
            {ticket.items.map((it) => {
              const sku = skus.find((s) => s.id === it.skuId);
              const q = Number(qtys[it.skuId]) || 0;
              const over = !isReturn && !!sku && q > sku.currentStock;
              return (
                <div key={it.skuId} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', over ? 'text-rose-700' : 'text-slate-800')}>{it.skuName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Requested <span className="font-semibold text-slate-600">{fmt(it.qtyRequested)} {it.unit}</span>
                      {sku && (
                        <> · In stock <span className={cn('font-semibold', sku.currentStock >= q ? 'text-emerald-600' : 'text-rose-600')}>{fmt(sku.currentStock)}</span></>
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
                    <div className="flex items-center gap-1">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy} onClick={() => setQty(it.skuId, q - 1)} aria-label={`Decrease approved qty of ${it.skuName}`}
                      >−</button>
                      <input
                        className="w-14 rounded-lg border border-slate-200 py-1 text-center text-sm font-semibold text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        type="number" min={0} value={qtys[it.skuId] ?? ''}
                        onChange={(e) => setQtys((s) => ({ ...s, [it.skuId]: e.target.value }))}
                        aria-label={`Approved qty of ${it.skuName}`}
                      />
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy} onClick={() => setQty(it.skuId, q + 1)} aria-label={`Increase approved qty of ${it.skuName}`}
                      >+</button>
                      <span className="w-8 shrink-0 text-xs text-slate-400">{it.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {overStock && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Some approved quantities exceed current stock — double-check before booking.
            </p>
          )}
          {role === 'warehouse' && !isReturn && (
            <div className="mt-2.5">
              <label className="label">Actual delivery date</label>
              <input className="input" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
          )}
        </section>
        </div>

        {/* comments & history */}
        <section>
          <SectionTitle icon={<MessageSquare className="h-3.5 w-3.5" />}>Comments & history</SectionTitle>
          <ActionTrail actions={actions} />
        </section>
      </div>

    </div>
  );
}
