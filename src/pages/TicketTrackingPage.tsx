// ── Ticket Tracking: your requests + every ticket + full stock-movement audit ──
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Download, ListChecks, ArrowRightLeft, Clock3, CircleCheck, XCircle, Undo2, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, Spinner, ErrorBanner, EmptyState, toast } from '@/components/ui/primitives';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import { TicketDetail } from '@/components/TicketDetail';
import { fmt, money, cn } from '@/lib/utils';
import type { SKU, TicketWithItems, StockTransaction } from '@/lib/types';

type Scope = 'mine' | 'all' | 'moves';

const STATUS_CHIPS = ['all', 'pending', 'reviewed', 'lm_approved', 'finalized', 'to-return', 'returned', 'rejected', 'recalled'] as const;

const CAT_ORDER = ['issue', 'returned', 'in', 'out', 'loss', 'transfer', 'opening'] as const;
type CatKey = (typeof CAT_ORDER)[number];
const CAT_LABEL: Record<CatKey, string> = {
  issue: 'Ticket issue', returned: 'Ticket return', in: 'Stock in', out: 'Stock out',
  loss: 'Loss / Broken', transfer: 'Transfer', opening: 'Opening',
};
const CAT_STYLE: Record<CatKey, string> = {
  issue: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  returned: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  in: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  out: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  loss: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  transfer: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  opening: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

function catOf(tx: StockTransaction): CatKey {
  const ref = tx.ticketId || '';
  const st = (tx.status || '').toLowerCase();
  if (st === 'opening') return 'opening';
  if (ref.startsWith('TKT-')) return tx.type === 'deduction' ? 'issue' : 'returned';
  if (st.includes('loss') || st.includes('broken')) return 'loss';
  if (ref.startsWith('CS_TRANSFER') || ref.startsWith('MKT_TRANSFER')) return 'transfer';
  if (tx.type === 'addition') return 'in';
  return 'out';
}

function isPendingReturn(t: TicketWithItems): boolean {
  return t.type === 'borrow' && t.status === 'finalized' && !t.returnedProcessed;
}

function downloadCsv(name: string, head: string[], rows: (string | number)[][]) {
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const HISTORY_ROLES = ['warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service'];

export function TicketTrackingPage() {
  const { user, hasAccess } = useAuth();
  const { tickets, loading, error, refresh } = useData();
  const [params, setParams] = useSearchParams();
  const canAll = hasAccess(HISTORY_ROLES);
  const raw = (params.get('scope') as Scope) || 'mine';
  const scope: Scope =
    raw === 'moves' ? (canAll ? 'moves' : 'mine') : raw === 'all' ? (canAll ? 'all' : 'mine') : 'mine';

  const mine = useMemo(
    () =>
      tickets.filter(
        (t) => t.createdBy === user?.email || t.createdBy === user?.id || t.createdByName === user?.fullName,
      ),
    [tickets, user],
  );
  const base = scope === 'mine' ? mine : tickets;

  const stats = useMemo(
    () => ({
      active: base.filter((t) => ['pending', 'reviewed', 'lm_approved'].includes(t.status)).length,
      toReturn: base.filter(isPendingReturn).length,
      done: base.filter((t) => t.status === 'returned' || (t.status === 'finalized' && !isPendingReturn(t))).length,
      closed: base.filter((t) => ['rejected', 'recalled'].includes(t.status)).length,
    }),
    [base],
  );

  const setScope = (s: Scope) => setParams(s === 'mine' ? {} : { scope: s }, { replace: true });

  const card = (key: 'active' | 'toReturn' | 'done' | 'closed') => {
    const defs = {
      active: { label: 'Active in pipeline', sub: 'pending · review · approved', tone: 'text-amber-600', bg: 'from-amber-50 to-orange-50', ring: 'ring-amber-200', icon: <Clock3 className="h-4 w-4 text-amber-500" />, chip: 'bg-amber-100 text-amber-700' },
      toReturn: { label: 'To return to WH', sub: 'finalized borrows awaiting return', tone: 'text-indigo-600', bg: 'from-indigo-50 to-violet-50', ring: 'ring-indigo-200', icon: <Undo2 className="h-4 w-4 text-indigo-500" />, chip: 'bg-indigo-100 text-indigo-700' },
      done: { label: 'Completed', sub: 'approved, delivered & returned', tone: 'text-emerald-600', bg: 'from-emerald-50 to-teal-50', ring: 'ring-emerald-200', icon: <CircleCheck className="h-4 w-4 text-emerald-500" />, chip: 'bg-emerald-100 text-emerald-700' },
      closed: { label: 'Closed', sub: 'rejected or recalled', tone: 'text-rose-600', bg: 'from-rose-50 to-red-50', ring: 'ring-rose-200', icon: <XCircle className="h-4 w-4 text-rose-500" />, chip: 'bg-rose-100 text-rose-700' },
    }[key];
    return (
      <div className={cn('rounded-2xl bg-gradient-to-br p-4 ring-1', defs.bg, defs.ring)}>
        <div className="flex items-center justify-between">
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', defs.chip)}>{defs.icon}</span>
          <span className={cn('text-3xl font-extrabold tabular-nums', defs.tone)}>{stats[key]}</span>
        </div>
        <p className="mt-2 text-sm font-bold text-slate-800">{defs.label}</p>
        <p className="text-[11px] text-slate-500">{defs.sub}</p>
      </div>
    );
  };

  const scopeBtn = (s: Scope, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setScope(s)}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
        scope === s ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
      )}
    >
      {icon} {label}
    </button>
  );

  if (loading) return <Spinner label="Loading ticket tracking…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ticket Tracking</h1>
          <p className="text-sm text-slate-500">
            What's pending, what's done, and every stock movement — one workspace
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
          {scopeBtn('mine', <ListChecks className="h-4 w-4" />, `My Requests · ${mine.length}`)}
          {canAll && scopeBtn('all', <ListChecks className="h-4 w-4" />, `All Tickets · ${tickets.length}`)}
          {canAll && scopeBtn('moves', <ArrowRightLeft className="h-4 w-4" />, 'Stock Movements')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {card('active')}
        {card('toReturn')}
        {card('done')}
        {card('closed')}
      </div>

      {scope === 'moves' ? <MovementsTab /> : <TicketsTab mineOnly={scope === 'mine'} />}
    </div>
  );
}

/* ── Tickets list (scope: mine or all) ──────────────────────────────────── */

function TicketsTab({ mineOnly }: { mineOnly: boolean }) {
  const { user } = useAuth();
  const { tickets, skus, updateTicketStatus } = useData();
  const [open, setOpen] = useState<TicketWithItems | null>(null);
  const [status, setStatus] = useState<string>('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    let out = tickets;
    if (mineOnly)
      out = out.filter(
        (t) => t.createdBy === user?.email || t.createdBy === user?.id || t.createdByName === user?.fullName,
      );
    if (status === 'to-return') out = out.filter(isPendingReturn);
    else if (status !== 'all') out = out.filter((t) => t.status === status);
    if (type !== 'all') out = out.filter((t) => t.type === type);
    const term = q.trim().toLowerCase();
    if (term)
      out = out.filter(
        (t) =>
          t.id.toLowerCase().includes(term) ||
          (t.createdByName || '').toLowerCase().includes(term) ||
          (t.department || '').toLowerCase().includes(term) ||
          t.items.some((i) => (i.skuName || '').toLowerCase().includes(term)),
      );
    return [...out].sort(
      (a, b) =>
        (isPendingReturn(b) ? 1 : 0) - (isPendingReturn(a) ? 1 : 0) ||
        (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
  }, [tickets, mineOnly, user, status, type, q]);

  const count = (s: string) => {
    let base = tickets;
    if (mineOnly)
      base = base.filter(
        (t) => t.createdBy === user?.email || t.createdBy === user?.id || t.createdByName === user?.fullName,
      );
    if (s === 'all') return base.length;
    if (s === 'to-return') return base.filter(isPendingReturn).length;
    return base.filter((t) => t.status === s).length;
  };

  const exportCsv = () =>
    downloadCsv(
      `tickets-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Ticket', 'Type', 'Requester', 'Department', 'Status', 'Created', 'Delivery', 'Return', 'Items', 'Last action'],
      rows.map((t) => [
        t.id, t.type, t.createdByName, t.department, t.status, (t.createdAt || '').slice(0, 10),
        t.deliveryDate || '', t.returnDate || '',
        t.items.map((i) => `${i.skuName} x${i.qtyApproved ?? i.qtyRequested}`).join('; '),
        `${t.lastActionStatus || ''} by ${t.lastActionBy || ''}`,
      ]),
    );

  const th = 'whitespace-nowrap px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const td = 'px-2.5 py-3';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-64 pl-9" placeholder="Search ID, requester, item…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-40" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="request">Request</option>
          <option value="borrow">Borrow</option>
          <option value="cs_transfer">CS Transfer</option>
        </select>
        <button className="btn btn-outline btn-sm ml-auto" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold capitalize transition ring-1',
              status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-700',
              s === 'to-return' && status !== s && 'text-indigo-600 ring-indigo-300',
            )}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')} · {count(s)}
          </button>
        ))}
      </div>

<div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No tickets match" sub="Try clearing the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className={`${th} pl-4`}>Ticket</th>
                  {!mineOnly && <th className={th}>Requester</th>}
                  <th className={th}>Items</th>
                  <th className={th}>Created</th>
                  <th className={th}>Delivery</th>
                  <th className={th}>Return due</th>
                  <th className={th}>Last action</th>
                  <th className={`${th} pr-4`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => {
                  const pr = isPendingReturn(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setOpen(t)}
                      className={cn('cursor-pointer transition hover:bg-brand-50/40', pr && 'bg-indigo-50/40')}
                    >
                      <td className={`${td} max-w-[180px] pl-4`}>
                        <p className="truncate font-semibold text-brand-700" title={t.id}>{t.id}</p>
                        <TypeBadge type={t.type} />
                      </td>
                      {!mineOnly && (
                        <td className={`${td} max-w-[170px]`}>
                          <p className="truncate font-medium text-slate-800" title={t.createdByName || ''}>{t.createdByName || '—'}</p>
                          <p className="truncate text-xs text-slate-400" title={t.department || ''}>{t.department || '—'}</p>
                        </td>
                      )}
                      <td className={`${td} max-w-[225px]`}>
                        <p className="truncate text-slate-600" title={t.items.map((i) => i.skuName).join(', ')}>
                          {t.items.map((i) => i.skuName).join(', ')}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t.items.length} item{t.items.length > 1 ? 's' : ''} · ×{t.items.reduce((a, i) => a + (i.qtyApproved ?? i.qtyRequested), 0)} total
                        </p>
                      </td>
                      <td className={`${td} whitespace-nowrap text-slate-500`}>{(t.createdAt || '').slice(0, 10)}</td>
                      <td className={`${td} whitespace-nowrap text-slate-500`}>{(t.deliveryDate || '').slice(0, 10) || '—'}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {t.type === 'borrow' ? (
                          <span className={cn('text-xs font-semibold', pr ? 'text-indigo-600' : 'text-slate-500')}>
                            {(t.returnDate || '').slice(0, 10) || '—'}
                            {pr && <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">due</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`${td} max-w-[170px]`}>
                        <p className="truncate text-xs font-medium capitalize text-slate-600">{(t.lastActionStatus || '—').replace('_', ' ')}</p>
                        <p className="truncate text-xs text-slate-400" title={t.lastActionBy ? `${t.lastActionBy}${t.lastActionAt ? ` · ${t.lastActionAt.slice(0, 10)}` : ''}` : ''}>
                          {t.lastActionBy}{t.lastActionAt ? ` · ${t.lastActionAt.slice(0, 10)}` : ''}
                        </p>
                      </td>
                      <td className={`${td} pr-4 whitespace-nowrap`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={t.status} />
                          {pr && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-600/20">
                              <Undo2 className="h-3 w-3" /> Return due
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

{open && (
        <Modal open onClose={() => setOpen(null)} title={`${open.id} · ${open.type.toUpperCase()}`} wide>
          <TicketDetail ticket={open} skus={skus} />
          {isPendingReturn(open) && (
            <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              <Undo2 className="mr-1.5 inline h-4 w-4" />
              This borrow was finalized — please return the items to the warehouse on or before
              <b> {open.returnDate || 'the due date'}</b>.
            </div>
          )}
          {['reviewed', 'lm_approved'].includes(open.status) && (
            <CreatorRecall ticket={open} onDone={() => setOpen(null)} />
          )}
        </Modal>
      )}
    </div>
  );
}

/* ── Creator recall: pull your own request back while it's still in approval ── */

function CreatorRecall({ ticket, onDone }: { ticket: TicketWithItems; onDone: () => void }) {
  const { user } = useAuth();
  const { updateTicketStatus } = useData();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await updateTicketStatus(ticket.id, 'recalled', {
        actorName: user?.fullName || '', actorRole: user?.role || '', comment: reason,
      });
      toast(`${ticket.id} recalled — any booked stock returns to the warehouse`);
      onDone();
    } catch (e: any) {
      toast(e?.message || 'Recall failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
        <Undo2 className="h-4 w-4" /> This request is in approval — you can recall it
      </p>
      <p className="mt-0.5 text-xs text-amber-700">
        Recalling pulls the ticket back and returns any booked stock to the warehouse.
      </p>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1" placeholder="Reason (optional)…"
          value={reason} onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn btn-danger btn-sm shrink-0" disabled={busy} onClick={run}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Recall Request
        </button>
      </div>
    </div>
  );
}

/* ── Stock Movements: every stock movement (included for the audit trail) ── */

interface MoveRow {
  tx: StockTransaction;
  wh: 'MKT' | 'CS';
  cat: CatKey;
  at: string;
  cost: number;
}

function MovementsTab() {
  const { transactions, csTransactions, skus, csSkus } = useData();
  const [wh, setWh] = useState<'all' | 'MKT' | 'CS'>('all');
  const [cat, setCat] = useState<'all' | CatKey>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo<MoveRow[]>(() => {
    const costById = new Map<string, number>();
    skus.forEach((s) => costById.set(s.id, s.costPerUnit || 0));
    csSkus.forEach((s) => { if (!costById.has(s.id)) costById.set(s.id, s.costPerUnit || 0); });
    const costByName = new Map<string, number>();
    [...skus, ...csSkus].forEach((s) => costByName.set((s.name || '').toLowerCase(), s.costPerUnit || 0));

    const mk = (tx: StockTransaction, w: 'MKT' | 'CS'): MoveRow => ({
      tx, wh: w, cat: catOf(tx),
      at: tx.actionAt || (tx.date ? `${tx.date}T00:00:00` : ''),
      cost: costById.get(tx.skuId || '') ?? costByName.get((tx.skuName || '').toLowerCase()) ?? 0,
    });

    let out = [...transactions.map((t) => mk(t, 'MKT')), ...csTransactions.map((t) => mk(t, 'CS'))];
    if (wh !== 'all') out = out.filter((r) => r.wh === wh);
    if (cat !== 'all') out = out.filter((r) => r.cat === cat);
    if (from) out = out.filter((r) => r.at.slice(0, 10) >= from);
    if (to) out = out.filter((r) => r.at.slice(0, 10) <= to);
    const term = q.trim().toLowerCase();
    if (term)
      out = out.filter(
        (r) =>
          (r.tx.skuName || '').toLowerCase().includes(term) ||
          (r.tx.ticketId || '').toLowerCase().includes(term) ||
          (r.tx.actionBy || '').toLowerCase().includes(term) ||
          (r.tx.comment || '').toLowerCase().includes(term),
      );
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [transactions, csTransactions, skus, csSkus, wh, cat, from, to, q]);

  const sums = useMemo(
    () => ({
      in: rows.filter((r) => r.tx.type === 'addition' && r.cat !== 'returned' && r.cat !== 'transfer').reduce((a, r) => a + (r.tx.qty || 0), 0),
      out: rows.filter((r) => r.tx.type === 'deduction' && r.cat !== 'loss').reduce((a, r) => a + (r.tx.qty || 0), 0),
      loss: rows.filter((r) => r.cat === 'loss').reduce((a, r) => a + (r.tx.qty || 0), 0),
      transfer: rows.filter((r) => r.cat === 'transfer').reduce((a, r) => a + (r.tx.qty || 0), 0),
    }),
    [rows],
  );

  const exportCsv = () =>
    downloadCsv(
      `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`,
      ['When', 'WH', 'Item', 'Direction', 'Qty', 'Broken', 'Value', 'Category', 'Reference', 'By', 'Note'],
      rows.map((r) => [
        r.at.slice(0, 16), r.wh, String(r.tx.skuName ?? ''), r.tx.type === 'addition' ? 'IN' : 'OUT', r.tx.qty,
        r.tx.qtyBroken || 0, r.tx.qty * r.cost, CAT_LABEL[r.cat], String(r.tx.ticketId ?? ''), String(r.tx.actionBy ?? ''), String(r.tx.comment ?? ''),
      ]),
    );

  const th = 'whitespace-nowrap px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const td = 'px-2.5 py-3';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([
          { label: 'Stock in', val: sums.in, tone: 'text-emerald-600', bg: 'bg-emerald-50 ring-emerald-200' },
          { label: 'Stock out', val: sums.out, tone: 'text-slate-700', bg: 'bg-slate-50 ring-slate-200' },
          { label: 'Loss / Broken', val: sums.loss, tone: 'text-rose-600', bg: 'bg-rose-50 ring-rose-200' },
          { label: 'Transfers (MKT⇄CS)', val: sums.transfer, tone: 'text-amber-600', bg: 'bg-amber-50 ring-amber-200' },
        ] as const).map((s) => (
          <div key={s.label} className={cn('rounded-2xl px-4 py-3 ring-1', s.bg)}>
            <p className={cn('text-xl font-extrabold tabular-nums', s.tone)}>{fmt(s.val)}</p>
            <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-56 pl-9" placeholder="Search item, ref, person, note…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-32" value={wh} onChange={(e) => setWh(e.target.value as any)}>
          <option value="all">All WH</option>
          <option value="MKT">MKT</option>
          <option value="CS">CS</option>
        </select>
        <select className="input w-40" value={cat} onChange={(e) => setCat(e.target.value as any)}>
          <option value="all">All categories</option>
          {CAT_ORDER.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </select>
        <input className="input w-36" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-slate-400">→</span>
        <input className="input w-36" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn btn-outline btn-sm ml-auto" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

<div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<ArrowRightLeft className="h-6 w-6" />} title="No movements match" sub="Try widening the date range or clearing filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className={`${th} pl-4`}>When</th>
                  <th className={th}>WH</th>
                  <th className={th}>Item</th>
                  <th className={th}>Dir</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={th}>Category</th>
                  <th className={th}>Reference</th>
                  <th className={th}>By</th>
                  <th className={`${th} pr-4`}>Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={`${r.tx.ticketId}-${r.tx.skuId}-${i}`} className="transition hover:bg-slate-50/70">
                    <td className={`${td} pl-4 whitespace-nowrap text-xs text-slate-500`}>{r.at.replace('T', ' ').slice(0, 16)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                        r.wh === 'MKT' ? 'bg-brand-50 text-brand-700 ring-brand-600/20' : 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
                      )}>{r.wh}</span>
                    </td>
                    <td className={`${td} max-w-[200px]`}>
                      <p className="truncate font-medium text-slate-800" title={r.tx.skuName ?? ''}>{r.tx.skuName}</p>
                    </td>
                    <td className={cn(`${td} text-xs font-extrabold`, r.tx.type === 'addition' ? 'text-emerald-600' : 'text-rose-600')}>
                      {r.tx.type === 'addition' ? '↓ IN' : '↑ OUT'}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                      <b>{r.tx.type === 'addition' ? '+' : '−'}{fmt(r.tx.qty)}</b>
                      {r.tx.qtyBroken ? <p className="text-[10px] font-semibold text-rose-500">broken: {fmt(r.tx.qtyBroken)}</p> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums text-slate-600`}>{money(r.tx.qty * r.cost)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold ring-1', CAT_STYLE[r.cat])}>{CAT_LABEL[r.cat]}</span>
                    </td>
                    <td className={`${td} max-w-[220px]`}>
                      <p className="truncate font-mono text-xs text-slate-500" title={r.tx.ticketId || ''}>{r.tx.ticketId || '—'}</p>
                    </td>
                    <td className={`${td} max-w-[170px]`}>
                      <p className="truncate text-xs text-slate-500" title={r.tx.actionBy || ''}>{r.tx.actionBy || '—'}</p>
                    </td>
                    <td className={`${td} max-w-[220px] pr-4`}>
                      <p className="truncate text-xs text-slate-400" title={r.tx.comment || ''}>{r.tx.comment || '—'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}