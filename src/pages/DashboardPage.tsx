import { useMemo, useState } from 'react';
import { Boxes, AlertTriangle, ArrowDownCircle, RotateCcw, CalendarClock, Package, Archive, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { StatCard, Spinner, ErrorBanner, EmptyState, Segmented } from '@/components/ui/primitives';
import { OutBadge, LowBadge, CsOnlyBadge, MktOnlyBadge } from '@/components/StatusBadge';
import { cn, fmt, money, safeImageUrl } from '@/lib/utils';
import { getStockMovement, activeBorrows, overdueBorrows, reportableTransactions } from '@/lib/stockMovement';
import type { SKU, StockTransaction } from '@/lib/types';
import { SkuDetailModal } from '@/components/SkuDetailModal';

type Scope = 'all' | 'mkt' | 'cs';
interface RowItem { sku: SKU; wh: 'mkt' | 'cs'; tx: StockTransaction[] }

type SortField =
  | 'name'
  | 'category'
  | 'opening'
  | 'stockIn'
  | 'stockOut'
  | 'current'
  | 'costPerUnit'
  | 'totalValue'
  | 'usagePct';

type SortDir = 'asc' | 'desc';

export function DashboardPage() {
  const { user } = useAuth();
  const { skus, csSkus, tickets, transactions, csTransactions, loading, error, refresh } = useData();
  const [scope, setScope] = useState<Scope>(
    user?.role === 'customer_service' ? 'cs' : (['warehouse', 'line_manager'].includes(user?.role || '') ? 'mkt' : 'all'),
  );
  const [detail, setDetail] = useState<{ sku: SKU; wh: 'mkt' | 'cs' } | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const canToggle = ['admin', 'director', 'customer_service', 'warehouse', 'line_manager'].includes(user?.role || '');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      const defaultDesc = ['opening', 'stockIn', 'stockOut', 'current', 'costPerUnit', 'totalValue', 'usagePct'].includes(field);
      setSortDir(defaultDesc ? 'desc' : 'asc');
    }
  };

  // Reporting view of both ledgers: cancelled bookings and reject/recall
  // reversals never show as Stock In / Stock Out (see migration 0013).
  const mktTx = useMemo(() => reportableTransactions(transactions, tickets), [transactions, tickets]);
  const csTx = useMemo(() => reportableTransactions(csTransactions, tickets), [csTransactions, tickets]);

  const visible = useMemo<RowItem[]>(() => {
    if (scope === 'mkt') return skus.map((s) => ({ sku: s, wh: 'mkt' as const, tx: mktTx }));
    if (scope === 'cs') return csSkus.map((s) => ({ sku: s, wh: 'cs' as const, tx: csTx }));
    const rows: RowItem[] = skus.map((s) => ({ sku: s, wh: 'mkt', tx: mktTx }));
    const seen = new Set(skus.map((s) => s.id));
    for (const s of csSkus) {
      const match = rows.find((r) => r.sku.id === s.id || r.sku.name.toLowerCase() === s.name.toLowerCase());
      if (match) {
        match.sku = { ...match.sku, currentStock: match.sku.currentStock + s.currentStock, totalInflow: match.sku.totalInflow + s.totalInflow };
        seen.add(match.sku.id);
      } else if (!seen.has(s.id)) {
        rows.push({ sku: s, wh: 'cs', tx: csTx });
        seen.add(s.id);
      }
    }
    return rows;
  }, [scope, skus, csSkus, mktTx, csTx]);

  const sortedVisible = useMemo(() => {
    const list = visible.map((item) => {
      const mv = getStockMovement(item.sku, item.tx);
      const totalValue = item.sku.currentStock * item.sku.costPerUnit;
      return {
        ...item,
        mv,
        totalValue,
      };
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.sku.name.localeCompare(b.sku.name, 'la');
          break;
        case 'category':
          cmp = (a.sku.category || '').localeCompare(b.sku.category || '', 'la');
          break;
        case 'opening':
          cmp = (a.sku.openingBalance || 0) - (b.sku.openingBalance || 0);
          break;
        case 'stockIn':
          cmp = (a.mv.stockIn || 0) - (b.mv.stockIn || 0);
          break;
        case 'stockOut':
          cmp = (a.mv.stockOut || 0) - (b.mv.stockOut || 0);
          break;
        case 'current':
          cmp = (a.sku.currentStock || 0) - (b.sku.currentStock || 0);
          break;
        case 'costPerUnit':
          cmp = (a.sku.costPerUnit || 0) - (b.sku.costPerUnit || 0);
          break;
        case 'totalValue':
          cmp = a.totalValue - b.totalValue;
          break;
        case 'usagePct':
          cmp = (a.mv.usagePct || 0) - (b.mv.usagePct || 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [visible, sortField, sortDir]);

  const stats = useMemo(() => {
    const low = visible.filter((r) => r.sku.currentStock <= r.sku.lowStockThreshold);
    const totalOut = [...mktTx, ...csTx].filter((t) => t.type === 'deduction').reduce((a, t) => a + Number(t.qty || 0), 0);
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
  }, [visible, mktTx, csTx, tickets, skus, csSkus]);

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Stock Movement &amp; Value</h2>
            <span className="text-xs text-slate-400">
              {scope === 'cs' ? 'CS Warehouse' : scope === 'mkt' ? 'MKT Warehouse' : 'All Warehouses (MKT + CS)'}
            </span>
          </div>

          {/* Sort option dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 hidden sm:inline">Sort:</span>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                className="input h-8 rounded-lg pl-7 pr-8 text-xs font-medium"
                value={`${sortField}-${sortDir}`}
                onChange={(e) => {
                  const [f, d] = e.target.value.split('-') as [SortField, SortDir];
                  setSortField(f);
                  setSortDir(d);
                }}
              >
                <option value="name-asc">Name (A – Z)</option>
                <option value="name-desc">Name (Z – A)</option>
                <option value="category-asc">Category (A – Z)</option>
                <option value="category-desc">Category (Z – A)</option>
                <option value="opening-desc">Opening (Highest)</option>
                <option value="opening-asc">Opening (Lowest)</option>
                <option value="stockIn-desc">Stock In (Highest)</option>
                <option value="stockIn-asc">Stock In (Lowest)</option>
                <option value="stockOut-desc">Stock Out (Highest)</option>
                <option value="stockOut-asc">Stock Out (Lowest)</option>
                <option value="current-desc">Current (Highest)</option>
                <option value="current-asc">Current (Lowest)</option>
                <option value="costPerUnit-desc">Cost/Unit (Highest)</option>
                <option value="costPerUnit-asc">Cost/Unit (Lowest)</option>
                <option value="totalValue-desc">Total Value (Highest)</option>
                <option value="totalValue-asc">Total Value (Lowest)</option>
                <option value="usagePct-desc">Usage % (Highest)</option>
                <option value="usagePct-asc">Usage % (Lowest)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="table-head pb-2 pr-2">Image</th>
                <SortTh field="name" label="Name" currentField={sortField} currentDir={sortDir} onSort={toggleSort} />
                <SortTh field="category" label="Category" currentField={sortField} currentDir={sortDir} onSort={toggleSort} />
                <SortTh field="opening" label="Opening" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="stockIn" label="Stock In" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="stockOut" label="Stock Out" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="current" label="Current" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="costPerUnit" label="Cost/Unit" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="totalValue" label="Total Value" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh field="usagePct" label="Usage %" currentField={sortField} currentDir={sortDir} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedVisible.length === 0 && (
                <tr><td colSpan={10}><EmptyState icon={<Archive className="h-6 w-6" />} title="No stock in this view" /></td></tr>
              )}
              {sortedVisible.map(({ sku, wh, mv, totalValue }) => {
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
                    <td className="py-2.5 pr-2 text-right font-semibold text-brand-700">{money(totalValue)}</td>
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

function SortTh({
  field,
  label,
  currentField,
  currentDir,
  onSort,
  align = 'left',
}: {
  field: SortField;
  label: string;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const active = currentField === field;
  return (
    <th
      className={cn(
        'table-head pb-2 pr-2 select-none cursor-pointer transition hover:text-brand-700',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-brand-700 font-bold',
      )}
      onClick={() => onSort(field)}
      title={`Click to sort by ${label} (${active && currentDir === 'asc' ? 'descending' : 'ascending'})`}
    >
      <div className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        <span>{label}</span>
        {active ? (
          currentDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-25 hover:opacity-75" />
        )}
      </div>
    </th>
  );
}