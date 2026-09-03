import { useMemo, useState } from 'react';
import { Boxes, AlertTriangle, ArrowDownCircle, RotateCcw, CalendarClock, Package, Archive } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { StatCard, Spinner, ErrorBanner, EmptyState, Segmented } from '@/components/ui/primitives';
import { OutBadge, LowBadge, CsOnlyBadge, MktOnlyBadge } from '@/components/StatusBadge';
import { fmt, money, safeImageUrl } from '@/lib/utils';
import { getStockMovement, activeBorrows, overdueBorrows } from '@/lib/stockMovement';
import type { SKU, StockTransaction } from '@/lib/types';
import { SkuDetailModal } from '@/components/SkuDetailModal';

type Scope = 'all' | 'mkt' | 'cs';
interface RowItem { sku: SKU; wh: 'mkt' | 'cs'; tx: StockTransaction[] }

export function DashboardPage() {
  const { user } = useAuth();
  const { skus, csSkus, tickets, transactions, csTransactions, loading, error, refresh } = useData();
  const [scope, setScope] = useState<Scope>(user?.role === 'customer_service' ? 'cs' : 'all');
  const [detail, setDetail] = useState<{ sku: SKU; wh: 'mkt' | 'cs' } | null>(null);
  const canToggle = ['admin', 'director', 'customer_service'].includes(user?.role || '');

  const visible = useMemo<RowItem[]>(() => {
    if (scope === 'mkt') return skus.map((s) => ({ sku: s, wh: 'mkt' as const, tx: transactions }));
    if (scope === 'cs') return csSkus.map((s) => ({ sku: s, wh: 'cs' as const, tx: csTransactions }));
    const rows: RowItem[] = skus.map((s) => ({ sku: s, wh: 'mkt', tx: transactions }));
    const seen = new Set(skus.map((s) => s.id));
    for (const s of csSkus) {
      const match = rows.find((r) => r.sku.id === s.id || r.sku.name.toLowerCase() === s.name.toLowerCase());
      if (match) {
        match.sku = { ...match.sku, currentStock: match.sku.currentStock + s.currentStock, totalInflow: match.sku.totalInflow + s.totalInflow };
        seen.add(match.sku.id);
      } else if (!seen.has(s.id)) {
        rows.push({ sku: s, wh: 'cs', tx: csTransactions });
        seen.add(s.id);
      }
    }
    return rows;
  }, [scope, skus, csSkus, transactions, csTransactions]);

  const stats = useMemo(() => {
    const low = visible.filter((r) => r.sku.currentStock <= r.sku.lowStockThreshold);
    const totalOut = [...transactions, ...csTransactions].filter((t) => t.type === 'deduction').reduce((a, t) => a + Number(t.qty || 0), 0);
    const borrows = activeBorrows(tickets);
    // Total unique SKUs (deduplicated by ID)
    const uniqueIds = new Set<string>();
    skus.forEach((s) => uniqueIds.add(s.id));
    csSkus.forEach((s) => uniqueIds.add(s.id));
    return {
      totalSkus: uniqueIds.size,
      low: low.length,
      totalOut,
      borrows: borrows.length,
      overdue: overdueBorrows(tickets).length,
    };
  }, [visible, transactions, csTransactions, tickets, skus, csSkus]);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  const isStaff = user?.role === 'staff';
  const scopeOptions: { value: Scope; label: string }[] = [
    ...(user?.role !== 'customer_service' ? [{ value: 'all' as const, label: 'All' }] : []),
    { value: 'mkt', label: user?.role === 'customer_service' ? 'MKT Warehouse' : 'MKT' },
    { value: 'cs', label: user?.role === 'customer_service' ? 'CS Warehouse' : 'CS' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Stock movement &amp; value · Easy Gold MIMS 2026</p>
        </div>
        {canToggle && <Segmented value={scope} onChange={setScope} options={scopeOptions} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Items" value={fmt(stats.totalSkus)} sub="across both warehouses" icon={<Boxes className="h-5 w-5" />} tone="blue" />
        <StatCard label="Low Stock" value={stats.low} sub="at or below threshold" icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
        <StatCard label="Total Deductions" value={fmt(stats.totalOut)} sub="all-time stock out" icon={<ArrowDownCircle className="h-5 w-5" />} tone="cyan" />
        <StatCard label="Active Borrows" value={stats.borrows} sub="awaiting return" icon={<RotateCcw className="h-5 w-5" />} tone="violet" />
        <StatCard label="Overdue Returns" value={stats.overdue} sub={stats.overdue ? 'PAST return date' : 'none'} icon={<CalendarClock className="h-5 w-5" />} tone={stats.overdue ? 'rose' : 'emerald'} />
      </div>

      <div className="card card-pad">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Stock Movement &amp; Value</h2>
          <span className="text-xs text-slate-400">
            {scope === 'cs' ? 'CS Warehouse' : scope === 'mkt' ? 'MKT Warehouse' : 'All Warehouses (MKT + CS)'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="table-head pb-2 pr-2">Image</th>
                <th className="table-head pb-2 pr-2">Name</th>
                <th className="table-head pb-2 pr-2">Category</th>
                <th className="table-head pb-2 pr-2 text-right">Opening</th>
                <th className="table-head pb-2 pr-2 text-right">Stock In</th>
                <th className="table-head pb-2 pr-2 text-right">Stock Out</th>
                <th className="table-head pb-2 pr-2 text-right">Current</th>
                <th className="table-head pb-2 pr-2 text-right">Cost/Unit</th>
                <th className="table-head pb-2 pr-2 text-right">Total Value</th>
                <th className="table-head pb-2 text-right">Usage %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 && (
                <tr><td colSpan={10}><EmptyState icon={<Archive className="h-6 w-6" />} title="No stock in this view" /></td></tr>
              )}
              {visible.map(({ sku, wh }) => {
                const mv = getStockMovement(sku, wh === 'cs' ? csTransactions : transactions);
                const out = sku.currentStock <= 0;
                const low = sku.currentStock <= sku.lowStockThreshold;
                return (
                  <tr
                    key={sku.id + ':' + wh}
                    className={isStaff ? '' : 'cursor-pointer transition hover:bg-brand-50/50'}
                    onClick={() => { if (!isStaff) setDetail({ sku, wh }); }}
                  >
                    <td className="py-2.5 pr-2">
                      {sku.imageUrl
                        ? <img src={safeImageUrl(sku.imageUrl)} alt="" className="h-8 w-8 rounded-lg object-cover" loading="lazy" />
                        : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package className="h-4 w-4" /></span>}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-800">{sku.name}</span>
                        {out && <OutBadge />}
                        {!out && low && <LowBadge />}
                        {scope === 'all' && wh === 'cs' && <CsOnlyBadge />}
                        {scope === 'all' && wh === 'mkt' && !csSkus.some((c) => c.id === sku.id) && <MktOnlyBadge />}
                      </div>
                    </td>
                    <td className="py-2.5 pr-2 text-slate-500">{sku.category || '—'}</td>
                    <td className="py-2.5 pr-2 text-right text-slate-600">{fmt(sku.openingBalance)} {sku.unit}</td>
                    <td className="py-2.5 pr-2 text-right font-medium text-emerald-600">{mv.stockIn > 0 ? `+${fmt(mv.stockIn)}` : '—'}</td>
                    <td className="py-2.5 pr-2 text-right font-medium text-rose-500">{mv.stockOut > 0 ? `-${fmt(mv.stockOut)}` : '—'}</td>
                    <td className="py-2.5 pr-2 text-right font-semibold text-slate-800">{fmt(sku.currentStock)} {sku.unit}</td>
                    <td className="py-2.5 pr-2 text-right text-slate-500">{money(sku.costPerUnit)}</td>
                    <td className="py-2.5 pr-2 text-right font-semibold text-brand-700">{money(sku.currentStock * sku.costPerUnit)}</td>
                    <td className="py-2.5 text-right text-slate-600">{mv.usagePct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <SkuDetailModal sku={detail.sku} warehouse={detail.wh} onClose={() => setDetail(null)} />}
    </div>
  );
}