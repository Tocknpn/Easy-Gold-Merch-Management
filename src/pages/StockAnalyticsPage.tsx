// ── Stock Analytics — visual dashboard for Warehouse Manager + Admin ─────
// Stock-out ranked by SKU · value vs prior period · current-stock value pie ·
// stock-remain value (LAK) · %usage by department. Pure client-side
// recompute over data DataContext already holds — no new queries.
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ArrowDownToLine, PieChart as PieIcon, Boxes, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, EmptyState, StatCard } from '@/components/ui/primitives';
import { fmt, money, cn, todayStr, NAMED_COLORS } from '@/lib/utils';
import { reportableTransactions } from '@/lib/stockMovement';
import {
  topStockOutBySku, stockOutValueComparison, stockOutValueByDept, stockRemainAsOf,
} from '@/lib/stockAnalytics';
import type { SKU, CS_SKU, StockTransaction } from '@/lib/types';

type Wh = 'mkt' | 'cs' | 'all';

/** Caps a sorted-desc value list to topN rows + one aggregated "Other" row. */
function capWithOther<T extends { value: number }>(rows: T[], topN: number, label: (r: T) => string) {
  if (rows.length <= topN) return rows.map((r) => ({ name: label(r), value: r.value }));
  const head = rows.slice(0, topN).map((r) => ({ name: label(r), value: r.value }));
  const other = rows.slice(topN).reduce((a, r) => a + r.value, 0);
  return [...head, { name: 'Other', value: other }];
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

export function StockAnalyticsPage() {
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const { skus, csSkus, transactions, csTransactions, tickets, loading, error, refresh } = useData();

  const [wh, setWh] = useState<Wh>(isWarehouse ? 'mkt' : 'all');
  const [from, setFrom] = useState(() => `${todayStr().slice(0, 7)}-01`);
  const [to, setTo] = useState(() => todayStr());

  const merged = useMemo(() => {
    if (wh === 'mkt') return { list: skus as (SKU | CS_SKU)[], tx: reportableTransactions(transactions as StockTransaction[], tickets), label: 'MKT Warehouse' };
    if (wh === 'cs') return { list: csSkus, tx: reportableTransactions(csTransactions as StockTransaction[], tickets), label: 'CS Warehouse' };
    const map = new Map<string, SKU | CS_SKU>();
    for (const s of [...skus, ...csSkus]) if (!map.has(s.id)) map.set(s.id, s);
    return {
      list: [...map.values()],
      tx: reportableTransactions([...transactions, ...csTransactions] as StockTransaction[], tickets),
      label: 'MKT and CS',
    };
  }, [wh, skus, csSkus, transactions, csTransactions, tickets]);

  const topOut = useMemo(
    () => topStockOutBySku({ skus: merged.list, transactions: merged.tx, tickets, from, to, topN: 20 }),
    [merged, tickets, from, to],
  );
  const outCmp = useMemo(
    () => stockOutValueComparison({ skus: merged.list, transactions: merged.tx, tickets, from, to }),
    [merged, tickets, from, to],
  );
  const deptUsage = useMemo(
    () => stockOutValueByDept({ skus: merged.list, transactions: merged.tx, tickets, from, to }),
    [merged, tickets, from, to],
  );
  const remain = useMemo(
    () => stockRemainAsOf({ skus: merged.list, transactions: merged.tx, tickets, asOf: to }),
    [merged, tickets, to],
  );

  if (loading) return <Spinner label="Loading stock analytics…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  const skuPieData = capWithOther(remain.bySku, 8, (r) => r.skuName);
  const deptPieData = capWithOther(deptUsage, 6, (r) => r.department);

  const deltaUp = outCmp.deltaValue >= 0;
  const pctLabel = outCmp.pctChange == null ? '—' : `${outCmp.pctChange >= 0 ? '+' : ''}${outCmp.pctChange.toFixed(2)}%`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Stock Analytics</h1>
        <p className="mt-0.5 text-xs text-slate-400">Reflects {merged.label}.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {!isWarehouse && (
          <div>
            <label className="label">Part</label>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['all', 'mkt', 'cs'] as Wh[]).map((w) => (
                <button key={w} onClick={() => setWh(w)}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition',
                    wh === w ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600')}>
                  {w === 'all' ? 'All' : w === 'mkt' ? 'MKT' : 'CS'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label">Date from</label>
          <input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Date to</label>
          <input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <StatCard
        label={`Stock Remain @ ${to}`}
        value={money(remain.totalValue)}
        sub={`${fmt(remain.skuCount)} SKUs · ${fmt(remain.unitCount)} units`}
        icon={<Boxes className="h-4.5 w-4.5" />}
        tone="blue"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Stock Out" icon={<ArrowDownToLine className="h-4 w-4 text-amber-600" />}>
          <p className={cn('mb-3 text-sm font-semibold', deltaUp ? 'text-amber-600' : 'text-emerald-600')}>
            {pctLabel} vs {outCmp.priorFrom} – {outCmp.priorTo} ({money(outCmp.deltaValue)})
          </p>
          {topOut.length === 0 ? (
            <EmptyState icon={<ArrowDownToLine className="h-6 w-6" />} title="No stock-out in this range" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(320, topOut.length * 28)}>
              <BarChart data={topOut} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="skuName" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(v)} labelStyle={{ fontWeight: 600 }} />
                <Bar dataKey="qty" fill="#0c53ac" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Current Stock vs SKU Name" icon={<PieIcon className="h-4 w-4 text-brand-600" />}>
          {remain.bySku.length === 0 ? (
            <EmptyState icon={<PieIcon className="h-6 w-6" />} title="No stock on hand" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={skuPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    label={(d: any) => `${d.name} ${d.percent ? (d.percent * 100).toFixed(1) : '0'}%`}>
                    {skuPieData.map((_, i) => (
                      <Cell key={i} fill={NAMED_COLORS[i % NAMED_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {remain.bySku.map((r) => (
                      <tr key={r.skuId} className="odd:bg-white even:bg-slate-50/50">
                        <td className="px-2 py-1 font-medium text-slate-700">{r.skuName}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmt(r.qty)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">{money(r.value)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-400">{r.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Usage by Dept (% value)" icon={<Building2 className="h-4 w-4 text-violet-600" />}>
        {deptUsage.length === 0 ? (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title="No stock-out in this range" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ul className="space-y-2">
              {deptUsage.map((r, i) => (
                <li key={r.department} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NAMED_COLORS[i % NAMED_COLORS.length] }} />
                    {r.department}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-slate-500">
                    {money(r.value)} <span className="font-semibold text-slate-700">{r.pct.toFixed(1)}%</span>
                  </span>
                </li>
              ))}
            </ul>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={deptPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {deptPieData.map((_, i) => (
                    <Cell key={i} fill={NAMED_COLORS[i % NAMED_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}
