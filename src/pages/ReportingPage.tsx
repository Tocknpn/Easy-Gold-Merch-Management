// ── Reporting — unified Inventory + Month End workspace (6 tabs, shared filters) ─
// Tabs: Month End Report · Item Stock Out · Stock In Details · Stock Remain ·
//       Borrow Item · Stock Balance.
// Shared filter bar: Date from→to · Part (MKT/CS/All) · Merch Type (category) ·
//       VAT (visible only on Month End tab).
// Export Excel → 6 sheets in one .xlsx. Print PDF → only Month End tab (screen match).
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  CalendarRange, ChevronDown, ChevronUp, ChevronsUpDown,
  Download, FileText, FileBarChart, ArrowDownToLine, ArrowUpFromLine,
  Boxes, Repeat, Scale,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, EmptyState, toast } from '@/components/ui/primitives';
import { fmt, money, cn } from '@/lib/utils';
import { getStockMovement } from '@/lib/stockMovement';
import type { SKU, CS_SKU, StockTransaction } from '@/lib/types';

type TabKey = 'month-end' | 'stock-out' | 'stock-in' | 'stock-remain' | 'borrow' | 'balance';
type Wh = 'mkt' | 'cs' | 'all';
type Tone = 'slate' | 'amber' | 'emerald' | 'brand';

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-700', amber: 'bg-amber-600', emerald: 'bg-emerald-600', brand: 'bg-brand-700',
};
const MULT = (vat: boolean, n: number) => (vat ? n * 1.1 : n);
const cellCls = 'border border-slate-200 px-3 py-1.5';

const TAB_DEFS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'month-end', label: 'Month End Report', icon: <CalendarRange className="h-4 w-4" /> },
  { key: 'stock-out', label: 'Item Stock Out', icon: <ArrowDownToLine className="h-4 w-4" /> },
  { key: 'stock-in', label: 'Stock In Details', icon: <ArrowUpFromLine className="h-4 w-4" /> },
  { key: 'stock-remain', label: 'Stock Remain', icon: <Boxes className="h-4 w-4" /> },
  { key: 'borrow', label: 'Borrow Item', icon: <Repeat className="h-4 w-4" /> },
  { key: 'balance', label: 'Stock Balance', icon: <Scale className="h-4 w-4" /> },
];

function Panel({ title, tone, children }: { title: string; tone: Tone; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white ${TONES[tone]}`}>{title}</header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function ReportingPage() {
  const { user } = useAuth();
  const { skus, csSkus, transactions, csTransactions, tickets, loading, error, refresh } = useData();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'month-end';
  const setTab = (k: TabKey) => {
    const p = new URLSearchParams(params);
    p.set('tab', k);
    setParams(p, { replace: true });
  };

  // shared filters
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date(); d.setDate(0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [wh, setWh] = useState<Wh>('all');
  const [cat, setCat] = useState('All');
  const [vat, setVat] = useState(false);
  const [bSort, setBSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

const merged = useMemo(() => {
    if (wh === 'mkt') return { list: skus as (SKU | CS_SKU)[], tx: transactions as StockTransaction[], label: 'MKT Warehouse' };
    if (wh === 'cs') return { list: csSkus, tx: csTransactions as StockTransaction[], label: 'CS Warehouse' };
    const map = new Map<string, SKU | CS_SKU>();
    for (const s of [...skus, ...csSkus]) if (!map.has(s.id)) map.set(s.id, s);
    return { list: [...map.values()], tx: [...transactions, ...csTransactions] as StockTransaction[], label: 'MKT and CS' };
  }, [wh, skus, csSkus, transactions, csTransactions]);

  const cpuOf = (id?: string | null, name?: string | null) =>
    merged.list.find((s) => s.id === id || (name && s.name === name))?.costPerUnit || 0;
  const catOf = (id?: string | null, name?: string | null) =>
    merged.list.find((s) => s.id === id || (name && s.name === name))?.category || '';

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(merged.list.map((s) => s.category || '').filter(Boolean)))],
    [merged],
  );
  const shown = useMemo(() => merged.list.filter((s) => cat === 'All' || s.category === cat), [merged, cat]);
  const inRange = (d?: string | null) => !!d && d >= from && d <= to;

  const monthRows = useMemo(() =>
    shown.map((s) => {
      const mv = getStockMovement(s as SKU, merged.tx, from, to);
      const cpu = s.costPerUnit || 0;
      return {
        sku: s, cpu,
        openingQty: mv.opening, openingVal: MULT(vat, mv.opening * cpu),
        stockInQty: mv.stockIn, stockInVal: MULT(vat, mv.stockIn * cpu),
        stockOutQty: mv.stockOut, stockOutVal: MULT(vat, mv.stockOut * cpu),
        closingQty: mv.closing, closingVal: MULT(vat, mv.closing * cpu),
      };
    }).sort((a, b) => a.sku.name.localeCompare(b.sku.name, 'la')),
    [shown, merged.tx, from, to, vat]);

  const stockOutRows = useMemo(() =>
    merged.tx.filter((t) => t.type === 'deduction' && inRange(t.date))
      .map((t) => ({ date: (t.date || '').slice(0, 10), skuName: t.skuName || '', qty: Number(t.qty) || 0, cpu: cpuOf(t.skuId, t.skuName) }))
      .sort((a, b) => b.date.localeCompare(a.date)), [merged, from, to]);

  const stockInRows = useMemo(() =>
    merged.tx.filter((t) => t.type === 'addition' && t.ticketId !== 'OPENING' && inRange(t.date))
      .map((t) => ({ date: (t.date || '').slice(0, 10), skuName: t.skuName || '', qty: Number(t.qty) || 0, cpu: cpuOf(t.skuId, t.skuName) }))
      .sort((a, b) => a.date.localeCompare(b.date)), [merged, from, to]);

  const remainRows = useMemo(() =>
    shown.map((s) => ({ skuName: s.name, qty: s.currentStock || 0, cpu: s.costPerUnit || 0 })),
    [shown]);

  const borrowRows = useMemo(() =>
    tickets.filter((t) => t.type === 'borrow' && inRange(t.actualDeliveryDate || t.createdAt))
      .map((t) => ({
        date: (t.actualDeliveryDate || t.createdAt || '').slice(0, 10),
        items: t.items.map((i) => i.skuName).join(', '),
        qty: t.items.reduce((a, i) => a + (i.qtyApproved ?? i.qtyRequested), 0),
        by: t.createdByName,
        status: t.returnedProcessed || t.status === 'returned' ? 'Returned' : t.status === 'finalized' ? 'Not returned' : t.status,
        est: t.items.reduce((a, i) => a + (i.qtyApproved ?? i.qtyRequested) * cpuOf(i.skuId, i.skuName), 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)), [tickets, from, to, merged.list]);

  const balanceRows = useMemo(() => {
    const dir = bSort.dir === 'asc' ? 1 : -1;
    const num = (a: any, k: string): number => {
      switch (k) {
        case 'name': return 0;
        case 'category': return 0;
        case 'opening': return a.opening;
        case 'stockIn': return a.stockIn;
        case 'stockOut': return a.stockOut;
        case 'current': return a.sku.currentStock;
        case 'broken': return a.broken;
        case 'cost': return a.sku.costPerUnit;
        case 'loss': return a.lossValue;
        case 'usage': return a.usagePct;
        default: return 0;
      }
    };
    const str = (a: any, k: string): string => (k === 'name' ? a.sku.name : a.sku.category || '');
    return shown.map((s) => {
      const mv = getStockMovement(s as SKU, merged.tx, from, to);
      const broken = merged.tx
        .filter((t) => t.skuId === s.id && (!t.date || (t.date >= from && t.date <= to)))
        .reduce((a, t) => a + Number(t.qtyBroken || 0), 0);
      return { sku: s, opening: mv.opening, stockIn: mv.stockIn, stockOut: mv.stockOut, broken, lossValue: broken * s.costPerUnit, usagePct: mv.usagePct };
    }).sort((a, b) => {
      const ka = bSort.key;
      if (ka === 'name' || ka === 'category') {
        const cmp = str(a, ka).localeCompare(str(b, ka), 'la');
        return dir * (cmp || str(a, 'name').localeCompare(str(b, 'name'), 'la'));
      }
      return dir * (num(a, ka) - num(b, ka));
    });
  }, [shown, merged.tx, from, to, bSort]);

  if (loading) return <Spinner label="Loading report…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;
  const isCS = user?.role === 'customer_service';

const tOut = stockOutRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  const tIn = stockInRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  const tRemain = remainRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  const tBorrow = borrowRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.est }), { q: 0, v: 0 });

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    // Sheet 1: Month End (Stock Movement)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['STOCK MOVEMENT', `${from} TO ${to}`, ...(vat ? ['INCLUDE VAT 10%'] : [])],
      ['ITEM', 'CPU', 'OPENING QTY', 'OPENING VALUE', 'STOCK IN QTY', 'STOCK IN VALUE', 'STOCK OUT QTY', 'STOCK OUT VALUE', 'CLOSING QTY', 'CLOSING VALUE'],
      ...monthRows.map((r) => [r.sku.name, r.cpu, r.openingQty, Math.round(r.openingVal), r.stockInQty, Math.round(r.stockInVal),
        r.stockOutQty, Math.round(r.stockOutVal), r.closingQty, Math.round(r.closingVal)]),
    ]), 'Month End');
    // Sheet 2: Item Stock Out
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ITEM STOCK OUT DETAILS'],
      ['DATE', 'SKU NAME', 'QTY', 'AMOUNT'],
      ...stockOutRows.map((r) => [r.date, r.skuName, r.qty, r.qty * r.cpu]),
      ['TOTAL', '', tOut.q, tOut.v],
    ]), 'Item Stock Out');
    // Sheet 3: Stock In Details
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['STOCK IN DETAILS'],
      ['DATE STOCK IN', 'SKU NAME', 'AMOUNT', 'VALUE'],
      ...stockInRows.map((r) => [r.date, r.skuName, r.qty, r.qty * r.cpu]),
      ['TOTAL', '', tIn.q, tIn.v],
    ]), 'Stock In');
    // Sheet 4: Stock Remain
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['STOCK REMAIN (CURRENT)'],
      ['SKU NAME', 'QTY', 'CPU', 'EST. VALUE'],
      ...remainRows.map((r) => [r.skuName, r.qty, r.cpu, r.qty * r.cpu]),
      ['TOTAL VALUE', '', '', tRemain.v],
    ]), 'Stock Remain');
    // Sheet 5: Borrow Item
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['BORROW ITEMS'],
      ['DATE BORROW', 'ITEM', 'AMOUNT', 'BORROW BY', 'STATUS', 'EST. VALUE'],
      ...borrowRows.map((r) => [r.date, r.items, r.qty, r.by, r.status, r.est]),
      ['TOTAL', '', tBorrow.q, '', tBorrow.v],
    ]), 'Borrow Item');
    // Sheet 6: Stock Balance (Inventory usage/loss)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['STOCK BALANCE — USAGE & LOSS ANALYSIS'],
      ['NAME', 'CATEGORY', 'OPENING', 'STOCK IN', 'STOCK OUT', 'CURRENT', 'BROKEN QTY', 'COST/UNIT', 'LOSS VALUE', 'USAGE %'],
      ...balanceRows.map((r) => [r.sku.name, r.sku.category || '', r.opening, r.stockIn, r.stockOut, r.sku.currentStock,
        r.broken, r.sku.costPerUnit, r.lossValue, `${r.usagePct.toFixed(0)}%`]),
    ]), 'Stock Balance');
    XLSX.writeFile(wb, `report-${wh}-${from}-to-${to}.xlsx`);
    toast('Report exported — 6 sheets (Excel)');
  };

  const printPdf = () => window.print();

const SortTh = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
    <th className={cn('table-head pb-2', right ? 'pl-2 text-right' : 'pr-2')}>
      <button
        className={cn('inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-700', bSort.key === k && 'text-brand-700')}
        onClick={() => setBSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }))}
        title={`Sort by ${label}`}
      >
        {label}
        {bSort.key === k
          ? bSort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 text-slate-300" />}
      </button>
    </th>
  );

  const cell = (qty: number, cost: number, tone: 'plain' | 'in' | 'out' = 'plain', sign = '') => {
    const color = tone === 'in' ? 'text-emerald-600' : tone === 'out' ? 'text-amber-600' : 'text-slate-800';
    return (
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
        {sign && <span className={`font-bold ${color}`}>{sign}</span>}
        <span className="text-[11px] text-slate-400">{fmt(qty)}</span>
        <span className="text-slate-300">·</span>
        <span className={`font-semibold ${color}`}>{money(qty * cost)}</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Reporting</h1>
        <p className="text-sm text-slate-500">All inventory &amp; stock movement reports · {merged.label}</p>
      </div>

      {/* shared filter bar */}
      <div className="flex flex-wrap items-end gap-2 no-print">
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
        <div>
          <label className="label">Date from</label>
          <input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Date to</label>
          <input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Merch Type</label>
          <select className="input w-52" value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'All' ? `All Categories (${categories.length - 1})` : c}</option>
            ))}
          </select>
        </div>
        {tab === 'month-end' && (
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={vat} onChange={(e) => setVat(e.target.checked)} />
            Include VAT (10%)
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={exportExcel}>
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
          {tab === 'month-end' && (
            <button className="btn btn-secondary btn-sm" onClick={printPdf}>
              <FileText className="h-3.5 w-3.5" /> Print PDF
            </button>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-50 p-1.5 no-print">
        {TAB_DEFS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700')}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

{tab === 'month-end' && (
        <div className="card card-pad">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Stock Movement — {from} to {to}</h2>
            <span className="text-xs text-slate-400">
              {cat === 'All' ? 'All Categories' : cat} · {monthRows.length} items{vat ? ' · incl. VAT 10%' : ''}
            </span>
          </div>
          {monthRows.length === 0 ? (
            <EmptyState icon={<CalendarRange className="h-6 w-6" />} title="No stock in this range" />
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th rowSpan={2} className="rounded-tl-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Item</th>
                    <th rowSpan={2} className="border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-600">CPU</th>
                    <th colSpan={2} className="border border-slate-500 bg-slate-700 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">Opening Balance</th>
                    <th colSpan={2} className="border border-emerald-800 bg-emerald-600 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">Stock In</th>
                    <th colSpan={2} className="border border-amber-800 bg-amber-600 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">Stock Out</th>
                    <th colSpan={2} className="rounded-tr-xl border border-brand-800 bg-brand-700 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">Closing Balance</th>
                  </tr>
                  <tr>
                    {['QTY', 'VALUE', 'QTY', 'VALUE', 'QTY', 'VALUE', 'QTY', 'VALUE'].map((h, i) => (
                      <th key={i} className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold uppercase text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((r) => (
                    <tr key={r.sku.id} className="transition hover:bg-slate-50/70">
                      <td className={`${cellCls} font-medium text-slate-800`}>{r.sku.name}</td>
                      <td className={`${cellCls} text-right tabular-nums text-slate-500`}>{money(r.cpu)}</td>
                      <td className={`${cellCls} text-right tabular-nums text-slate-700`}>{fmt(r.openingQty)}</td>
                      <td className={`${cellCls} text-right tabular-nums text-slate-600`}>{money(r.openingVal)}</td>
                      <td className={`${cellCls} text-right font-semibold tabular-nums text-emerald-600`}>{fmt(r.stockInQty)}</td>
                      <td className={`${cellCls} text-right tabular-nums text-emerald-700`}>{money(r.stockInVal)}</td>
                      <td className={`${cellCls} text-right font-semibold tabular-nums text-amber-700`}>{fmt(r.stockOutQty)}</td>
                      <td className={`${cellCls} text-right tabular-nums text-amber-700`}>{money(r.stockOutVal)}</td>
                      <td className={`${cellCls} text-right font-bold tabular-nums text-slate-800`}>{fmt(r.closingQty)}</td>
                      <td className={`${cellCls} text-right font-semibold tabular-nums text-brand-700`}>{money(r.closingVal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="border border-slate-200 px-3 py-2 text-right font-bold uppercase text-slate-600">Total</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-slate-800">{fmt(monthRows.reduce((a, r) => a + r.openingQty, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-semibold tabular-nums text-slate-700">{money(monthRows.reduce((a, r) => a + r.openingVal, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-emerald-700">{fmt(monthRows.reduce((a, r) => a + r.stockInQty, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{money(monthRows.reduce((a, r) => a + r.stockInVal, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-amber-700">{fmt(monthRows.reduce((a, r) => a + r.stockOutQty, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-semibold tabular-nums text-amber-700">{money(monthRows.reduce((a, r) => a + r.stockOutVal, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-slate-800">{fmt(monthRows.reduce((a, r) => a + r.closingQty, 0))}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-semibold tabular-nums text-brand-700">{money(monthRows.reduce((a, r) => a + r.closingVal, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

{tab === 'stock-out' && (
        <Panel title="Item Stock Out Details" tone="amber">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Date</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">SKU Name</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">QTY</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">AMOUNT</th>
            </tr></thead>
            <tbody>
              {stockOutRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} tabular-nums text-slate-500`}>{r.date}</td>
                  <td className={`${cellCls} font-medium text-slate-800`}>{r.skuName}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-700`}>{fmt(r.qty)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-amber-700`}>{money(r.qty * r.cpu)}</td>
                </tr>
              ))}
              {stockOutRows.length === 0 && <tr><td colSpan={4} className={`${cellCls} text-center text-slate-400`}>No stock out in this range</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-amber-50">
                <td colSpan={2} className="border border-slate-200 px-3 py-1.5 text-right font-bold uppercase text-amber-800">Total</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-amber-800">{fmt(tOut.q)}</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-amber-800">{money(tOut.v)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}

      {tab === 'stock-in' && (
        <Panel title="Stock In Details" tone="emerald">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Date Stock In</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">SKU Name</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">AMOUNT</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">VALUE</th>
            </tr></thead>
            <tbody>
              {stockInRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} tabular-nums text-slate-500`}>{r.date}</td>
                  <td className={`${cellCls} font-medium text-slate-800`}>{r.skuName}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-700`}>{fmt(r.qty)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-emerald-700`}>{money(r.qty * r.cpu)}</td>
                </tr>
              ))}
              {stockInRows.length === 0 && <tr><td colSpan={4} className={`${cellCls} text-center text-slate-400`}>No stock in for this range</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50">
                <td colSpan={2} className="border border-slate-200 px-3 py-1.5 text-right font-bold uppercase text-emerald-800">Total</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-emerald-800">{fmt(tIn.q)}</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-emerald-800">{money(tIn.v)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}

{tab === 'stock-remain' && (
        <Panel title="Stock Remain (Current)" tone="slate">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">SKU Name</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">QTY</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">CPU</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">EST. VALUE</th>
            </tr></thead>
            <tbody>
              {remainRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} font-medium text-slate-800`}>{r.skuName}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-700`}>{fmt(r.qty)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-500`}>{money(r.cpu)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-800`}>{money(r.qty * r.cpu)}</td>
                </tr>
              ))}
              {remainRows.length === 0 && <tr><td colSpan={4} className={`${cellCls} text-center text-slate-400`}>No stock</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100">
                <td colSpan={2} className="border border-slate-200 px-3 py-1.5 text-right font-bold uppercase text-slate-700">Total</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-slate-700">{fmt(tRemain.q)}</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-slate-800">TOTAL VALUE {money(tRemain.v)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}

      {tab === 'borrow' && (
        <Panel title="Borrow Items" tone="brand">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Date Borrow</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Item</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">AMOUNT</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Borrow By</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">EST. VALUE</th>
            </tr></thead>
            <tbody>
              {borrowRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} tabular-nums text-slate-500`}>{r.date}</td>
                  <td className={`${cellCls} font-medium text-slate-800`}>{r.items}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-700`}>{fmt(r.qty)}</td>
                  <td className={`${cellCls} text-slate-600`}>{r.by}</td>
                  <td className={cellCls}>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                      r.status === 'Returned' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        : r.status === 'Not returned' ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          : 'bg-slate-100 text-slate-600 ring-slate-500/20')}>
                      {r.status}
                    </span>
                  </td>
                  <td className={`${cellCls} text-right tabular-nums text-brand-700`}>{money(r.est)}</td>
                </tr>
              ))}
              {borrowRows.length === 0 && <tr><td colSpan={6} className={`${cellCls} text-center text-slate-400`}>No borrow in this range</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50/50">
                <td colSpan={2} className="border border-slate-200 px-3 py-1.5 text-right font-bold uppercase text-brand-800">Total</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-brand-800">{fmt(tBorrow.q)}</td>
                <td colSpan={2} className="border border-slate-200" />
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-brand-800">{money(tBorrow.v)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}

{tab === 'balance' && (
        <div className="card card-pad">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Stock Balance — Usage &amp; Loss</h2>
            <span className="text-xs text-slate-400">
              {cat === 'All' ? 'All Categories' : cat} · {balanceRows.length} items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <SortTh k="name" label="Name" />
                  <SortTh k="category" label="Category" />
                  <SortTh k="opening" label="Opening" right />
                  <SortTh k="stockIn" label="Stock In" right />
                  <SortTh k="stockOut" label="Stock Out" right />
                  <SortTh k="current" label="Current" right />
                  <SortTh k="broken" label="Broken Qty" right />
                  <SortTh k="cost" label="Cost/Unit" right />
                  <SortTh k="loss" label="Loss Value" right />
                  <SortTh k="usage" label="Usage %" right />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balanceRows.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-slate-400">No stock in this range</td></tr>
                )}
                {balanceRows.map((r) => (
                  <tr key={r.sku.id} className="transition hover:bg-slate-50/70">
                    <td className="py-2.5 pr-2 font-medium text-slate-800">{r.sku.name}</td>
                    <td className="py-2.5 pr-2 text-slate-500">{r.sku.category || '—'}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{fmt(r.opening)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-emerald-600">+{fmt(r.stockIn)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-amber-600">−{fmt(r.stockOut)}</td>
                    <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-slate-800">{fmt(r.sku.currentStock)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-rose-600">{r.broken > 0 ? fmt(r.broken) : '—'}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-500">{money(r.sku.costPerUnit)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-800">{money(r.lossValue)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{r.usagePct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold">
                <tr>
                  <td className="pt-2.5 text-slate-600" colSpan={8}>Inventory value (closing)</td>
                  <td className="pt-2.5 text-right tabular-nums text-brand-700">
                    {money(balanceRows.reduce((a, r) => a + ((r.opening + r.stockIn - r.stockOut) * r.sku.costPerUnit), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 no-print">
        Reports reflect {merged.label}. Opening/Closing are computed by rolling the current stock through transaction history (not stored).
        {tab === 'month-end' && ' Print = landscape physical sign-off copy submitted to Finance & Audit.'}
      </p>
    </div>
  );
}