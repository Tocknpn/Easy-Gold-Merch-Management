// ── Audit Trail (Admin) — who did what, in plain language ────────────────
// Rows come from public.audit_log (migration 0016), written by database
// triggers; RLS only returns them to an Admin. Fetched on demand so the
// shared data bundle stays small. Two reading modes: a day-grouped timeline
// (default — easy to read) and a compact table.
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRightLeft, CheckCircle2, ChevronDown, Download, Filter, Info, Layers,
  PackageMinus, PackagePlus, PencilLine, Plus, RefreshCw, RotateCcw, ScrollText, Search,
  ShieldCheck, Ticket, Trash2, Undo2, UserCog, Users, Wrench, XCircle,
} from 'lucide-react';
import { useAuth, getUserRoleLabel } from '@/contexts/AuthContext';
import { apiFetchAudit } from '@/lib/api';
import type { AuditEntry, AuditModule } from '@/lib/types';
import { AUDIT_MODULES, AUDIT_MODULE_LABELS, auditFieldLabel } from '@/lib/types';
import { EmptyState, ErrorBanner, Pagination, Spinner, StatCard } from '@/components/ui/primitives';
import { cn, dayOf, downloadCsv, shiftDay, todayStr } from '@/lib/utils';

const LIMIT_STEP = 300;

const VIEWS: { key: 'timeline' | 'table'; label: string; icon: ReactNode }[] = [
  { key: 'timeline', label: 'Timeline', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: 'table', label: 'Table', icon: <Layers className="h-3.5 w-3.5" /> },
];

const PERIODS: { label: string; days: number | 'all' }[] = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'All', days: 'all' },
];

const MODULE_STYLE: Record<string, string> = {
  ticket: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  ledger: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  master: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  settings: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  users: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  remark: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  app: 'bg-slate-100 text-slate-600 ring-slate-400/20',
};

/** Icon + colour + friendly verb for an audit action. */
function actionVisual(action: string): { Icon: typeof Plus; cls: string; label: string } {
  const a = String(action || '').toLowerCase();
  const v = (Icon: typeof Plus, cls: string, label: string) => ({ Icon, cls, label });
  if (a === 'create' || a === 'created') return v(Plus, 'bg-emerald-50 text-emerald-600 ring-emerald-100', 'Created');
  if (a === 'update' || a === 'updated') return v(PencilLine, 'bg-sky-50 text-sky-600 ring-sky-100', 'Edited');
  if (a === 'correct') return v(Wrench, 'bg-amber-50 text-amber-600 ring-amber-100', 'Corrected');
  if (a === 'delete' || a === 'deleted') return v(Trash2, 'bg-rose-50 text-rose-600 ring-rose-100', 'Deleted');
  if (a === 'restock') return v(PackagePlus, 'bg-emerald-50 text-emerald-600 ring-emerald-100', 'Restocked');
  if (a === 'destock') return v(PackageMinus, 'bg-rose-50 text-rose-600 ring-rose-100', 'Destock');
  if (a === 'transfer') return v(ArrowRightLeft, 'bg-cyan-50 text-cyan-600 ring-cyan-100', 'Transfer');
  if (a === 'book' || a === 'booked') return v(Layers, 'bg-indigo-50 text-indigo-600 ring-indigo-100', 'Booked');
  if (a === 'issue') return v(PackageMinus, 'bg-slate-100 text-slate-600 ring-slate-200', 'Stock out');
  if (a === 'return' || a === 'returned') return v(Undo2, 'bg-cyan-50 text-cyan-600 ring-cyan-100', 'Returned');
  if (a === 'opening') return v(ScrollText, 'bg-violet-50 text-violet-600 ring-violet-100', 'Opening');
  if (a.includes('reject')) return v(XCircle, 'bg-rose-50 text-rose-600 ring-rose-100', 'Rejected');
  if (a.includes('recall')) return v(RotateCcw, 'bg-slate-100 text-slate-600 ring-slate-200', 'Recalled');
  if (a === 'finalized' || a.includes('approv') || a === 'reviewed') return v(CheckCircle2, 'bg-emerald-50 text-emerald-600 ring-emerald-100', 'Approved');
  if (a === 'password') return v(UserCog, 'bg-amber-50 text-amber-600 ring-amber-100', 'Password');
  return v(Activity, 'bg-slate-100 text-slate-600 ring-slate-200', a.replace(/_/g, ' ') || 'Change');
}

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16) || '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const fullWhen = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** "Today" / "Yesterday" / "Wed, 24 Sep 2026" for a day-group header. */
function dayLabel(day: string): string {
  if (!day) return 'Undated';
  if (day === todayStr()) return 'Today';
  if (day === shiftDay(todayStr(), -1)) return 'Yesterday';
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const initialOf = (name?: string | null): string =>
  (name || '?').trim().charAt(0).toUpperCase() || '?';
export function AuditLogPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(LIMIT_STEP);
  const [from, setFrom] = useState(() => shiftDay(todayStr(), -6));   // last 7 days
  const [to, setTo] = useState(() => todayStr());

  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [area, setArea] = useState<'all' | AuditModule>('all');
  const [act, setAct] = useState('all');
  const [onlyEdits, setOnlyEdits] = useState(false);
  const [view, setView] = useState<'timeline' | 'table'>('timeline');
  const [openId, setOpenId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await apiFetchAudit({ from, to, limit }));
    } catch (e: any) {
      setError(e?.message || 'Could not load the audit trail');
    } finally {
      setLoading(false);
    }
  }, [from, to, limit]);

  useEffect(() => { void load(); }, [load]);

  // ── filters (client-side, over the loaded window) ──────────────────
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter((e) => {
      const d = dayOf(e.at);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (who !== 'all' && (e.actorName || 'Unknown') !== who) return false;
      if (area !== 'all' && e.module !== area) return false;
      if (act !== 'all' && e.action !== act) return false;
      if (onlyEdits && e.action !== 'correct') return false;
      if (term) {
        const hay = [e.actorName, e.summary, e.comment, e.entityName, e.entityId, e.refTicket, e.warehouse,
                     AUDIT_MODULE_LABELS[e.module] || e.module]
          .map((x) => String(x || '').toLowerCase()).join(' ');
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [entries, from, to, q, who, area, act, onlyEdits]);

  const people = useMemo(
    () => [...new Set(entries.map((e) => e.actorName || 'Unknown'))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const actions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );

  const stats = useMemo(() => {
    const edits = filtered.filter((e) => e.action === 'correct').length;
    const actors = new Set(filtered.map((e) => e.actorName || 'Unknown')).size;
    const byArea = new Map<string, number>();
    for (const e of filtered) byArea.set(e.module, (byArea.get(e.module) || 0) + 1);
    const top = [...byArea.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      events: filtered.length,
      edits,
      actors,
      topArea: top ? AUDIT_MODULE_LABELS[top[0]] || top[0] : '—',
      topCount: top ? top[1] : 0,
    };
  }, [filtered]);

  // ── pagination (day headers stay consistent inside each page) ──────
  useEffect(() => { setPage(1); }, [q, who, area, act, onlyEdits, from, to, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((curPage - 1) * pageSize, curPage * pageSize),
    [filtered, curPage, pageSize],
  );
  const groups = useMemo(() => {
    const out: { day: string; rows: AuditEntry[] }[] = [];
    for (const e of pageRows) {
      const day = dayOf(e.at) || '';
      const last = out[out.length - 1];
      if (last && last.day === day) last.rows.push(e);
      else out.push({ day, rows: [e] });
    }
    return out;
  }, [pageRows]);

  const rangePreset: number | 'all' =
    !from && !to ? 'all'
      : from === todayStr() && to === todayStr() ? 1
        : from === shiftDay(todayStr(), -6) && to === todayStr() ? 7
          : from === shiftDay(todayStr(), -29) && to === todayStr() ? 30
            : 0;

  const setRange = (days: number | 'all') => {
    if (days === 'all') { setFrom(''); setTo(''); return; }
    setFrom(shiftDay(todayStr(), -(days - 1)));
    setTo(todayStr());
  };

  const resetFilters = () => {
    setQ(''); setWho('all'); setArea('all'); setAct('all'); setOnlyEdits(false);
    setFrom(shiftDay(todayStr(), -6)); setTo(todayStr());
  };

  const exportCsv = () => {
    downloadCsv(`audit-trail-${todayStr()}.csv`, [
      ['When', 'Who', 'Role', 'Area', 'Action', 'What happened', 'Item', 'Warehouse', 'Ticket', 'Comment', 'Changes'],
      ...filtered.map((e) => [
        fullWhen(e.at),
        e.actorName || '',
        e.actorRole ? getUserRoleLabel(e.actorRole) : '',
        AUDIT_MODULE_LABELS[e.module] || e.module,
        actionVisual(e.action).label,
        e.summary,
        e.entityName || '',
        e.warehouse || '',
        e.refTicket || '',
        e.comment || '',
        (e.changes || [])
          .map((c) => `${auditFieldLabel(c.field)}: ${c.from ?? '(empty)'} → ${c.to ?? '(empty)'}`)
          .join('; '),
      ]),
    ]);
  };

  if (!isAdmin) {
    return (
      <div className="card card-pad mx-auto mt-16 max-w-md text-center">
        <p className="text-3xl">🔒</p>
        <h2 className="mt-2 text-lg font-semibold">Admins only</h2>
        <p className="mt-1 text-sm text-slate-500">The audit trail records who changed what across the system.</p>
      </div>
    );
  }

  const th = 'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const td = 'px-3 py-3 align-top';
  const openTicket = () => navigate('/ticket-tracking?scope=all');
  // Before migration 0016 has been applied the table simply isn't there yet —
  // say that in plain words instead of PostgREST's "schema cache" message.
  const notSetUp = !!error && /audit_log/i.test(error);

  return (
    <div className="space-y-5">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-brand-600" /> Audit Trail
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Every change made in the app — who did it, what changed and why. Recorded
            automatically when it happens (Admins only).
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* ── summary cards (they follow the filters) ────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Events in view" value={stats.events} tone="blue"
          icon={<Activity className="h-4 w-4" />}
          sub={from || to ? `${from || 'earliest'} → ${to || 'today'}` : 'all time loaded'}
        />
        <StatCard
          label="Corrections" value={stats.edits} tone="amber"
          icon={<Wrench className="h-4 w-4" />} sub="edited values with a reason"
        />
        <StatCard
          label="People active" value={stats.actors} tone="violet"
          icon={<Users className="h-4 w-4" />} sub="in this view"
        />
        <StatCard
          label="Busiest area" value={stats.topArea} tone="emerald"
          icon={<Layers className="h-4 w-4" />} sub={`${stats.topCount} event${stats.topCount === 1 ? '' : 's'}`}
        />
      </div>

      {/* ── filters ────────────────────────────────────────────────── */}
      <div className="card card-pad space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-64 pl-9" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search person, item, ticket, comment…"
            />
          </div>
          <select className="input w-44" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">All people</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input w-44" value={area} onChange={(e) => setArea(e.target.value as 'all' | AuditModule)}>
            <option value="all">All areas</option>
            {AUDIT_MODULES.map((m) => <option key={m} value={m}>{AUDIT_MODULE_LABELS[m]}</option>)}
          </select>
          <select className="input w-40" value={act} onChange={(e) => setAct(e.target.value)}>
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{actionVisual(a).label}</option>)}
          </select>
          <button
            className={cn('btn btn-sm', onlyEdits ? 'btn-warning' : 'btn-secondary')}
            onClick={() => setOnlyEdits((v) => !v)}
            title="Show only rows where someone corrected a value"
          >
            <Wrench className="h-3.5 w-3.5" /> Corrections only
          </button>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <Filter className="h-3 w-3" /> Period
          </span>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setRange(p.days)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold ring-1 transition',
                rangePreset === p.days
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-700',
              )}
            >
              {p.label}
            </button>
          ))}
          <input type="date" className="input w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-slate-400">→</span>
          <input type="date" className="input w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="ml-auto flex gap-1.5 rounded-xl bg-slate-100 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  view === v.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Comments and reasons are kept in full — click any row to read them. A
          <Wrench className="mx-0.5 inline h-3 w-3 text-amber-500" /> correction is a stock movement
          someone fixed, with the reason they gave.
        </p>
      </div>

      {loading && entries.length === 0 ? (
        <Spinner label="Loading audit trail…" />
      ) : notSetUp ? (
        <div className="card card-pad border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">The audit table isn&apos;t set up yet</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-700">
                Run <code className="rounded bg-white/70 px-1 py-0.5">supabase/migrations/0016_audit_log.sql</code>{' '}
                in the Supabase SQL Editor (it is safe to re-run), then press Retry. It creates the
                table, the logging triggers and the Admin-only read rule — nothing else is affected.
              </p>
              <p className="mt-1.5 text-[11px] text-amber-600/80">{error}</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Retry
            </button>
          </div>
        </div>
      ) : error ? (
        <ErrorBanner msg={error} retry={() => void load()} />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title="No events match"
            sub="Try a wider period or clear the filters. If the trail is still empty right after setup, run supabase/migrations/0016_audit_log.sql (README → Going live)."
          />
        </div>
      ) : view === 'timeline' ? (
        <div className="card overflow-hidden">
          {groups.map((g, gi) => (
            <div key={g.day || 'undated'}>
              <div
                className={cn(
                  'flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2',
                  gi > 0 && 'border-t',
                )}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{dayLabel(g.day)}</span>
                <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                  {g.rows.length} event{g.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.rows.map((e) => (
                  <TimelineRow
                    key={e.id} e={e} open={openId === e.id}
                    onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                    onOpenTicket={openTicket}
                  />
                ))}
              </ul>
            </div>
          ))}
          <Pagination
            page={curPage} pageSize={pageSize} total={filtered.length} unit="events"
            onPageChange={setPage} onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <TableRowList
          rows={pageRows} th={th} td={td} openId={openId}
          onToggle={(id) => setOpenId(openId === id ? null : id)} onOpenTicket={openTicket}
          paging={{ page: curPage, pageSize, total: filtered.length, onPageChange: setPage, onPageSizeChange: setPageSize }}
        />
      )}

      {entries.length >= limit && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 no-print">
          <span>The newest {entries.length} events of this period are loaded — narrow the period, or load older ones.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setLimit((n) => n + LIMIT_STEP)} disabled={loading}>
            {loading ? 'Loading…' : `Load ${LIMIT_STEP} older`}
          </button>
        </div>
      )}
    </div>
  );
}


// ── compact TABLE view ──────────────────────────────────────────────────
function TableRowList({
  rows, th, td, openId, onToggle, onOpenTicket, paging,
}: {
  rows: AuditEntry[];
  th: string;
  td: string;
  openId: number | null;
  onToggle: (id: number) => void;
  onOpenTicket: () => void;
  paging: {
    page: number; pageSize: number; total: number;
    onPageChange: (p: number) => void; onPageSizeChange: (n: number) => void;
  };
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className={th}>When</th>
              <th className={th}>Who</th>
              <th className={th}>Area</th>
              <th className={th}>Action</th>
              <th className={th}>What happened</th>
              <th className={th}>Item / target</th>
              <th className={`${th} pr-4`}>Note / reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => {
              const { Icon, cls, label } = actionVisual(e.action);
              const open = openId === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    onClick={() => onToggle(e.id)}
                    className={cn('cursor-pointer transition hover:bg-slate-50/70', open && 'bg-slate-50/70')}
                  >
                    <td className={`${td} whitespace-nowrap text-xs text-slate-500`}>{fullWhen(e.at)}</td>
                    <td className={td}>
                      <p className="text-[13px] font-medium text-slate-800">{e.actorName || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-400">{e.actorRole ? getUserRoleLabel(e.actorRole) : '—'}</p>
                    </td>
                    <td className={td}>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold ring-1', MODULE_STYLE[e.module] || MODULE_STYLE.app)}>
                        {AUDIT_MODULE_LABELS[e.module] || e.module}
                      </span>
                      {e.warehouse && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{e.warehouse}</span>}
                    </td>
                    <td className={td}>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1', cls)}>
                        <Icon className="h-3 w-3" /> {label}
                      </span>
                    </td>
                    <td className={`${td} max-w-[320px]`}>
                      <p className="text-[13px] text-slate-700">{e.summary}</p>
                      {e.refTicket && <p className="font-mono text-[10px] text-slate-400">{e.refTicket}</p>}
                    </td>
                    <td className={`${td} max-w-[200px]`}>
                      <p className="truncate text-xs text-slate-600" title={e.entityName || ''}>{e.entityName || '—'}</p>
                    </td>
                    <td className={`${td} max-w-[260px] pr-4`}>
                      <p className="line-clamp-2 break-words text-xs text-slate-500" title={e.comment || ''}>
                        {e.comment || '—'}
                      </p>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <AuditDetail e={e} onOpenTicket={onOpenTicket} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={paging.page} pageSize={paging.pageSize} total={paging.total} unit="events"
        onPageChange={paging.onPageChange} onPageSizeChange={paging.onPageSizeChange}
      />
    </div>
  );
}

// ── TIMELINE row: reads like a sentence ("who · what · why") ─────────────
function TimelineRow({
  e, open, onToggle, onOpenTicket,
}: { e: AuditEntry; open: boolean; onToggle: () => void; onOpenTicket: () => void }) {
  const { Icon, cls, label } = actionVisual(e.action);
  const role = e.actorRole ? getUserRoleLabel(e.actorRole) : '';
  return (
    <li className={cn('transition', open && 'bg-slate-50/60')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50/70"
      >
        <span className="w-10 shrink-0 pt-1 text-[11px] font-semibold tabular-nums text-slate-400">
          {timeOf(e.at)}
        </span>
        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1', cls)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-700">
                {initialOf(e.actorName)}
              </span>
              <b className="text-[13px] font-semibold text-slate-800">{e.actorName || 'Unknown user'}</b>
              {role && <span className="text-[11px] text-slate-400">{role}</span>}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold ring-1', MODULE_STYLE[e.module] || MODULE_STYLE.app)}>
              {AUDIT_MODULE_LABELS[e.module] || e.module}
            </span>
            {e.warehouse && (
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                e.warehouse === 'MKT'
                  ? 'bg-brand-50 text-brand-700 ring-brand-600/20'
                  : 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
              )}>
                {e.warehouse}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[13px] text-slate-700">{e.summary}</span>
          {e.comment && (
            <span className="mt-1 block line-clamp-2 break-words text-[11px] italic text-slate-500" title={e.comment}>
              “{e.comment}”
            </span>
          )}
        </span>
        <ChevronDown className={cn('mt-1.5 h-4 w-4 shrink-0 text-slate-300 transition', open && 'rotate-180 text-brand-500')} />
      </button>
      {open && <AuditDetail e={e} onOpenTicket={onOpenTicket} />}
    </li>
  );
}

// ── expanded row: the FULL comment + the Before → After table ────────────
function AuditDetail({ e, onOpenTicket }: { e: AuditEntry; onOpenTicket: () => void }) {
  const changes = e.changes || [];
  const who = [e.actorName || 'Unknown user', e.actorRole ? `· ${getUserRoleLabel(e.actorRole)}` : '', e.actorEmail ? `· ${e.actorEmail}` : '']
    .filter(Boolean).join(' ');
  return (
    <div className="border-l-2 border-brand-300 bg-slate-50/70 px-4 py-3.5 sm:pl-16">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <dl className="text-xs">
          <Field label="When" value={fullWhen(e.at)} />
          <Field label="Who" value={who} />
          <Field label="Source row" value={[e.entity, e.entityId].filter(Boolean).join(' · ') || '—'} />
          <Field label="Item / target" value={e.entityName || '—'} />
          {e.warehouse && <Field label="Warehouse" value={e.warehouse} />}
          <Field label="Logged" value={e.origin === 'import' ? 'imported history' : 'automatically by the app'} />
        </dl>

        <div className="space-y-3">
          {changes.length > 0 && (
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5">Field</th>
                    <th className="px-3 py-1.5">Before</th>
                    <th className="px-3 py-1.5">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {changes.map((c, i) => (
                    <tr key={`${c.field}-${i}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-600">{auditFieldLabel(c.field)}</td>
                      <td className="px-3 py-1.5 text-rose-600">{c.from ?? '(empty)'}</td>
                      <td className="px-3 py-1.5 font-semibold text-emerald-700">{c.to ?? '(empty)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Comment / reason</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
              {e.comment || '—'}
            </p>
          </div>

          {e.refTicket && (
            <button className="btn btn-outline btn-sm" onClick={onOpenTicket}>
              <Ticket className="h-3.5 w-3.5" /> Open {e.refTicket}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 first:mt-0">{label}</dt>
      <dd className="break-words text-slate-700">{value}</dd>
    </>
  );
}

