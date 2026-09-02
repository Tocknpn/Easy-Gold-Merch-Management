import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ShieldCheck, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, HeartPulse, Info, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useData } from '@/contexts/DataContext';
import { demoDB } from '@/lib/demoStore';
import { Spinner, ErrorBanner } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'warn' | 'fail' | 'na' | 'pending';
interface CheckResult { status: Status; detail: string; ms?: number }

const DEFAULT: Record<string, CheckResult> = {
  env: { status: 'pending', detail: 'Waiting…' },
  ping: { status: 'pending', detail: 'Waiting…' },
  auth: { status: 'pending', detail: 'Waiting…' },
  db_skus: { status: 'pending', detail: 'Waiting…' },
  db_tickets: { status: 'pending', detail: 'Waiting…' },
  storage: { status: 'pending', detail: 'Waiting…' },
  write: { status: 'pending', detail: 'Waiting…' },
};

const KEY_LABELS: Record<string, string> = {
  env: 'App environment (build keys)',
  ping: 'Supabase API ping (auth/v1/health)',
  auth: 'Auth session',
  db_skus: 'Database read — skus',
  db_tickets: 'Database read — tickets',
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
  const { loading, error, refresh } = useData();
  const [results, setResults] = useState<Record<string, CheckResult>>(DEFAULT);
  const [running, setRunning] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
  const keyMask = anonKey ? `${anonKey.slice(0, 8)}…${anonKey.slice(-4)} (${anonKey.length} chars)` : '(empty)';

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

    // 1) env keys present in this build?
    if (!configured) {
      mark('env', { status: 'fail', detail: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are NOT in this build → the app is running in DEMO mode. Edits are in-memory and reset on refresh.' });
    } else {
      mark('env', { status: 'ok', detail: `URL: ${baseUrl.replace(/^https:\/\//, '').split('.')[0]}.supabase.co · anon key: ${keyMask}` });
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
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/health`, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!j?.is_healthy) throw new Error('reported not healthy');
        return j;
      },
      () => 'Supabase reachable (auth service healthy)',
      (e) => `Cannot reach Supabase API: ${e?.message || e}`,
    );

    // 3) auth session
    if (user) {
      mark('auth', { status: 'ok', detail: `Signed in as ${user.email} (${user.role})` });
    } else {
      const { data } = await sb.auth.getUser();
      if (data?.user?.email) mark('auth', { status: 'ok', detail: `Signed in as ${data.user.email}` });
      else mark('auth', { status: 'warn', detail: 'Not signed in → RLS read policies (authenticated) will return EMPTY rows. Log in first.' });
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

    // 5) storage bucket
    await watch(
      'storage',
      async () => {
        const { data, error } = await sb.storage.getBucket('sku-images');
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
  }, [configured, baseUrl, keyMask, user]);

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
            <p className="font-bold">⚠️ This build is running in DEMO mode — your edits are NOT saved.</p>
            <p className="mt-1">
              The deployed bundle has no <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>.
              Two ways to fix:<br />
              1️⃣ <b>Easiest / guaranteed</b> — locally run <code>npm run env:production</code> (generates <code>.env.production</code> with your public keys),
              then <code>git add .env.production && git push</code>. Cloudflare rebuilds → LIVE.<br />
              2️⃣ Cloudflare Pages → <b>Settings → Environment variables</b> → add both as <b>Plaintext</b> + <b>Production</b> →
              <b> Save</b> → <b>Deployments → Create deployment</b> (a fresh build, not just a retry).
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