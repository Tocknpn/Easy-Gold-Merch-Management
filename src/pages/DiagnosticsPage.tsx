import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  Activity, ShieldCheck, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, HeartPulse, Info, Loader2,
  Database, Users, Package, Receipt, ArrowRightLeft, Settings,
  Clock, TrendingUp, Boxes, Wifi, WifiOff, Gauge, Timer,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured, supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { useData } from '@/contexts/DataContext';
import { demoDB } from '@/lib/demoStore';
import { Spinner, ErrorBanner } from '@/components/ui/primitives';
import { cn, fmt } from '@/lib/utils';
import { STATUS_LABELS, TYPE_LABELS, ROLE_LABELS } from '@/lib/types';

interface PingEntry { time: number; ms: number; status: 'ok' | 'fail' }
interface WebVitals { lcp: number | null; fid: number | null; cls: number | null; ttfb: number | null }

type Status = 'ok' | 'warn' | 'fail' | 'na' | 'pending';
interface CheckResult { status: Status; detail: string; ms?: number }

const DEFAULT: Record<string, CheckResult> = {
  env: { status: 'pending', detail: 'Waiting…' },
  ping: { status: 'pending', detail: 'Waiting…' },
  auth: { status: 'pending', detail: 'Waiting…' },
  db_skus: { status: 'pending', detail: 'Waiting…' },
  db_tickets: { status: 'pending', detail: 'Waiting…' },
  db_cs_skus: { status: 'pending', detail: 'Waiting…' },
  db_cs_tx: { status: 'pending', detail: 'Waiting…' },
  storage: { status: 'pending', detail: 'Waiting…' },
  write: { status: 'pending', detail: 'Waiting…' },
};

const KEY_LABELS: Record<string, string> = {
  env: 'App environment (build keys)',
  ping: 'Supabase API ping (auth/v1/health)',
  auth: 'Auth session',
  db_skus: 'Database read — skus (MKT)',
  db_tickets: 'Database read — tickets',
  db_cs_skus: 'Database read — cs_skus (CS)',
  db_cs_tx: 'Database read — cs_transactions',
  storage: 'Storage — sku-images bucket',
  write: 'Write test — manage_category (add + delete)',
};

const STATUS_META: Record<Exclude<Status, 'pending'>, { label: string; cls: string; icon: React.ReactNode }> = {
  ok: { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  warn: { label: 'Warning', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  fail: { label: 'FAIL', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: <XCircle className="h-3.5 w-3.5" /> },
  na: { label: 'N/A', cls: 'bg-slate-100 text-slate-500 ring-slate-400/30', icon: <Info className="h-3.5 w-3.5" /> },
};

export function DiagnosticsPage() {
  const { user } = useAuth();
  const {
    loading, error, refresh,
    users, skus, csSkus, tickets, transactions, csTransactions,
    actions, categories, config, isDemo,
  } = useData();
  const [results, setResults] = useState<Record<string, CheckResult>>(DEFAULT);
  const [running, setRunning] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [pingHistory, setPingHistory] = useState<PingEntry[]>([]);
  const [pingInterval, setPingInterval] = useState(5000);
  const [autoPing, setAutoPing] = useState(false);
  const [webVitals, setWebVitals] = useState<WebVitals>({ lcp: null, fid: null, cls: null, ttfb: null });
  const [pingLog, setPingLog] = useState<string[]>([]);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const configured = isSupabaseConfigured();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
  const keyMask = anonKey ? `${anonKey.slice(0, 8)}…${anonKey.slice(-4)} (${anonKey.length} chars)` : '(built-in fallback)';
  const projectName = SUPABASE_URL ? SUPABASE_URL.replace(/^https:\/\//, '').split('.')[0] : '';

  // Derived data counts
  const dataCounts = useMemo(() => ({
    users: users.length,
    skus: skus.length,
    csSkus: csSkus.length,
    tickets: tickets.length,
    transactions: transactions.length,
    csTransactions: csTransactions.length,
    actions: actions.length,
    categories: categories.length,
    totalStock: skus.reduce((sum, s) => sum + (s.currentStock || 0), 0),
    totalCsStock: csSkus.reduce((sum, s) => sum + (s.currentStock || 0), 0),
    lowStockItems: skus.filter((s) => s.currentStock <= s.lowStockThreshold).length,
  }), [users, skus, csSkus, tickets, transactions, csTransactions, actions, categories]);

  // Recent activity (last 5 items)
  const recentTickets = useMemo(() =>
    [...tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5),
    [tickets]
  );

  const recentTransactions = useMemo(() =>
    [...transactions, ...csTransactions]
      .sort((a, b) => (b.actionAt || '').localeCompare(a.actionAt || ''))
      .slice(0, 5),
    [transactions, csTransactions]
  );

  // Ticket status breakdown
  const ticketStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [tickets]);

  // User role breakdown
  const userRoleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1; });
    return counts;
  }, [users]);

  // Ping monitoring
  const addPingLog = useCallback((msg: string) => {
    setPingLog((prev) => {
      const time = new Date().toLocaleTimeString();
      const entry = `[${time}] ${msg}`;
      return [entry, ...prev].slice(0, 50);
    });
  }, []);

  const doPing = useCallback(async () => {
    if (!configured || !SUPABASE_URL) return;
    const t0 = performance.now();
    try {
      const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      const ms = Math.round(performance.now() - t0);
      const status: 'ok' | 'fail' = res.ok ? 'ok' : 'fail';
      setPingHistory((prev) => [...prev, { time: Date.now(), ms, status }].slice(-30));
      addPingLog(`${status.toUpperCase()} ${ms}ms`);
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const failStatus: 'fail' = 'fail';
      setPingHistory((prev) => [...prev, { time: Date.now(), ms, status: failStatus }].slice(-30));
      addPingLog(`FAIL ${ms}ms - ${e?.message || 'Network error'}`);
    }
  }, [configured, addPingLog]);

  // Auto ping effect
  useEffect(() => {
    if (autoPing && configured) {
      pingTimerRef.current = setInterval(doPing, pingInterval);
      return () => { if (pingTimerRef.current) clearInterval(pingTimerRef.current); };
    }
    return () => { if (pingTimerRef.current) clearInterval(pingTimerRef.current); };
  }, [autoPing, pingInterval, configured, doPing]);

  // Calculate uptime and avg response
  const pingStats = useMemo(() => {
    if (pingHistory.length === 0) return { uptime: 0, avgResponse: 0, total: 0, lastMs: 0 };
    const okCount = pingHistory.filter((p) => p.status === 'ok').length;
    const uptime = Math.round((okCount / pingHistory.length) * 100);
    const avgResponse = Math.round(pingHistory.reduce((s, p) => s + p.ms, 0) / pingHistory.length);
    const lastMs = pingHistory[pingHistory.length - 1]?.ms || 0;
    return { uptime, avgResponse, total: pingHistory.length, lastMs };
  }, [pingHistory]);

  // Web Vitals monitoring
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as any;
      setWebVitals((prev) => ({ ...prev, lcp: Math.round(last.startTime) }));
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // FID
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const first = entries[0] as any;
      setWebVitals((prev) => ({ ...prev, fid: Math.round(first.processingStart - first.startTime) }));
    });
    fidObserver.observe({ type: 'first-input', buffered: true });

    // CLS
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput) clsValue += entry.value;
      }
      setWebVitals((prev) => ({ ...prev, cls: Math.round(clsValue * 1000) / 1000 }));
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    // TTFB
    const navEntry = performance.getEntriesByType('navigation')[0] as any;
    if (navEntry) {
      setWebVitals((prev) => ({ ...prev, ttfb: Math.round(navEntry.responseStart - navEntry.requestStart) }));
    }

    return () => {
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setResults((p) => Object.fromEntries(Object.keys(p).map((k) => [k, { status: 'pending', detail: 'Checking…' }])));

    const mark = (key: string, r: CheckResult) => setResults((p) => ({ ...p, [key]: r }));

    const watch = async <T,>(key: string, fn: () => Promise<T>, okDetail: (v: T) => string, errDetail: (e: any) => string): Promise<void> => {
      const t0 = performance.now();
      try {
        const r = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout (6s)')), 6000))]);
        mark(key, { status: 'ok', detail: okDetail(r), ms: Math.round(performance.now() - t0) });
      } catch (e: any) {
        mark(key, { status: 'fail', detail: errDetail(e), ms: Math.round(performance.now() - t0) });
      }
    };

    // 1) env keys present in this build? (built-in fallback always provides them)
    if (!configured) {
      mark('env', { status: 'fail', detail: 'No Supabase client available (should not happen — the build includes a fallback). Check src/lib/supabase.ts was deployed.' });
    } else {
      const src = anonKey ? 'provided by env' : 'built-in fallback (env not injected — OK)';
      mark('env', { status: 'ok', detail: `URL: ${projectName}.supabase.co · anon key: ${keyMask} · source: ${src}` });
    }

    // Demo mode → mark the network/db/write checks as N/A
    if (!configured || !supabase) {
      mark('ping', { status: 'na', detail: 'Supabase not configured (demo mode) — nothing to ping.' });
      mark('auth', { status: 'na', detail: 'No Supabase Auth client (demo mode). Login uses the bundled demo users.' });
      mark('db_skus', { status: 'na', detail: `${demoDB.skus.length} SKUs in the offline demo bundle (in-memory only).` });
      mark('db_tickets', { status: 'na', detail: `${demoDB.tickets.length} tickets in the offline demo bundle (in-memory only).` });
      mark('storage', { status: 'na', detail: 'No storage client (demo mode).' });
      mark('write', { status: 'na', detail: 'No database to write to (demo mode).' });
      setRunning(false);
      setLastRun(new Date().toLocaleTimeString());
      return;
    }
    // non-null client for the live-mode checks (TS can't narrow the module let inside closures)
    const sb = supabase;

// 2) network ping — Supabase public health endpoint (no auth needed)
    await watch(
      'ping',
      async () => {
        const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, { method: 'GET', headers: { apikey: SUPABASE_ANON_KEY } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let j: any = {};
        try { j = await res.json(); } catch { /* some hosts return an empty body on 200 */ }
        if (j && j.is_healthy === false) throw new Error('report believed unhealthy');
        return j;
      },
      () => 'Supabase reachable (auth service healthy)',
      (e) => `Cannot reach Supabase API: ${e?.message || e}`,
    );

    // 3) auth session — verify the REAL Supabase session, not just localStorage
    const { data: sess } = await sb.auth.getSession();
    if (sess?.session?.user?.email) {
      mark('auth', { status: 'ok', detail: `Supabase session active as ${sess.session.user.email}` });
    } else if (user) {
      mark('auth', { status: 'warn', detail: `App shows ${user.email}, but there is no active Supabase session — data reads will be empty. Log in again.` });
    } else {
      mark('auth', { status: 'warn', detail: 'Not signed in — RLS read policies return empty rows because the user is not authenticated.' });
    }

    // 4) DB reads (head count)
    await watch(
      'db_skus',
      async () => {
        const { data, error, count } = await sb.from('skus').select('id', { head: true, count: 'exact' });
        if (error) throw error;
        return { count: count ?? (data?.length ?? 0), signedIn: !!user };
      },
      (v) => `${v.count} SKUs readable${v.signedIn ? '' : ' — but you are NOT signed in, so RLS returns 0'}`,
      (e) => `DB error: ${e?.message || e}`,
    );
    await watch(
      'db_tickets',
      async () => {
        const { data, error, count } = await sb.from('tickets').select('id', { head: true, count: 'exact' });
        if (error) throw error;
        return count ?? (data?.length ?? 0);
      },
      (v) => `${v} tickets readable`,
      (e) => `DB error: ${e?.message || e}`,
    );

    // 4b) db reads — CS skus
    await watch('db_cs_skus', async () => {
      const { data, error } = await supabase!.from('cs_skus').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return data || [];
    }, (v) => `${v} CS SKUs readable`, (e) => `DB error: ${e?.message || e}`);

    // 4c) db reads — CS transactions
    await watch('db_cs_tx', async () => {
      const { data, error } = await supabase!.from('cs_transactions').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return data || [];
    }, (v) => `${v} CS transactions readable`, (e) => `DB error: ${e?.message || e}`);

    // 5) storage bucket
    await watch(
      'storage',
      async () => {
        // list files in the bucket — works with anon key on public buckets
        const { data, error } = await sb.storage.from('sku-images').list('', { limit: 1 });
        if (error) throw error;
        return data;
      },
      () => 'Bucket "sku-images" exists',
      (e) => `Storage error: ${e?.message || e}`,
    );

    // 6) write test — safe & self-cleaning: add + delete a temp category
    await watch(
      'write',
      async () => {
        const tmp = '__healthcheck_' + Date.now();
        const { error: addErr } = await sb.rpc('manage_category', { p_action: 'add', p_name: tmp });
        if (addErr) throw addErr;
        const { error: delErr } = await sb.rpc('manage_category', { p_action: 'delete', p_name: tmp });
        if (delErr) throw delErr;
        return true;
      },
      () => 'Write path works (temporary category added + removed)',
      (e) => `Write FAILED: ${e?.message || e}`,
    );

    setRunning(false);
    setLastRun(new Date().toLocaleTimeString());
  }, [configured, keyMask, user]);

  useEffect(() => { run(); }, [run]);
if (loading) return <Spinner label="Loading data…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  const total = Object.values(results);
  const okCount = total.filter((r) => r.status === 'ok').length;
  const failCount = total.filter((r) => r.status === 'fail').length;
  const naCount = total.filter((r) => r.status === 'na').length;
  const demo = !configured;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <HeartPulse className="h-5 w-5 text-brand-600" /> Diagnostics &amp; Health
          </h1>
          <p className="text-sm text-slate-500">
            Checks the app→Supabase connection, database reads, auth and storage.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? 'Running…' : 'Run checks'}
        </button>
      </div>

      {demo && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm leading-relaxed text-amber-800">
            <p className="font-bold">⚠️ DEMO mode — you should NOT be seeing this.</p>
            <p className="mt-1">
              The build includes a built-in fallback with your public Supabase keys, so this
              usually means you are viewing a <b>cached / preview</b> deployment. Try a hard
              refresh (<code>Ctrl+Shift+R</code>) or open the production URL
              <code> https://easy-gold-merch.pages.dev</code>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Mode" value={demo ? 'DEMO' : 'LIVE'} tone={demo ? 'amber' : 'emerald'} />
        <StatCard label="Checks passed" value={`${okCount}/${total.length}`} tone="emerald" />
        <StatCard label="Failures" value={String(failCount)} tone={failCount ? 'rose' : 'slate'} />
        <StatCard label="Not applicable" value={String(naCount)} tone="slate" />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Activity className="h-4 w-4 text-brand-600" /> Check results
            {lastRun && <span className="ml-auto text-[11px] font-normal text-slate-400">Last run: {lastRun}</span>}
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {Object.entries(KEY_LABELS).map(([key, label]) => {
            const r = results[key] || { status: 'pending', detail: '…' };
            const meta = STATUS_META[r.status as Exclude<Status, 'pending'>] || {
              label: '…', cls: 'bg-slate-100 text-slate-500 ring-slate-400/30', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
            };
            return (
              <li key={key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className={cn('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', meta.cls)}>
                  {meta.icon} {meta.label}
                  {r.ms !== undefined && <span className="opacity-70">· {r.ms}ms</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500">{r.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Connection Monitor */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Wifi className="h-4 w-4 text-brand-600" /> Connection Monitor
        </h2>

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              {pingStats.uptime >= 90 ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : pingStats.uptime > 0 ? (
                <Wifi className="h-4 w-4 text-amber-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-slate-400" />
              )}
              <p className="text-[11px] font-medium text-slate-500">Status</p>
            </div>
            <p className={cn(
              'mt-2 text-lg font-bold',
              pingStats.uptime >= 90 ? 'text-emerald-600' :
              pingStats.uptime > 0 ? 'text-amber-600' : 'text-slate-400'
            )}>
              {pingStats.total === 0 ? 'N/A' : pingStats.uptime >= 90 ? 'Healthy' : pingStats.uptime > 0 ? 'Degraded' : 'Down'}
            </p>
          </div>
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <p className="text-[11px] font-medium text-slate-500">Uptime</p>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-800">
              {pingStats.total === 0 ? '—' : `${pingStats.uptime}%`}
            </p>
          </div>
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-violet-500" />
              <p className="text-[11px] font-medium text-slate-500">Avg Response</p>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-800">
              {pingStats.total === 0 ? '—' : `${pingStats.avgResponse}ms`}
            </p>
          </div>
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-teal-500" />
              <p className="text-[11px] font-medium text-slate-500">Last Ping</p>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-800">
              {pingStats.total === 0 ? '—' : `${pingStats.lastMs}ms`}
            </p>
          </div>
        </div>

        {/* Ping History Chart */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Activity className="h-4 w-4 text-brand-600" /> Connection History
            </h3>
            <div className="flex items-center gap-2">
              <select
                className="rounded border border-slate-200 px-2 py-1 text-xs"
                value={pingInterval}
                onChange={(e) => setPingInterval(Number(e.target.value))}
              >
                <option value={1000}>1s</option>
                <option value={3000}>3s</option>
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
                <option value={30000}>30s</option>
              </select>
              <button
                className={cn('btn btn-sm', autoPing ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setAutoPing(!autoPing)}
              >
                {autoPing ? 'Stop' : 'Start'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={doPing}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            {pingHistory.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">No ping data yet. Click Start to begin monitoring.</p>
            ) : (
              <div className="relative h-32 w-full">
                <div className="absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="border-t border-slate-100" />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-end gap-0.5">
                  {pingHistory.map((entry, i) => {
                    const maxMs = Math.max(...pingHistory.map((p) => p.ms), 100);
                    const height = Math.max((entry.ms / maxMs) * 100, 5);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 rounded-t transition-all',
                          entry.status === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'
                        )}
                        style={{ height: `${height}%` }}
                        title={`${entry.ms}ms`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Core Web Vitals */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Gauge className="h-4 w-4 text-brand-600" /> Core Web Vitals
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <div className="text-center">
              <p className={cn(
                'text-xl font-bold',
                webVitals.lcp === null ? 'text-slate-300' :
                webVitals.lcp <= 2500 ? 'text-emerald-600' :
                webVitals.lcp <= 4000 ? 'text-amber-600' : 'text-rose-600'
              )}>
                {webVitals.lcp === null ? '—' : `${webVitals.lcp}ms`}
              </p>
              <p className="text-[11px] text-slate-500">LCP</p>
            </div>
            <div className="text-center">
              <p className={cn(
                'text-xl font-bold',
                webVitals.fid === null ? 'text-slate-300' :
                webVitals.fid <= 100 ? 'text-emerald-600' :
                webVitals.fid <= 300 ? 'text-amber-600' : 'text-rose-600'
              )}>
                {webVitals.fid === null ? '—' : `${webVitals.fid}ms`}
              </p>
              <p className="text-[11px] text-slate-500">FID</p>
            </div>
            <div className="text-center">
              <p className={cn(
                'text-xl font-bold',
                webVitals.cls === null ? 'text-slate-300' :
                webVitals.cls <= 0.1 ? 'text-emerald-600' :
                webVitals.cls <= 0.25 ? 'text-amber-600' : 'text-rose-600'
              )}>
                {webVitals.cls === null ? '—' : webVitals.cls.toFixed(3)}
              </p>
              <p className="text-[11px] text-slate-500">CLS</p>
            </div>
            <div className="text-center">
              <p className={cn(
                'text-xl font-bold',
                webVitals.ttfb === null ? 'text-slate-300' :
                webVitals.ttfb <= 800 ? 'text-emerald-600' :
                webVitals.ttfb <= 1800 ? 'text-amber-600' : 'text-rose-600'
              )}>
                {webVitals.ttfb === null ? '—' : `${webVitals.ttfb}ms`}
              </p>
              <p className="text-[11px] text-slate-500">TTFB</p>
            </div>
          </div>
        </div>

        {/* Ping Log */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Clock className="h-4 w-4 text-brand-600" /> Ping Log
            </h3>
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setPingLog([])}>
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto p-2">
            {pingLog.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No log entries</p>
            ) : (
              <div className="space-y-1">
                {pingLog.map((entry, i) => (
                  <p key={i} className={cn(
                    'rounded px-2 py-1 text-[11px] font-mono',
                    entry.includes('FAIL') ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
                  )}>
                    {entry}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Overview Dashboard */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Database className="h-4 w-4 text-brand-600" /> Data Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <DataCard icon={<Users className="h-4 w-4" />} label="Users" value={dataCounts.users} color="blue" />
          <DataCard icon={<Package className="h-4 w-4" />} label="MKT SKUs" value={dataCounts.skus} color="emerald" />
          <DataCard icon={<Package className="h-4 w-4" />} label="CS SKUs" value={dataCounts.csSkus} color="teal" />
          <DataCard icon={<Receipt className="h-4 w-4" />} label="Tickets" value={dataCounts.tickets} color="violet" />
          <DataCard icon={<ArrowRightLeft className="h-4 w-4" />} label="MKT Txns" value={dataCounts.transactions} color="amber" />
          <DataCard icon={<ArrowRightLeft className="h-4 w-4" />} label="CS Txns" value={dataCounts.csTransactions} color="orange" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DataCard icon={<Boxes className="h-4 w-4" />} label="MKT Total Stock" value={fmt(dataCounts.totalStock)} color="emerald" />
          <DataCard icon={<Boxes className="h-4 w-4" />} label="CS Total Stock" value={fmt(dataCounts.totalCsStock)} color="teal" />
          <DataCard icon={<AlertTriangle className="h-4 w-4" />} label="Low Stock Items" value={dataCounts.lowStockItems} color={dataCounts.lowStockItems > 0 ? 'rose' : 'slate'} />
          <DataCard icon={<Settings className="h-4 w-4" />} label="Categories" value={dataCounts.categories} color="indigo" />
        </div>
      </div>

      {/* User Role Breakdown */}
      {Object.keys(userRoleCounts).length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Users className="h-4 w-4 text-brand-600" /> Users by Role
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(userRoleCounts).map(([role, count]) => (
              <div key={role} className="card card-pad text-center">
                <p className="text-lg font-bold text-slate-800">{count}</p>
                <p className="text-[11px] text-slate-500">{ROLE_LABELS[role] || role}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Tickets */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4 text-brand-600" /> Recent Tickets
          </h2>
          <div className="card overflow-hidden">
            {recentTickets.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500">No tickets found</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentTickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                      t.status === 'pending' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' :
                      t.status === 'finalized' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' :
                      t.status === 'rejected' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' :
                      'bg-sky-50 text-sky-700 ring-sky-600/20'
                    )}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-700">{t.createdByName}</p>
                      <p className="text-[10px] text-slate-400">{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</p>
                    </div>
                    <span className="text-[10px] text-slate-400">{TYPE_LABELS[t.type]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <TrendingUp className="h-4 w-4 text-brand-600" /> Recent Transactions
          </h2>
          <div className="card overflow-hidden">
            {recentTransactions.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500">No transactions found</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentTransactions.map((tx, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                      tx.type === 'addition' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' :
                      'bg-rose-50 text-rose-700 ring-rose-600/20'
                    )}>
                      {tx.type === 'addition' ? 'IN' : 'OUT'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-700">{tx.skuName || tx.skuId || '—'}</p>
                      <p className="text-[10px] text-slate-400">{tx.actionAt ? new Date(tx.actionAt).toLocaleString() : '—'}</p>
                    </div>
                    <span className={cn(
                      'text-xs font-bold',
                      tx.type === 'addition' ? 'text-emerald-600' : 'text-rose-600'
                    )}>
                      {tx.type === 'addition' ? '+' : '−'}{tx.qty}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* System Configuration */}
      {Object.keys(config).length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Settings className="h-4 w-4 text-brand-600" /> System Configuration
          </h2>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {Object.entries(config).map(([key, value]) => (
                <li key={key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-600">{key}</span>
                  <span className="text-xs text-slate-800">{value || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="card card-pad max-w-3xl space-y-2 text-xs leading-relaxed text-slate-500">
        <p className="flex items-center gap-1.5 font-semibold text-slate-700"><ShieldCheck className="h-3.5 w-3.5" /> What to look at</p>
        <p>• <b>LIVE mode</b> = this build contains your Supabase keys; all data operations go to the database.</p>
        <p>• <b>DEMO mode</b> = offline preview. Edits stay in the browser memory and are lost on refresh — this is what you are experiencing.</p>
        <p>• If <b>db reads</b> return 0 rows while signed in, check the RLS read policies ran (migration 0001) and that you are actually authenticated.</p>
        <p>• If the <b>write test</b> fails, re-run migrations 0002 (functions) and confirm the RPC exists.</p>
        <p>• For photo upload issues, confirm migration <b>0005</b> created the <code>sku-images</code> bucket.</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="card card-pad">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('mt-1 inline-block rounded-full px-2.5 py-1 text-sm font-bold', tones[tone])}>{value}</p>
    </div>
  );
}

function DataCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: 'blue' | 'emerald' | 'teal' | 'violet' | 'amber' | 'orange' | 'rose' | 'slate' | 'indigo' }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    teal: 'bg-teal-50 text-teal-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  const iconColors: Record<string, string> = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    teal: 'text-teal-500',
    violet: 'text-violet-500',
    amber: 'text-amber-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
    slate: 'text-slate-400',
    indigo: 'text-indigo-500',
  };
  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-lg p-1.5', colors[color], iconColors[color])}>
          {icon}
        </span>
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
      </div>
      <p className={cn('mt-2 text-xl font-bold', colors[color].split(' ')[1])}>{value}</p>
    </div>
  );
}