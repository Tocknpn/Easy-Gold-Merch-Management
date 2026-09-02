// ── Manage Stock: Overview · Adjust Balance · Transfer · Stock In/Out · SKU Setup ──
import { useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, SlidersHorizontal, ArrowLeftRight, PackagePlus, Settings2,
  Pencil, Trash2, Power, PlusCircle, Search, Loader2, Warehouse, ImagePlus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, Spinner, ErrorBanner, toast } from '@/components/ui/primitives';
import { fmt, money, cn, safeImageUrl } from '@/lib/utils';
import type { SKU, CS_SKU } from '@/lib/types';

type Wh = 'mkt' | 'cs';
type TabKey = 'overview' | 'adjust' | 'transfer' | 'stockio' | 'sku';

const TAB_DEFS: { key: TabKey; label: string; icon: ReactNode; roles: string[]; hint: string }[] = [
  { key: 'overview', label: 'Overview', icon: <ShieldCheck className="h-4 w-4" />, roles: ['warehouse', 'customer_service', 'director', 'admin'], hint: 'MKT + CS merged stock' },
  { key: 'adjust', label: 'Adjust Balance', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ['warehouse', 'customer_service', 'admin'], hint: 'Rebalance, destock, loss/broken' },
  { key: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className="h-4 w-4" />, roles: ['warehouse', 'admin'], hint: 'Move stock MKT ⇄ CS' },
  { key: 'stockio', label: 'Stock In / Out', icon: <PackagePlus className="h-4 w-4" />, roles: ['warehouse', 'customer_service', 'admin'], hint: 'Refill / issue with invoice ref' },
  { key: 'sku', label: 'SKU Setup', icon: <Settings2 className="h-4 w-4" />, roles: ['warehouse', 'admin'], hint: 'Add, edit, activate, remove' },
];

export function ManageStockPage() {
  const { hasAccess } = useAuth();
  const { skus, csSkus, loading, error, refresh } = useData();
  const [params, setParams] = useSearchParams();

  const tabs = useMemo(() => TAB_DEFS.filter((t) => hasAccess(t.roles)), [hasAccess]);
  const rawTab = params.get('tab') as TabKey | null;
  const active: TabKey = rawTab && tabs.some((t) => t.key === rawTab) ? rawTab : tabs[0]?.key || 'overview';

  const grand = useMemo(() => {
    const mv = skus.reduce((a, s) => a + s.currentStock * s.costPerUnit, 0);
    const cv = csSkus.reduce((a, s) => a + s.currentStock * s.costPerUnit, 0);
    return { mv, cv, total: mv + cv };
  }, [skus, csSkus]);

  if (loading) return <Spinner label="Loading stock management…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Warehouse className="h-5 w-5 text-brand-600" /> Manage Stock
          </h1>
          <p className="text-sm text-slate-500">
            One workspace for balances, transfers, refills and SKU setup — no ticket needed
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-50 px-3 py-1.5 font-medium text-slate-600 ring-1 ring-slate-200">
            MKT · {skus.length} items · <b className="text-slate-800">{money(grand.mv)}</b>
          </span>
          <span className="rounded-full bg-cyan-50 px-3 py-1.5 font-medium text-cyan-700 ring-1 ring-cyan-200">
            CS · {csSkus.length} items · <b>{money(grand.cv)}</b>
          </span>
          <span className="rounded-full bg-brand-50 px-3 py-1.5 font-semibold text-brand-700 ring-1 ring-brand-200">
            Total {money(grand.total)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            title={t.hint}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
              active === t.key
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-200'
                : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {active === 'overview' && <OverviewTab />}
      {active === 'adjust' && <AdjustTab />}
      {active === 'transfer' && <TransferTab />}
      {active === 'stockio' && <StockIOTab />}
      {active === 'sku' && <SkuTab />}
    </div>
  );
}

/* ── shared small parts ─────────────────────────────────────────────────── */

function WhToggle({ value, onChange }: { value: Wh; onChange: (w: Wh) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {(['mkt', 'cs'] as Wh[]).map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition',
            value === w ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600',
          )}
        >
          {w === 'mkt' ? 'MKT Warehouse' : 'CS Warehouse'}
        </button>
      ))}
    </div>
  );
}

function StockBadge({ s }: { s: SKU | CS_SKU }) {
  if (s.currentStock <= 0)
    return <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-600/20">Out</span>;
  if (s.currentStock <= (s.lowStockThreshold || 0))
    return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">Low</span>;
  return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">In stock</span>;
}

function StatusPill({ s }: { s: SKU | CS_SKU }) {
  const off = s.status === 'inactive';
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
      off ? 'bg-slate-100 text-slate-500 ring-slate-300' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    )}>
      {off ? 'Inactive' : 'Active'}
    </span>
  );
}

/* ── Tab 1: Overview (formerly Total Stock, now MKT + CS merged) ────────── */

function OverviewTab() {
  const { skus, csSkus } = useData();
  const [wh, setWh] = useState<Wh>('mkt');
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);

  const rows = useMemo(() => {
    let list: (SKU | CS_SKU)[] = wh === 'mkt' ? skus : csSkus;
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((s) => (s.name || '').toLowerCase().includes(term) || (s.category || '').toLowerCase().includes(term));
    if (onlyLow) list = list.filter((s) => s.currentStock <= (s.lowStockThreshold || 0));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'la'));
  }, [wh, skus, csSkus, q, onlyLow]);

  const value = rows.reduce((a, s) => a + s.currentStock * s.costPerUnit, 0);
  const lowCount = (wh === 'mkt' ? skus : csSkus).filter((s) => s.currentStock <= (s.lowStockThreshold || 0)).length;

  const exportCsv = () => {
    const head = ['SKU', 'Category', 'Unit', 'Current', 'Threshold', 'Cost/Unit', 'Value', 'Status'];
    const body = rows.map((s) => [s.name, s.category || '', s.unit, s.currentStock, s.lowStockThreshold, s.costPerUnit, s.currentStock * s.costPerUnit, s.status || 'active']);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `stock-${wh}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} items`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <WhToggle value={wh} onChange={setWh} />
        <div className="relative ml-auto">
          <input className="input w-52" placeholder="Search item or category…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button
          onClick={() => setOnlyLow((v) => !v)}
          className={cn('btn btn-sm', onlyLow ? 'btn-danger' : 'btn-outline')}
        >
          Low stock ({lowCount})
        </button>
        <button className="btn btn-outline btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head py-2.5 pl-4 pr-2">Item</th>
              <th className="table-head py-2.5 pr-2">Category</th>
              <th className="table-head py-2.5 pr-2">Current stock</th>
              <th className="table-head py-2.5 pr-2">Status</th>
              <th className="table-head py-2.5 pr-2">Stock health</th>
              <th className="table-head py-2.5 pr-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50/70">
                <td className="py-2.5 pl-4 pr-2 font-semibold text-slate-800">{s.name}</td>
                <td className="py-2.5 pr-2 text-slate-500">{s.category || '—'}</td>
                <td className="py-2.5 pr-2 font-bold text-slate-900">{fmt(s.currentStock)} <span className="text-xs font-normal text-slate-400">{s.unit}</span></td>
                <td className="py-2.5 pr-2"><StatusPill s={s} /></td>
                <td className="py-2.5 pr-2"><StockBadge s={s} /></td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{money(s.currentStock * s.costPerUnit)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">No items match.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-700">
              <td className="py-2.5 pl-4" colSpan={5}>{rows.length} items · total value</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{money(value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── shared SKU select + busy hook ──────────────────────────────────────── */

function SkuSelect({ list, value, onChange }: { list: (SKU | CS_SKU)[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select an item…</option>
      {list.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} — {fmt(s.currentStock)} {s.unit} on hand
        </option>
      ))}
    </select>
  );
}

function useStockOp() {
  const [busy, setBusy] = useState(false);
  const wrap = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(okMsg);
      return true;
    } catch (e: any) {
      toast(e?.message || 'Operation failed', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, wrap };
}

function RecentMoves({ wh }: { wh: Wh }) {
  const { transactions, csTransactions } = useData();
  const rows = (wh === 'mkt' ? transactions : csTransactions)
    .filter((t) => ['Destock', 'Loss/Broken', 'Restock', 'Adjustment', 'Found', 'Refill'].includes(t.status || ''))
    .slice(0, 8);
  if (rows.length === 0) return <p className="text-xs text-slate-400">No manual adjustments recorded yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((t, i) => (
        <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
          <span className={cn(
            'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
            t.type === 'addition' ? 'bg-emerald-500' : 'bg-rose-500',
          )} />
          <b className="text-slate-800">{t.skuName}</b>
          <span>{t.type === 'addition' ? '+' : '−'}{fmt(t.qty)}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t.status}</span>
          {t.actionBy && <span className="text-slate-400">by {t.actionBy}</span>}
          <span className="ml-auto shrink-0 text-slate-400">{(t.actionAt || t.date || '').slice(0, 10)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Tab 2: Adjust Balance (rebalance · destock · loss/broken · found) ──── */

type AdjustOp = 'destock' | 'loss' | 'rebalance' | 'found';

const ADJUST_OPS: { key: AdjustOp; label: string; desc: string; sign: -1 | 0 | 1 }[] = [
  { key: 'destock', label: 'Destock / Issue out', desc: 'Remove stock given out directly — samples, events, giveaways…', sign: -1 },
  { key: 'loss', label: 'Loss / Broken', desc: 'Write off damaged or lost items from the balance', sign: -1 },
  { key: 'rebalance', label: 'Rebalance (stock count)', desc: 'Set the real counted balance after a physical count', sign: 0 },
  { key: 'found', label: 'Found / Return to stock', desc: 'Add back items found or returned without a ticket', sign: 1 },
];

function AdjustTab() {
  const { user } = useAuth();
  const { skus, csSkus, restockSku, mktDestockSku, csRestockSku, csDestockSku } = useData();
  const [wh, setWh] = useState<Wh>('mkt');
  const [op, setOp] = useState<AdjustOp>('destock');
  const [skuId, setSkuId] = useState('');
  const [qty, setQty] = useState('');
  const [broken, setBroken] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { busy, wrap } = useStockOp();

  const list = wh === 'mkt' ? skus : csSkus;
  const sku = list.find((s) => s.id === skuId);
  const def = ADJUST_OPS.find((o) => o.key === op)!;
  const nQty = Number(qty) || 0;
  const nBroken = Number(broken) || 0;
  const nCounted = Number(counted);
  const delta = op === 'rebalance' ? (counted === '' || !sku ? 0 : nCounted - sku.currentStock) : def.sign * nQty;
  const valid =
    !!sku &&
    (op === 'rebalance'
      ? counted !== '' && nCounted >= 0
      : nQty > 0 &&
        (def.sign !== -1 || nQty <= sku.currentStock) &&
        (op === 'loss' || nBroken <= nQty));

  const reset = () => { setSkuId(''); setQty(''); setBroken(''); setCounted(''); setReason(''); setConfirming(false); };

  const submit = async () => {
    if (!sku) return;
    const by = user?.fullName || 'system';
    const note = reason.trim() || def.label;
    let ok = false;
    if (op === 'rebalance') {
      const diff = nCounted - sku.currentStock;
      if (diff === 0) { toast('Counted balance already matches — nothing to adjust', 'error'); setConfirming(false); return; }
      ok = diff > 0
        ? await wrap(
            () => wh === 'mkt' ? restockSku(sku.id, diff, by, `Stock count rebalance — ${note}`) : csRestockSku(sku.id, diff, by, `Stock count rebalance — ${note}`),
            `${sku.name} rebalanced +${fmt(diff)} → ${fmt(nCounted)} ${sku.unit}`,
          )
        : await wrap(
            () => wh === 'mkt' ? mktDestockSku(sku.id, -diff, by, `Stock count rebalance — ${note}`) : csDestockSku(sku.id, -diff, by, `Stock count rebalance — ${note}`),
            `${sku.name} rebalanced −${fmt(-diff)} → ${fmt(nCounted)} ${sku.unit}`,
          );
    } else if (op === 'found') {
      ok = await wrap(
        () => wh === 'mkt' ? restockSku(sku.id, nQty, by, `Found / returned to stock — ${note}`) : csRestockSku(sku.id, nQty, by, `Found / returned to stock — ${note}`),
        `${sku.name} +${fmt(nQty)} ${sku.unit} — new balance ${fmt(sku.currentStock + nQty)}`,
      );
    } else {
      const label = op === 'loss' ? 'Loss/Broken write-off' : 'Direct destock';
      ok = await wrap(
        () => wh === 'mkt' ? mktDestockSku(sku.id, nQty, by, `${label} — ${note}`, op === 'loss' ? nQty : nBroken) : csDestockSku(sku.id, nQty, by, `${label} — ${note}`, op === 'loss' ? nQty : nBroken),
        `${sku.name} −${fmt(nQty)} ${sku.unit} — new balance ${fmt(Math.max(0, sku.currentStock - nQty))}`,
      );
    }
    if (ok) reset();
  };

  const opBtn = (key: AdjustOp) =>
    cn(
      'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition',
      op === key
        ? key === 'destock' || key === 'loss'
          ? 'border-rose-300 bg-rose-50 text-rose-700 ring-1 ring-rose-300'
          : key === 'found'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300'
            : 'border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300'
        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card card-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Adjust item balance</h2>
            <p className="text-xs text-slate-500">Corrections are logged immediately with your name — no approval ticket</p>
          </div>
          <WhToggle value={wh} onChange={(w) => { setWh(w); setSkuId(''); }} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ADJUST_OPS.map((o) => (
            <button key={o.key} className={opBtn(o.key)} onClick={() => setOp(o.key)} type="button">
              {o.label}
            </button>
          ))}
        </div>
        <p className="-mt-1 text-xs text-slate-500">{def.desc}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Item</label>
            <SkuSelect list={list} value={skuId} onChange={setSkuId} />
          </div>
          {op === 'rebalance' ? (
            <div>
              <label className="label">Counted balance (physical count)</label>
              <div className="flex items-center gap-2">
                <input className="input" type="number" min={0} placeholder={sku ? String(sku.currentStock) : '0'} value={counted} onChange={(e) => setCounted(e.target.value)} disabled={!sku} />
                {sku && <span className="shrink-0 text-xs text-slate-500">now: <b>{fmt(sku.currentStock)}</b></span>}
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" min={1} max={def.sign === -1 ? sku?.currentStock : undefined} value={qty} onChange={(e) => setQty(e.target.value)} disabled={!sku} placeholder="0" />
            </div>
          )}
          {op === 'destock' && (
            <div>
              <label className="label">Of which broken (optional)</label>
              <input className="input" type="number" min={0} max={nQty || undefined} value={broken} onChange={(e) => setBroken(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label">Reason / note</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count 2026-09, damaged at event, sample for client…" />
          </div>
        </div>

        {sku && delta !== 0 && (
          <p className={cn('text-sm font-semibold', delta > 0 ? 'text-emerald-600' : 'text-rose-600')}>
            {sku.name}: {fmt(sku.currentStock)} → <b>{fmt(Math.max(0, sku.currentStock + delta))}</b> {sku.unit} ({delta > 0 ? '+' : ''}{fmt(delta)})
          </p>
        )}

        <button className="btn btn-primary w-full sm:w-auto" disabled={!valid || busy} onClick={() => setConfirming(true)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply adjustment
        </button>
        {def.sign === -1 && op !== 'rebalance' && (
          <p className="text-xs text-slate-400">Deductions ask for confirmation — they cannot be undone (record a compensating adjustment if wrong).</p>
        )}
      </div>

      <aside className="card card-pad space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Recent adjustments ({wh === 'mkt' ? 'MKT' : 'CS'})</h3>
        <RecentMoves wh={wh} />
      </aside>

      {confirming && sku && (
        <Modal open onClose={() => setConfirming(false)} title="Confirm adjustment">
          <div className="space-y-3 text-sm">
            <p className="text-slate-600"><b className="text-slate-800">{def.label}</b> — {sku.name}</p>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
              <p>Balance: <b>{fmt(sku.currentStock)}</b> → <b>{fmt(Math.max(0, sku.currentStock + delta))}</b> {sku.unit}</p>
              {delta < 0 && (op === 'loss' || nBroken > 0) && <p className="text-rose-600">Recorded as loss/broken: {fmt(op === 'loss' ? nQty : nBroken)}</p>}
              {reason.trim() && <p className="mt-1 text-slate-500">Note: “{reason.trim()}”</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-outline btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button className={cn('btn btn-sm text-white', delta < 0 ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700')} disabled={busy} onClick={submit}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Yes, apply
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab 3: Transfer (MKT ⇄ CS) ─────────────────────────────────────────── */

function TransferTab() {
  const { user } = useAuth();
  const { skus, csSkus, transferMktToCs, transferCsToMkt } = useData();
  const [dir, setDir] = useState<'toCs' | 'toMkt'>('toCs');
  const [skuId, setSkuId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { busy, wrap } = useStockOp();

  const fromWh: Wh = dir === 'toCs' ? 'mkt' : 'cs';
  const list = dir === 'toCs' ? skus : csSkus;
  const other = (dir === 'toCs' ? csSkus : skus).find((s) => s.id === skuId);
  const sku = list.find((s) => s.id === skuId);
  const nQty = Number(qty) || 0;
  const valid = !!sku && nQty > 0 && nQty <= sku.currentStock;

  const submit = async () => {
    if (!sku) return;
    const by = user?.fullName || 'system';
    const ok = dir === 'toCs'
      ? await wrap(() => transferMktToCs(sku.id, nQty, by, note.trim() || undefined), `${sku.name}: ${fmt(nQty)} ${sku.unit} MKT → CS`)
      : await wrap(() => transferCsToMkt(sku.id, nQty, by), `${sku.name}: ${fmt(nQty)} ${sku.unit} CS → MKT`);
    if (ok) { setSkuId(''); setQty(''); setNote(''); setConfirming(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card card-pad space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Move stock between warehouses</h2>
          <p className="text-xs text-slate-500">
            {dir === 'toCs'
              ? 'MKT team sends items from the MKT warehouse to the CS warehouse — no ticket needed.'
              : 'CS team returns items from the CS warehouse back to the MKT warehouse.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <span className={cn('rounded-lg px-3 py-1.5 text-xs font-bold uppercase', dir === 'toCs' ? 'bg-white text-slate-800 ring-1 ring-slate-300' : 'text-slate-400')}>MKT</span>
          <button
            type="button"
            aria-label="Switch direction"
            onClick={() => { setDir((d) => (d === 'toCs' ? 'toMkt' : 'toCs')); setSkuId(''); }}
            className="rounded-full bg-brand-600 p-1.5 text-white shadow transition hover:bg-brand-700"
          >
            <ArrowLeftRight className="h-4 w-4 rotate-90" />
          </button>
          <span className={cn('rounded-lg px-3 py-1.5 text-xs font-bold uppercase', dir === 'toMkt' ? 'bg-white text-slate-800 ring-1 ring-slate-300' : 'text-slate-400')}>CS</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Item ({fromWh.toUpperCase()} warehouse)</label>
            <SkuSelect list={list} value={skuId} onChange={setSkuId} />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" type="number" min={1} max={sku?.currentStock} value={qty} onChange={(e) => setQty(e.target.value)} disabled={!sku} placeholder="0" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Refill CS booth stock for September" />
          </div>
        </div>

        {sku && nQty > 0 && (
          <p className={cn('text-sm font-semibold', nQty <= sku.currentStock ? 'text-slate-600' : 'text-rose-600')}>
            {sku.name}: {fmt(sku.currentStock)} {sku.unit} in {fromWh.toUpperCase()}
            {nQty <= sku.currentStock ? ` → transfer ${fmt(nQty)}` : ` — only ${fmt(sku.currentStock)} available`}
          </p>
        )}

        <button className="btn btn-primary w-full sm:w-auto" disabled={!valid || busy} onClick={() => setConfirming(true)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Transfer stock
        </button>
      </div>

      <aside className="card card-pad space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Destination stock</h3>
        <p className="text-xs text-slate-500">Quick view of the other warehouse while you plan the move.</p>
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {(dir === 'toCs' ? csSkus : skus).map((s) => (
            <li key={s.id} className="flex items-center justify-between text-xs">
              <span className="truncate text-slate-600">{s.name}</span>
              <b className="ml-2 shrink-0 tabular-nums text-slate-800">{fmt(s.currentStock)} {s.unit}</b>
            </li>
          ))}
        </ul>
      </aside>

      {confirming && sku && (
        <Modal open onClose={() => setConfirming(false)} title="Confirm transfer">
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Move <b className="text-slate-800">{fmt(nQty)} {sku.unit}</b> of <b className="text-slate-800">{sku.name}</b>{' '}
              from {fromWh.toUpperCase()} warehouse to {fromWh === 'mkt' ? 'CS' : 'MKT'} warehouse?
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
              <p>{fromWh.toUpperCase()} balance: <b>{fmt(sku.currentStock)}</b> → <b>{fmt(sku.currentStock - nQty)}</b></p>
              <p>{(fromWh === 'mkt' ? 'CS' : 'MKT')} balance: <b>{fmt(other ? other.currentStock : 0)}</b> → <b>{fmt((other ? other.currentStock : 0) + nQty)}</b></p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-outline btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn btn-sm bg-brand-600 text-white hover:bg-brand-700" disabled={busy} onClick={submit}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Yes, transfer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab 4: Stock In / Out (refill & issue with document references) ────── */

function StockIOTab() {
  const { user } = useAuth();
  const { skus, csSkus, transactions, csTransactions, restockSku, mktDestockSku, csRestockSku, csDestockSku } = useData();
  const [wh, setWh] = useState<Wh>('mkt');
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [skuId, setSkuId] = useState('');
  const [qty, setQty] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const { busy, wrap } = useStockOp();

  const list = wh === 'mkt' ? skus : csSkus;
  const sku = list.find((s) => s.id === skuId);
  const nQty = Number(qty) || 0;
  const valid = !!sku && nQty > 0 && (dir === 'in' || nQty <= sku.currentStock);

  const history = skuId ? (wh === 'mkt' ? transactions : csTransactions).filter((t) => t.skuId === skuId).slice(0, 6) : [];

  const submit = async () => {
    if (!sku) return;
    const by = user?.fullName || 'system';
    const refTxt = ref.trim() ? ` (ref: ${ref.trim()})` : '';
    const noteTxt = note.trim() ? ` — ${note.trim()}` : '';
    const ok = dir === 'in'
      ? await wrap(
          () => wh === 'mkt' ? restockSku(sku.id, nQty, by, `Stock refill${refTxt}${noteTxt}`) : csRestockSku(sku.id, nQty, by, `Stock refill${refTxt}${noteTxt}`),
          `${sku.name} +${fmt(nQty)} ${sku.unit} — new balance ${fmt(sku.currentStock + nQty)}`,
        )
      : await wrap(
          () => wh === 'mkt' ? mktDestockSku(sku.id, nQty, by, `Stock issue${refTxt}${noteTxt}`) : csDestockSku(sku.id, nQty, by, `Stock issue${refTxt}${noteTxt}`),
          `${sku.name} −${fmt(nQty)} ${sku.unit} — new balance ${fmt(sku.currentStock - nQty)}`,
        );
    if (ok) { setSkuId(''); setQty(''); setRef(''); setNote(''); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card card-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Stock In / Out</h2>
            <p className="text-xs text-slate-500">Refill stock or issue items out, tied to an invoice / delivery note / PO reference</p>
          </div>
          <WhToggle value={wh} onChange={(w) => { setWh(w); setSkuId(''); }} />
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {([['in', 'Stock In (+ refill)'], ['out', 'Stock Out (− issue)']] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setDir(k)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-bold transition',
                dir === k ? (k === 'in' ? 'bg-emerald-600 text-white shadow' : 'bg-rose-600 text-white shadow') : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Item</label>
            <SkuSelect list={list} value={skuId} onChange={setSkuId} />
          </div>
          <div>
            <label className="label">Quantity {dir === 'in' ? 'received' : 'issued'}</label>
            <input className="input" type="number" min={1} max={dir === 'out' ? sku?.currentStock : undefined} value={qty} onChange={(e) => setQty(e.target.value)} disabled={!sku} placeholder="0" />
          </div>
          <div>
            <label className="label">Document reference</label>
            <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice / Delivery note / PO no." />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier delivery, event issue…" />
          </div>
        </div>

        {sku && nQty > 0 && (
          <p className={cn('text-sm font-semibold', dir === 'out' && nQty > sku.currentStock ? 'text-rose-600' : dir === 'in' ? 'text-emerald-600' : 'text-slate-700')}>
            {sku.name}: {fmt(sku.currentStock)} → <b>{fmt(dir === 'in' ? sku.currentStock + nQty : Math.max(0, sku.currentStock - nQty))}</b> {sku.unit}
            {dir === 'out' && nQty > sku.currentStock ? ` — only ${fmt(sku.currentStock)} available` : ''}
          </p>
        )}

        <button className={cn('btn w-full text-white sm:w-auto', dir === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700')} disabled={!valid || busy} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record stock {dir === 'in' ? 'in' : 'out'}
        </button>
      </div>

      <aside className="card card-pad space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Item movement history</h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400">{sku ? 'No movements recorded for this item yet.' : 'Select an item to see its history.'}</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', t.type === 'addition' ? 'bg-emerald-500' : 'bg-rose-500')} />
                <b className="text-slate-800">{t.type === 'addition' ? '+' : '−'}{fmt(t.qty)}</b>
                <span className="truncate">{t.status || t.ticketId}</span>
                <span className="ml-auto shrink-0 text-slate-400">{(t.actionAt || t.date || '').slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/* ── Tab 5: SKU Setup (add · edit · remove · activate/deactivate) ───────── */

interface SkuForm {
  id?: string;
  isNew: boolean;
  wh: Wh;
  name: string;
  category: string;
  unit: string;
  openingBalance: string;
  currentStock: string;
  lowStockThreshold: string;
  costPerUnit: string;
  status: string;
  imageUrl?: string | null;      // existing saved photo URL
  photoFile?: File | null;       // newly selected photo (uploaded on save)
  photoPreview?: string | null;  // preview of the newly selected photo
}

const emptyForm = (wh: Wh): SkuForm => ({
  isNew: true, wh, name: '', category: '', unit: 'pcs',
  openingBalance: '0', currentStock: '0', lowStockThreshold: '0', costPerUnit: '0', status: 'active',
  imageUrl: null, photoFile: null, photoPreview: null,
});

function SkuTab() {
  const { user } = useAuth();
  const { skus, csSkus, categories, addSku, updateSku, deleteSku, csAddSku, csUpdateSku, csDeleteSku, restockSku, csRestockSku, mktDestockSku, csDestockSku, uploadSkuImage, deleteSkuImage, setSkuImage } = useData();
  const [wh, setWh] = useState<Wh>('mkt');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = useState<SkuForm | null>(null);
  const [deleting, setDeleting] = useState<(SKU | CS_SKU) | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const list = wh === 'mkt' ? skus : csSkus;
  const rows = useMemo(() => {
    let out = list;
    const term = q.trim().toLowerCase();
    if (term) out = out.filter((s) => (s.name || '').toLowerCase().includes(term) || (s.category || '').toLowerCase().includes(term));
    if (statusFilter !== 'all') out = out.filter((s) => (s.status || 'active') === statusFilter);
    return [...out].sort((a, b) => a.name.localeCompare(b.name, 'la'));
  }, [list, q, statusFilter]);

  const openEdit = (s: SKU | CS_SKU) =>
    setForm({
      id: s.id, isNew: false, wh,
      name: s.name, category: s.category || '', unit: s.unit || 'pcs',
      openingBalance: String(s.openingBalance ?? 0), currentStock: String(s.currentStock ?? 0),
      lowStockThreshold: String(s.lowStockThreshold ?? 0), costPerUnit: String(s.costPerUnit ?? 0),
      status: s.status || 'active',
      imageUrl: s.imageUrl || null, photoFile: null, photoPreview: null,
    });

  // ── photo picking / preview ───────────────────────────────────────────
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file (JPG / PNG / WebP…)', 'error'); return; }
    if (f.size > 6 * 1024 * 1024) { toast('Image must be 6 MB or smaller', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((p) => p && ({ ...p, photoFile: f, photoPreview: String(reader.result) }));
    reader.onerror = () => toast('Could not read the image file', 'error');
    reader.readAsDataURL(f);
  };
  const clearPhoto = () =>
    setForm((p) => p && ({ ...p, photoFile: null, photoPreview: null, imageUrl: null }));

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast('Item name is required', 'error'); return; }
    setBusy(true);
    const prevUrl = form.isNew ? null : (list.find((s) => s.id === form.id)?.imageUrl || null);
    try {
      // 1) Upload the newly chosen photo first → we get a permanent URL to save.
      let newImageUrl: string | null = null;
      if (form.photoFile) {
        setUploading(true);
        newImageUrl = await uploadSkuImage(form.photoFile);
      }
      const by = user?.fullName || 'system';
      const targetStock = Number(form.currentStock) || 0;
      const original = form.isNew
        ? undefined
        : list.find((s) => s.id === form.id);
      const diff = original ? targetStock - original.currentStock : 0;
      // For edits we do NOT send currentStock to updateSku — the balance delta is
      // applied exactly once through restock/destock so the movement is audited.
      const finalImageUrl = form.photoFile ? newImageUrl : (form.imageUrl ?? null);
      const imageChanged = !form.isNew && finalImageUrl !== prevUrl;
      const payload: Record<string, any> = {
        name: form.name.trim(), category: form.category.trim() || 'General', unit: form.unit.trim() || 'pcs',
        openingBalance: Number(form.openingBalance) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 0,
        costPerUnit: Number(form.costPerUnit) || 0,
        status: form.status,
      };
      if (form.isNew) {
        payload.currentStock = targetStock || undefined;
        payload.imageUrl = finalImageUrl; // new SKU → store the photo URL (or null)
        if (form.wh === 'mkt') await addSku(payload);
        else await csAddSku(payload);
        toast(`SKU “${payload.name}” created (${form.wh === 'mkt' ? 'MKT' : 'CS'} warehouse)`);
      } else {
        // manage_sku keeps the old image on null (coalesce), so only send the
        // URL when we actually set/replace one; clearing goes via setSkuImage.
        if (imageChanged && finalImageUrl !== null) payload.imageUrl = finalImageUrl;
        if (form.wh === 'mkt') await updateSku(form.id!, payload);
        else await csUpdateSku(form.id!, payload);
        if (imageChanged && finalImageUrl === null) await setSkuImage(form.id!, null, form.wh);
        if (diff !== 0) {
          // AUDIT: balance changed in SKU Setup → log a real stock movement
          const note = `Balance corrected via SKU Setup (${original!.currentStock} → ${targetStock})`;
          if (diff > 0) {
            if (form.wh === 'mkt') await restockSku(form.id!, diff, by, note);
            else await csRestockSku(form.id!, diff, by, note);
          } else {
            if (form.wh === 'mkt') await mktDestockSku(form.id!, -diff, by, note);
            else await csDestockSku(form.id!, -diff, by, note);
          }
        }
        toast(`SKU “${payload.name}” updated${diff !== 0 ? ` (balance ${diff > 0 ? '+' : ''}${diff} logged in movements)` : ''}`);
      }
      // 2) Clean up the previously stored photo once the new one is saved.
      if (imageChanged && prevUrl && prevUrl !== finalImageUrl) {
        try { await deleteSkuImage(prevUrl); } catch { /* non-fatal cleanup */ }
      }
      setForm(null);
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'error');
    } finally {
      setUploading(false);
      setBusy(false);
    }
  };

  const toggleStatus = async (s: SKU | CS_SKU) => {
    const next = (s.status || 'active') === 'inactive' ? 'active' : 'inactive';
    setBusy(true);
    try {
      if (wh === 'mkt') await updateSku(s.id, { status: next });
      else await csUpdateSku(s.id, { status: next });
      toast(next === 'inactive' ? `${s.name} deactivated — hidden from request/borrow` : `${s.name} activated`);
    } catch (e: any) {
      toast(e?.message || 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      if (wh === 'mkt') await deleteSku(deleting.id);
      else await csDeleteSku(deleting.id);
      toast(`${deleting.name} removed permanently`);
      setDeleting(null);
    } catch (e: any) {
      toast(e?.message || 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <WhToggle value={wh} onChange={setWh} />
        <input className="input w-52" placeholder="Search SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setForm(emptyForm(wh))}>
          <PlusCircle className="h-4 w-4" /> Add SKU
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head py-2.5 pl-4 pr-2">Item</th>
              <th className="table-head py-2.5 pr-2">Category</th>
              <th className="table-head py-2.5 pr-2">Stock</th>
              <th className="table-head py-2.5 pr-2">Cost</th>
              <th className="table-head py-2.5 pr-2">Status</th>
              <th className="table-head py-2.5 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className={cn('transition hover:bg-slate-50/70', s.status === 'inactive' && 'opacity-60')}>
                <td className="py-2.5 pl-4 pr-2">
                  <div className="flex items-center gap-2.5">
                    {s.imageUrl
                      ? <img src={safeImageUrl(s.imageUrl)} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200" loading="lazy" />
                      : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm">📦</span>}
                    <span className="font-semibold text-slate-800">{s.name}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-2 text-slate-500">{s.category || '—'}</td>
                <td className="py-2.5 pr-2"><b>{fmt(s.currentStock)}</b> <span className="text-xs text-slate-400">{s.unit}</span></td>
                <td className="py-2.5 pr-2 tabular-nums text-slate-600">{money(s.costPerUnit)}</td>
                <td className="py-2.5 pr-2"><StatusPill s={s} /></td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <button className="icon-btn" title="Edit SKU" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      className={cn('icon-btn', (s.status || 'active') === 'inactive' && 'text-emerald-600 hover:bg-emerald-50')}
                      title={(s.status || 'active') === 'inactive' ? 'Activate' : 'Deactivate (hide from requests)'}
                      disabled={busy} onClick={() => toggleStatus(s)}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button className="icon-btn text-rose-600 hover:bg-rose-50" title="Delete SKU" disabled={busy} onClick={() => setDeleting(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">No SKUs match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal open onClose={() => setForm(null)} title={form.isNew ? `Add SKU — ${form.wh.toUpperCase()} warehouse` : `Edit SKU — ${form.wh.toUpperCase()} warehouse`}>
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              {(form.photoPreview || form.imageUrl)
                ? <img src={safeImageUrl(form.photoPreview || form.imageUrl || '')} alt="SKU preview" className="h-full w-full object-cover" />
                : <span className="text-2xl">📦</span>}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">SKU profile photo</p>
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-outline btn-sm cursor-pointer">
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {!uploading && <ImagePlus className="h-3.5 w-3.5" />}
                  {uploading ? 'Uploading…' : 'Choose photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
                </label>
                {(form.photoPreview || form.imageUrl) && (
                  <button className="btn btn-outline btn-sm" onClick={clearPhoto} disabled={uploading}>Remove</button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                JPG / PNG / WebP up to 6 MB — uploaded to Supabase Storage on save and shown across the app.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Item name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gold Tee — Black / XL" />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" list="sku-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Merch / Booth…" />
              <datalist id="sku-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs / box…" />
            </div>
            {form.isNew ? (
              <div>
                <label className="label">Opening balance</label>
                <input className="input" type="number" min={0} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
              </div>
            ) : (
              <div>
                <label className="label">Current stock</label>
                <input className="input" type="number" min={0} value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">Low stock threshold</label>
              <input className="input" type="number" min={0} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
            </div>
            <div>
              <label className="label">Cost per unit (₭)</label>
              <input className="input" type="number" min={0} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active — visible in request/borrow</option>
                <option value="inactive">Inactive — hidden from request/borrow</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {form.isNew ? 'Create SKU' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Delete SKU">
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Permanently remove <b className="text-slate-800">{deleting.name}</b> from the {wh === 'mkt' ? 'MKT' : 'CS'} warehouse?
            </p>
            <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-200">
              This cannot be undone. Past tickets and reports keep their records, but the item disappears from stock lists and
              can no longer be requested. Prefer <b>Deactivate</b> if you only want to hide it.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700" disabled={busy} onClick={doDelete}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete permanently
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}









