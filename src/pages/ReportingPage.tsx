// ── Reporting — unified Inventory + Month End workspace (7 tabs, shared filters) ─
// Tabs: Month End Report · Item Stock Out · Stock In Details · Stock Remain ·
//       Borrow Item · Ticket Delivery · Stock Balance.
// Shared filter bar: Date from→to · Part (MKT/CS/All) · Merch Type (category) ·
//       VAT (visible only on Month End tab).
// One cut-off rule: Stock Remain and Stock Balance show the quantity on hand on
//       the period's LAST DAY (`to`) — the same rollback as the Month End
//       CLOSING column — never today's live stock (`getCutOffRows`).
// Export Excel → 6 sheets (Month End · Item Type · Item Stock Out · Stock In ·
//       Stock Remain · Ticket Delivery). Print PDF → only Month End tab.
// Finance role: only the first 4 tabs (FINANCE_TABS) and their 4 sheets.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarRange, CalendarDays, ChevronDown, ChevronUp, ChevronsUpDown,
  Download, FileText, FileBarChart, ArrowDownToLine, ArrowUpFromLine,
  Boxes, Repeat, Scale, Loader2, Printer,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, EmptyState, toast } from '@/components/ui/primitives';
import { fmt, money, cn } from '@/lib/utils';
import { reportFlowOf, getMonthEndRows, getCutOffRows, monthBounds, reportableTransactions } from '@/lib/stockMovement';
import { exportMonthEndPdf, printMonthEndPdf } from '@/lib/pdfExport';
import { STATUS_LABELS, type SKU, type CS_SKU, type StockTransaction } from '@/lib/types';

type TabKey = 'month-end' | 'stock-out' | 'stock-in' | 'stock-remain' | 'borrow' | 'delivery' | 'balance';
type Wh = 'mkt' | 'cs' | 'all';
type Tone = 'slate' | 'amber' | 'emerald' | 'brand';

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-700', amber: 'bg-amber-600', emerald: 'bg-emerald-600', brand: 'bg-brand-700',
};
const cellCls = 'border border-slate-200 px-3 py-1.5';

const TAB_DEFS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'month-end', label: 'Month End Report', icon: <CalendarRange className="h-4 w-4" /> },
  { key: 'stock-out', label: 'Item Stock Out', icon: <ArrowUpFromLine className="h-4 w-4" /> },
  { key: 'stock-in', label: 'Stock In Details', icon: <ArrowDownToLine className="h-4 w-4" /> },
  { key: 'stock-remain', label: 'Stock Remain', icon: <Boxes className="h-4 w-4" /> },
  { key: 'borrow', label: 'Borrow Item', icon: <Repeat className="h-4 w-4" /> },
  { key: 'delivery', label: 'Ticket Delivery', icon: <CalendarDays className="h-4 w-4" /> },
  { key: 'balance', label: 'Stock Balance', icon: <Scale className="h-4 w-4" /> },
];

// Finance sees only these tabs (and only these sheets in the Excel export).
const FINANCE_TABS: TabKey[] = ['month-end', 'stock-out', 'stock-in', 'stock-remain'];

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
  const isFinance = user?.role === 'finance';
  const visibleTabs = isFinance ? TAB_DEFS.filter((t) => FINANCE_TABS.includes(t.key)) : TAB_DEFS;
  const requestedTab = params.get('tab') as TabKey | null;
  const tab: TabKey = requestedTab && visibleTabs.some((t) => t.key === requestedTab) ? requestedTab : 'month-end';
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
  const [wh, setWh] = useState<Wh>(user?.role === 'customer_service' ? 'cs' : 'all');
  const [cat, setCat] = useState('All');
  const [vat, setVat] = useState(false);
  // Month End tab: real movements only by default — items with no opening
  // balance and no movement in the month are hidden (Finance can flip this on).
  const [showEmpty, setShowEmpty] = useState(false);
  const [bSort, setBSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // The Month End tab reports on a whole month ('YYYY-MM'). The month picker
  // keeps the shared `from`/`to` filters on that month's boundaries, so the
  // other six tabs, the exports and the file names all stay consistent.
  const month = from.slice(0, 7);
  const monthRange = monthBounds(month);
  const setMonth = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    setFrom(monthBounds(m).from);
    setTo(monthBounds(m).to);
  };

  const merged = useMemo(() => {
    // Reportable ledger: cancelled bookings and everything belonging to a
    // rejected / recalled ticket are excluded (they netted out to zero).
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

  // Month End Report rows — see "Month End Report.md". Opening rolls every
  // movement back from the month start (an item's starting stock shows as
  // Stock In in the month it is dated — Opening(M) = Closing(M−1); ticket
  // movements are dated on the ticket's delivery date — 0026), Closing rolls back only what
  // happened AFTER the month end, and "All" merges MKT + CS per SKU summing
  // quantity AND value (each warehouse keeps its own cost per unit).
  // Items are never listed before they were created, and rows with no balance
  // and no movement are hidden unless "Show items with no movement" is ticked.
  const monthRows = useMemo(() =>
    getMonthEndRows({
      month, scope: wh,
      skus, transactions, csSkus, csTransactions,
      tickets, category: cat, vat, includeEmpty: showEmpty,
    }), [month, wh, skus, csSkus, transactions, csTransactions, tickets, cat, vat, showEmpty]);

  // Opening + In − Out === Closing by construction — anything else means the
  // SKU baseline drifted from the ledger and Finance should be told.
  // (Kept as a silent data-integrity signal for the Excel export / diagnostics —
  // the on-screen banner is now the Stock Remain ⇄ Closing reconciliation below,
  // which is the check Finance actually cares about.)
  const varianceRows = useMemo(
    () => monthRows.filter((r) => Math.abs(r.variance) > 1e-6),
    [monthRows],
  );

  // Stock Out / Stock In lists use the same gross flow as the Month End totals:
  // every addition (incl. a new item's OPENING row, 'Edit Return' and
  // 'Cancel Return') is a Stock In line, every deduction a Stock Out line.
  const stockOutRows = useMemo(() =>
    merged.tx.filter((t) => reportFlowOf(t).out !== 0 && inRange(t.date))
      .map((t) => ({ date: (t.date || '').slice(0, 10), skuName: t.skuName || '', qty: reportFlowOf(t).out, cpu: cpuOf(t.skuId, t.skuName) }))
      // stable: two movements on the same day keep the ledger order
      .sort((a, b) => b.date.localeCompare(a.date)), [merged, from, to]);

  const stockInRows = useMemo(() =>
    merged.tx.filter((t) => reportFlowOf(t).in !== 0 && inRange(t.date))
      .map((t) => ({ date: (t.date || '').slice(0, 10), skuName: t.skuName || '', qty: reportFlowOf(t).in, cpu: cpuOf(t.skuId, t.skuName) }))
      .sort((a, b) => a.date.localeCompare(b.date)), [merged, from, to]);

  // Stock Remain = what is left AT THE CUT-OFF (`to`), never today's live stock:
  // `getCutOffRows` rolls every reportable movement dated after `to` back out of
  // `currentStock`. Item rows are matched MKT↔CS exactly like the Month End
  // Report, so on a month-end cut-off the QTY/VALUE totals equal its Closing.
  const remainRows = useMemo(() =>
    getCutOffRows({
      skus, csSkus, transactions, csTransactions, tickets,
      scope: wh, asOf: to, category: cat,
    }).map((r) => ({ key: r.key, skuName: r.sku.name, qty: r.qty, cpu: r.cpu, warehouses: r.warehouses })),
    [skus, csSkus, transactions, csTransactions, tickets, wh, to, cat]);

  const borrowRows = useMemo(() =>
    tickets.filter((t) => t.type === 'borrow' && inRange(t.actualDeliveryDate || t.deliveryDate || t.createdAt))
      .map((t) => ({
        date: (t.actualDeliveryDate || t.deliveryDate || t.createdAt || '').slice(0, 10),
        items: t.items.map((i) => i.skuName).join(', '),
        qty: t.items.reduce((a, i) => a + (i.qtyApproved ?? i.qtyRequested), 0),
        by: t.createdByName,
        status: t.returnedProcessed || t.status === 'returned' ? 'Returned' : t.status === 'finalized' ? 'Not returned' : t.status,
        est: t.items.reduce((a, i) => a + (i.qtyApproved ?? i.qtyRequested) * cpuOf(i.skuId, i.skuName), 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)), [tickets, from, to, merged.list]);

  // Ticket Delivery: report on the ticket's delivery date(s) — the NEEDED-BY
  // date the requester chose at submission and the ACTUAL date the warehouse
  // recorded at review. Both are stored on the ticket (not on the stock txs).
  const deliveryRows = useMemo(() =>
    tickets
      .filter((t) => inRange(t.deliveryDate || t.actualDeliveryDate))
      .map((t) => ({
        ticket: t.id,
        items: t.items.map((i) => i.skuName).join(', '),
        requester: t.createdByName,
        dept: t.department,
        neededBy: t.deliveryDate || '—',
        actual: t.actualDeliveryDate || '—',
        status: STATUS_LABELS[t.status] || t.status,
      }))
      .sort((a, b) => (b.neededBy > a.neededBy ? 1 : b.neededBy < a.neededBy ? -1 : 0)),
    [tickets, from, to]);

  // Stock Balance — one row per item on the SAME cut-off as Stock Remain and the
  // Month End Closing (`getCutOffRows` → `closingQtyAsOf(sku, tx, to)`).
  // Opening rolls the period's movements back out of that balance, so
  // Opening + In − Out === Closing for every row, value = qty × CPU.
  const balanceRows = useMemo(() => {
    const dir = bSort.dir === 'asc' ? 1 : -1;
    const num = (a: any, k: string): number => {
      switch (k) {
        case 'name': return 0;
        case 'category': return 0;
        case 'opening': return a.opening;
        case 'stockIn': return a.stockIn;
        case 'stockOut': return a.stockOut;
        case 'closing': return a.closing;
        case 'broken': return a.broken;
        case 'cost': return a.cpu;
        case 'loss': return a.lossValue;
        case 'usage': return a.usagePct;
        default: return 0;
      }
    };
    const str = (a: any, k: string): string => (k === 'name' ? a.name : a.category || '');
    return getCutOffRows({
      skus, csSkus, transactions, csTransactions, tickets,
      scope: wh, asOf: to, category: cat, includeZero: true,
    }).map((r) => {
      let inQty = 0;
      let outQty = 0;
      let broken = 0;
      for (const t of merged.tx) {
        if (t.skuId !== r.sku.id) continue;
        const f = reportFlowOf(t);
        if (inRange(t.date)) {
          inQty += f.in;
          outQty += f.out;
          broken += Number(t.qtyBroken || 0);
        }
      }
      const inflow = Number(r.sku.totalInflow || 0) || Number(r.sku.openingBalance || 0);
      return {
        key: r.key,
        sku: r.sku,
        name: r.sku.name,
        category: r.sku.category || '',
        cpu: r.cpu,
        opening: r.qty - inQty + outQty,
        stockIn: inQty,
        stockOut: outQty,
        closing: r.qty,
        broken,
        lossValue: broken * r.cpu,
        usagePct: inflow > 0 ? Math.max(0, ((inflow - r.qty) / inflow) * 100) : 0,
      };
    }).sort((a, b) => {
      const ka = bSort.key;
      if (ka === 'name' || ka === 'category') {
        const cmp = str(a, ka).localeCompare(str(b, ka), 'la');
        return dir * (cmp || str(a, 'name').localeCompare(str(b, 'name'), 'la'));
      }
      return dir * (num(a, ka) - num(b, ka));
    });
  }, [skus, csSkus, transactions, csTransactions, tickets, merged.tx, wh, cat, from, to, bSort]);

  // Month End column totals.
  // NOTE: every hook must run BEFORE the loading/error early returns below. A
  // hook placed after them changes the hook order between the "loading" render
  // and the "loaded" render; React 18 rejects that with error #310 and unmounts
  // the whole page — which is what blanked a fresh /reporting deep link.
  const meTotals = useMemo(() => ({
    opening: monthRows.reduce((a, r) => ({ qty: a.qty + r.openingQty, val: a.val + r.openingVal }), { qty: 0, val: 0 }),
    stockIn: monthRows.reduce((a, r) => ({ qty: a.qty + r.stockInQty, val: a.val + r.stockInVal }), { qty: 0, val: 0 }),
    stockOut: monthRows.reduce((a, r) => ({ qty: a.qty + r.stockOutQty, val: a.val + r.stockOutVal }), { qty: 0, val: 0 }),
    closing: monthRows.reduce((a, r) => ({ qty: a.qty + r.closingQty, val: a.val + r.closingVal }), { qty: 0, val: 0 }),
  }), [monthRows]);

  // Stock Remain (as of the same cut-off) must total exactly the Month End
  // Closing: same ledger, same rollback, same row set. Anything else is a real
  // discrepancy, so surface it instead of printing two different numbers.
  const remainTotalQty = useMemo(() => remainRows.reduce((a, r) => a + r.qty, 0), [remainRows]);
  const reconcile = useMemo(() => {
    const qtyDiff = remainTotalQty - meTotals.closing.qty;
    return { ok: Math.abs(qtyDiff) < 1e-6, qtyDiff };
  }, [remainTotalQty, meTotals]);

  // Excel "Item Type" sheet: the Month End rows rolled up per Merch Type, so the
  // per-category totals always add up to the Month End TOTAL row.
  const itemTypeRows = useMemo(() => {
    type Acc = {
      items: number;
      openingQty: number; openingVal: number;
      stockInQty: number; stockInVal: number;
      stockOutQty: number; stockOutVal: number;
      closingQty: number; closingVal: number;
    };
    const map = new Map<string, Acc>();
    for (const r of monthRows) {
      const k = (r.sku.category || '').trim() || '(uncategorised)';
      const acc: Acc = map.get(k) ?? {
        items: 0, openingQty: 0, openingVal: 0, stockInQty: 0, stockInVal: 0,
        stockOutQty: 0, stockOutVal: 0, closingQty: 0, closingVal: 0,
      };
      acc.items += 1;
      acc.openingQty += r.openingQty; acc.openingVal += r.openingVal;
      acc.stockInQty += r.stockInQty; acc.stockInVal += r.stockInVal;
      acc.stockOutQty += r.stockOutQty; acc.stockOutVal += r.stockOutVal;
      acc.closingQty += r.closingQty; acc.closingVal += r.closingVal;
      map.set(k, acc);
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.closingVal - a.closingVal || a.category.localeCompare(b.category, 'la'));
  }, [monthRows]);

  if (loading) return <Spinner label="Loading report…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;
  const isCS = user?.role === 'customer_service';

const tOut = stockOutRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  const tIn = stockInRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  const tRemain = remainRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.qty * r.cpu }), { q: 0, v: 0 });
  // Borrow Item no longer has an Excel sheet, but the on-screen tab still totals it.
  const tBorrow = borrowRows.reduce((a, r) => ({ q: a.q + r.qty, v: a.v + r.est }), { q: 0, v: 0 });

  const exportExcel = async () => {
    setExporting(true);
    try {
      // Dynamically import xlsx only when needed (saves 283 kB on initial load)
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
    // Sheet order matters to Finance: Month End → Item Type → detail sheets.
    // (Borrow Item and Stock Balance sheets are intentionally NOT exported —
    // both stay available as on-screen tabs.)
    const sheet = (rows: (string | number)[][], name: string, widths?: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    // Sheet 1: Month End (Stock Movement)
    sheet([
      ['STOCK MOVEMENT', `${monthRange.from} TO ${monthRange.to}`, ...(vat ? ['INCLUDE VAT 10%'] : [])],
      ['NO', 'ITEM', 'CPU', 'OPENING QTY', 'OPENING VALUE', 'STOCK IN QTY', 'STOCK IN VALUE', 'STOCK OUT QTY', 'STOCK OUT VALUE', 'CLOSING QTY', 'CLOSING VALUE'],
      ...monthRows.map((r, i) => [i + 1, r.sku.name, r.cpu, r.openingQty, Math.round(r.openingVal), r.stockInQty, Math.round(r.stockInVal),
        r.stockOutQty, Math.round(r.stockOutVal), r.closingQty, Math.round(r.closingVal)]),
    ], 'Month End');
    // Sheet 2: Item Type — the Month End rows rolled up per Merch Type. Every
    // column adds up to the Month End TOTAL row (same rows, same cut-off).
    sheet([
      ['ITEM TYPE (MERCH TYPE) SUMMARY', `${monthRange.from} TO ${monthRange.to}`, ...(vat ? ['INCLUDE VAT 10%'] : [])],
      ['CATEGORY', 'ITEMS', 'OPENING QTY', 'OPENING VALUE', 'STOCK IN QTY', 'STOCK IN VALUE', 'STOCK OUT QTY', 'STOCK OUT VALUE', 'CLOSING QTY', 'CLOSING VALUE', 'CLOSING % OF VALUE'],
      ...itemTypeRows.map((r) => [r.category, r.items, r.openingQty, Math.round(r.openingVal), r.stockInQty, Math.round(r.stockInVal),
        r.stockOutQty, Math.round(r.stockOutVal), r.closingQty, Math.round(r.closingVal),
        `${meTotals.closing.val > 0 ? ((r.closingVal / meTotals.closing.val) * 100).toFixed(1) : '0.0'}%`]),
      ['TOTAL', itemTypeRows.reduce((a, r) => a + r.items, 0),
        meTotals.opening.qty, Math.round(meTotals.opening.val), meTotals.stockIn.qty, Math.round(meTotals.stockIn.val),
        meTotals.stockOut.qty, Math.round(meTotals.stockOut.val), meTotals.closing.qty, Math.round(meTotals.closing.val), '100.0%'],
    ], 'Item Type', [26, 8, 13, 15, 13, 15, 14, 16, 13, 15, 18]);
    // Sheet 3: Item Stock Out
    sheet([
      ['ITEM STOCK OUT DETAILS', `${from} TO ${to}`],
      ['DATE', 'SKU NAME', 'QTY', 'AMOUNT'],
      ...stockOutRows.map((r) => [r.date, r.skuName, r.qty, Math.round(r.qty * r.cpu)]),
      ['TOTAL', '', tOut.q, Math.round(tOut.v)],
    ], 'Item Stock Out', [13, 40, 10, 16]);
    // Sheet 4: Stock In Details
    sheet([
      ['STOCK IN DETAILS', `${from} TO ${to}`],
      ['DATE STOCK IN', 'SKU NAME', 'QTY', 'VALUE'],
      ...stockInRows.map((r) => [r.date, r.skuName, r.qty, Math.round(r.qty * r.cpu)]),
      ['TOTAL', '', tIn.q, Math.round(tIn.v)],
    ], 'Stock In', [15, 40, 10, 16]);
    // Sheet 5: Stock Remain — quantity at the cut-off (`to`), the same figure as
    // the Month End CLOSING column for the same month.
    sheet([
      ['STOCK REMAIN', `AS OF ${to}`],
      ['SKU NAME', 'QTY', 'CPU', 'EST. VALUE'],
      ...remainRows.map((r) => [r.skuName, r.qty, r.cpu, Math.round(r.qty * r.cpu)]),
      ['TOTAL', tRemain.q, '', Math.round(tRemain.v)],
    ], 'Stock Remain', [40, 10, 14, 18]);
    if (!isFinance) {
    // Sheet 6: Ticket Delivery (needed-by vs actual delivery dates)
    sheet([
      ['TICKET DELIVERY', `${from} TO ${to}`],
      ['TICKET', 'ITEM(S)', 'REQUESTER', 'DEPARTMENT', 'DELIVERY DATE', 'ACTUAL DELIVERY', 'STATUS'],
      ...deliveryRows.map((r) => [r.ticket, r.items, r.requester, r.dept, r.neededBy, r.actual, r.status]),
    ], 'Ticket Delivery', [18, 44, 22, 16, 14, 16, 14]);
    }
    XLSX.writeFile(wb, `report-${wh}-${from}-to-${to}.xlsx`);
    toast(`Report exported — ${wb.SheetNames.length} sheets (Excel)`);
    } finally {
      setExporting(false);
    }
  };

  // The PDF is built asynchronously (Lao font + rasterised item names), so the
  // button reports progress and surfaces a failure instead of failing silently.
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportMonthEndPdf({
        title: 'Month End Stock Report',
        dateRange: `${monthRange.from} to ${monthRange.to}`,
        warehouse: merged.label,
        category: cat,
        includeVat: vat,
        rows: monthRows,
        totalOpening: meTotals.opening,
        totalStockIn: meTotals.stockIn,
        totalStockOut: meTotals.stockOut,
        totalClosing: meTotals.closing,
      });
      toast('PDF exported with signature areas');
    } catch (e: any) {
      toast(e?.message || 'Could not build the PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintPdf = async () => {
    try {
      await printMonthEndPdf({
        title: 'Month End Stock Report',
        dateRange: `${monthRange.from} to ${monthRange.to}`,
        warehouse: merged.label,
        category: cat,
        includeVat: vat,
        rows: monthRows,
        totalOpening: meTotals.opening,
        totalStockIn: meTotals.stockIn,
        totalStockOut: meTotals.stockOut,
        totalClosing: meTotals.closing,
      });
    } catch (e: any) {
      toast(e?.message || 'Could not build the PDF', 'error');
    }
  };

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
      </div>
      <div className="flex flex-wrap items-end gap-2 no-print">
        <div>
          <label className="label">Part</label>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(['all', 'mkt', 'cs'] as Wh[])
              .filter((w) => user?.role !== 'customer_service' || w === 'cs')
              .map((w) => (
              <button key={w} onClick={() => setWh(w)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition',
                  wh === w ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600')}>
                {w === 'all' ? 'All' : w === 'mkt' ? 'MKT' : 'CS'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'month-end' ? (
          <div>
            <label className="label">Month</label>
            <input className="input w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Date from</label>
              <input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Date to</label>
              <input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="label">Merch Type</label>
          <select className="input w-52" value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'All' ? `All Categories (${categories.length - 1})` : c}</option>
            ))}
          </select>
        </div>
        {tab === 'month-end' && (
          <>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={vat} onChange={(e) => setVat(e.target.checked)} />
              Include VAT (10%)
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              Show items with no movement
            </label>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          {tab === 'month-end' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={handleExportPdf} disabled={exportingPdf}>
                {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {exportingPdf ? 'Preparing…' : 'Export PDF'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handlePrintPdf}>
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-50 p-1.5 no-print">
        {visibleTabs.map((t) => (
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
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Stock Movement — {monthRange.from} to {monthRange.to}</h2>
            <span className="text-xs text-slate-400">
              {cat === 'All' ? 'All Categories' : cat} · {monthRows.length} items{vat ? ' · incl. VAT 10%' : ''}
            </span>
          </div>
          {/* One number everywhere: Stock Remain (cut-off = month end) must total
              exactly the Closing Balance. Shown only when it does not. */}
          {!reconcile.ok && (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Cut-off check: Stock Remain totals <b className="tabular-nums">{fmt(remainTotalQty)}</b> but Closing Balance totals{' '}
              <b className="tabular-nums">{fmt(meTotals.closing.qty)}</b> ({reconcile.qtyDiff > 0 ? '+' : ''}{fmt(reconcile.qtyDiff)}).
              Both are computed with the same rollback to {monthRange.to} — please investigate before handing the report over.
            </p>
          )}
          {varianceRows.length > 0 && (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Ledger check: {varianceRows.length} item{varianceRows.length > 1 ? 's' : ''} where Opening + In − Out ≠ Closing (
              {varianceRows.slice(0, 5).map((r) => r.sku.name).join(', ')}
              {varianceRows.length > 5 ? ', …' : ''}) — the SKU baseline has drifted from its movements.
            </p>
          )}
          {monthRows.length === 0 ? (
            <EmptyState icon={<CalendarRange className="h-6 w-6" />} title="No stock in this range" />
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th rowSpan={2} className="w-12 rounded-tl-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-600">No</th>
                    <th rowSpan={2} className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Item</th>
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
                  {monthRows.map((r, idx) => (
                    <tr key={r.key} className="transition hover:bg-slate-50/70">
                      <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-500">{idx + 1}</td>
                      <td className={`${cellCls} font-medium text-slate-800`}>
                        {r.sku.name}
                        {r.warehouses === 2 && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">MKT + CS</span>
                        )}
                      </td>
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
                    <td colSpan={3} className="border border-slate-200 px-3 py-2 text-right font-bold uppercase text-slate-600">Total</td>
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
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">QTY</th>
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
        <Panel title={`Stock Remain — as of ${to}`} tone="slate">
          <p className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
            Quantity on hand at the cut-off date <b className="tabular-nums text-slate-700">{to}</b> — the same figure as the Month End
            Report&apos;s Closing Balance for that month ({fmt(meTotals.closing.qty)}). Movements dated after {to} are not counted yet.
          </p>
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">SKU Name</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Remaining QTY</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">CPU</th>
              <th className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">EST. VALUE</th>
            </tr></thead>
            <tbody>
              {remainRows.map((r) => (
                <tr key={r.key} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} font-medium text-slate-800`}>
                    {r.skuName}
                    {r.warehouses === 2 && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">MKT + CS</span>
                    )}
                  </td>
                  <td className={`${cellCls} text-right font-semibold tabular-nums text-slate-800`}>{fmt(r.qty)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-500`}>{money(r.cpu)}</td>
                  <td className={`${cellCls} text-right tabular-nums text-slate-800`}>{money(r.qty * r.cpu)}</td>
                </tr>
              ))}
              {remainRows.length === 0 && <tr><td colSpan={4} className={`${cellCls} text-center text-slate-400`}>No stock remaining at {to}</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100">
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold uppercase text-slate-700">Total</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-slate-800">{fmt(tRemain.q)}</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right text-[11px] font-semibold uppercase text-slate-500">Value</td>
                <td className="border border-slate-200 px-3 py-1.5 text-right font-bold tabular-nums text-slate-800">{money(tRemain.v)}</td>
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

{tab === 'delivery' && (
        <Panel title="Ticket Delivery" tone="brand">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Ticket</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Item(s)</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Requester</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Department</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Delivery Date</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Actual Delivery</th>
              <th className="border border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
            </tr></thead>
            <tbody>
              {deliveryRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                  <td className={`${cellCls} font-mono text-xs font-medium text-brand-700`}>{r.ticket}</td>
                  <td className={`${cellCls} max-w-[260px]`}><p className="truncate text-slate-700" title={r.items}>{r.items}</p></td>
                  <td className={`${cellCls} text-slate-600`}>{r.requester}</td>
                  <td className={`${cellCls} text-slate-600`}>{r.dept}</td>
                  <td className={`${cellCls} tabular-nums text-slate-600`}>{r.neededBy}</td>
                  <td className={`${cellCls} tabular-nums text-slate-600`}>{r.actual}</td>
                  <td className={cellCls}>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                      r.status === 'Finalized' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        : r.status === 'Pending' ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          : r.status === 'Rejected' || r.status === 'Recalled' ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
                            : 'bg-slate-100 text-slate-600 ring-slate-500/20')}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {deliveryRows.length === 0 && <tr><td colSpan={7} className={`${cellCls} text-center text-slate-400`}>No tickets in this delivery range</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

{tab === 'balance' && (
        <div className="card card-pad">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Stock Balance — Usage &amp; Loss</h2>
            <span className="text-xs text-slate-400">
              {cat === 'All' ? 'All Categories' : cat} · {balanceRows.length} items · as of <span className="tabular-nums text-slate-500">{to}</span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <SortTh k="name" label="Name" />
                  <SortTh k="category" label="Category" />
                  <SortTh k="opening" label={`Opening (${from.slice(0, 10)})`} right />
                  <SortTh k="stockIn" label="Stock In" right />
                  <SortTh k="stockOut" label="Stock Out" right />
                  <SortTh k="closing" label={`Closing (${to})`} right />
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
                  <tr key={r.key} className="transition hover:bg-slate-50/70">
                    <td className="py-2.5 pr-2 font-medium text-slate-800">{r.name}</td>
                    <td className="py-2.5 pr-2 text-slate-500">{r.category || '—'}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{fmt(r.opening)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-emerald-600">+{fmt(r.stockIn)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-amber-600">−{fmt(r.stockOut)}</td>
                    <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-slate-800">{fmt(r.closing)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-rose-600">{r.broken > 0 ? fmt(r.broken) : '—'}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-500">{money(r.cpu)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-800">{money(r.lossValue)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{r.usagePct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold">
                <tr>
                  <td className="pt-2.5 text-slate-600" colSpan={8}>
                    Inventory value at {to} (Balance {fmt(balanceRows.reduce((a, r) => a + r.closing, 0))} qty)
                  </td>
                  <td className="pt-2.5 text-right tabular-nums text-brand-700">
                    {money(balanceRows.reduce((a, r) => a + r.closing * r.cpu, 0))}
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
        {' '}Stock Remain and Stock Balance show the quantity on hand at the cut-off {to}
        {tab === 'month-end' ? ' (the month end)' : ''} — the same rollback as the Month End Closing Balance, so the numbers always agree.
        {tab === 'month-end' && ' Month End: Opening rolls every movement back from the 1st of the month (a brand-new item starts at 0 and its initial stock shows as Stock In), Closing rolls back only the movements after the month end, All stock merges the MKT + CS rows (quantities and values summed), items are never listed before their creation date, and items with no balance and no movement in the month are hidden unless "Show items with no movement" is ticked.'}
        {tab === 'month-end' && ' Print = landscape physical sign-off copy submitted to Finance & Audit.'}
      </p>
    </div>
  );
}