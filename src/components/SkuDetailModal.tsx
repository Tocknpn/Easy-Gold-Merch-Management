// ── Item detail (Dashboard → click an item) ───────────────────────────────
// Read-only card + the item's stock card: every movement in date order with a
// running balance, and each row linked to where it came from — the ticket
// (TKT-…) or, for manual movements, Ticket Tracking → Stock Movements filtered
// to this item on the day it was recorded.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, History, Package } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { Modal, Badge } from '@/components/ui/primitives';
import { cn, dayOf, fmt, money, safeImageUrl } from '@/lib/utils';
import { CAT_LABEL, CAT_STYLE, catOf, ticketRefOf } from '@/lib/movementCategory';
import type { SKU, StockTransaction } from '@/lib/types';

interface Line {
  tx: StockTransaction;
  cat: ReturnType<typeof catOf>;
  /** signed effect on this warehouse's stock (0 for a cancelled row) */
  signed: number;
  /** stock right after this movement (null for a cancelled row) */
  balance: number | null;
  ticket: string | null;
  /** the day the movement was recorded (filters Stock Movements) */
  actionDay: string;
}

export function SkuDetailModal({ sku, warehouse, onClose }: {
  sku: SKU; warehouse: 'mkt' | 'cs'; onClose: () => void;
}) {
  const { transactions, csTransactions, tickets } = useData();
  const navigate = useNavigate();
  const wh = warehouse === 'cs' ? 'CS' : 'MKT';

  const lines = useMemo<Line[]>(() => {
    const dead = new Set(tickets.filter((t) => t.status === 'rejected' || t.status === 'recalled').map((t) => t.id));
    const rows = (warehouse === 'cs' ? csTransactions : transactions)
      .filter((t) => t.skuId === sku.id)
      // newest first: ledger date, then the moment it was recorded, then id
      .sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
        || String(b.actionAt || '').localeCompare(String(a.actionAt || ''))
        || (b.id ?? 0) - (a.id ?? 0));
    // Walk back from today's stock: the balance after a row = current stock
    // minus every counted movement dated after it.
    let after = sku.currentStock;
    return rows.map((tx) => {
      const cat = catOf(tx, dead);
      const counted = cat !== 'cancelled';
      const signed = counted ? (tx.type === 'addition' ? tx.qty : -tx.qty) : 0;
      const balance = counted ? after : null;
      after -= signed;
      return {
        tx, cat, signed, balance,
        ticket: ticketRefOf(tx),
        actionDay: dayOf(tx.actionAt) || String(tx.date || '').slice(0, 10),
      };
    });
  }, [warehouse, csTransactions, transactions, tickets, sku.id, sku.currentStock]);

  const low = sku.currentStock <= sku.lowStockThreshold;
  const out = sku.currentStock <= 0;
  const totalValue = sku.currentStock * sku.costPerUnit;
  const usage = sku.totalInflow > 0 ? Math.max(0, ((sku.totalInflow - sku.currentStock) / sku.totalInflow) * 100) : 0;
  const totals = lines.reduce(
    (a, l) => (l.signed > 0 ? { ...a, in: a.in + l.signed } : { ...a, out: a.out - l.signed }),
    { in: 0, out: 0 },
  );

  const go = (to: string) => { onClose(); navigate(to); };
  const openTicket = (id: string) => go(`/ticket-tracking?ticket=${encodeURIComponent(id)}`);
  const openMoves = (day?: string) => {
    const p = new URLSearchParams({ scope: 'moves', q: sku.name, wh });
    if (day) { p.set('from', day); p.set('to', day); }
    go(`/ticket-tracking?${p.toString()}`);
  };

  return (
    <Modal open onClose={onClose} title={sku.name} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          {sku.imageUrl
            ? <img src={safeImageUrl(sku.imageUrl)} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
            : (
              <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                <Package className="h-7 w-7" />
              </span>
            )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={out ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : low ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}>
                {out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock'}
              </Badge>
              <Badge className="bg-slate-100 text-slate-600">{warehouse === 'cs' ? 'CS Warehouse' : 'MKT Warehouse'}</Badge>
              <span className="text-xs text-slate-400">{sku.id}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <Detail label="Category" value={sku.category || '—'} />
              <Detail label="Unit" value={sku.unit || 'pcs'} />
              <Detail label="Cost / unit" value={money(sku.costPerUnit)} />
              <Detail label="Total value" value={money(totalValue)} />
              <Detail label="Opening" value={fmt(sku.openingBalance)} />
              <Detail label="Current" value={fmt(sku.currentStock)} />
              <Detail label="Total inflow" value={fmt(sku.totalInflow)} />
              <Detail label="Usage" value={`${usage.toFixed(0)}%`} />
            </div>
          </div>
        </div>
        {/* ── stock card ── */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <History className="h-4 w-4 text-slate-400" /> Transaction history
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
              {lines.length} {lines.length === 1 ? 'movement' : 'movements'}
            </span>
            <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
              <span className="font-semibold text-emerald-600">In {fmt(totals.in)}</span>
              <span className="font-semibold text-rose-600">Out {fmt(totals.out)}</span>
            </span>
          </header>

          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No movements recorded for this item yet.</p>
          ) : (
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[6.5rem]" />
                  <col className="w-[9.5rem]" />
                  <col className="w-[5rem]" />
                  <col className="w-[4.5rem]" />
                  <col />
                  <col className="w-[10.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-3 py-2">Movement</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Linked to</th>
                    <th className="px-4 py-2">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const dead = l.cat === 'cancelled';
                    const inbound = l.tx.type === 'addition';
                    return (
                      <tr key={`${l.tx.id}-${l.tx.date}`} className={cn('align-middle', dead && 'text-slate-400')}>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-600">
                          {String(l.tx.date || '').slice(0, 10) || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {/* One chip per row: the ledger status stays in the tooltip
                              (and the screen reader label) instead of a second line. */}
                          <span
                            className={cn(
                              'inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold leading-4',
                              CAT_STYLE[l.cat],
                            )}
                            title={l.tx.status ? `${CAT_LABEL[l.cat]} · ${l.tx.status}` : CAT_LABEL[l.cat]}
                            aria-label={l.tx.status ? `${CAT_LABEL[l.cat]}, ${l.tx.status}` : CAT_LABEL[l.cat]}
                          >
                            {CAT_LABEL[l.cat]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <span className={cn(
                            'inline-flex items-center justify-end gap-1 font-semibold tabular-nums',
                            dead ? 'text-slate-400 line-through' : inbound ? 'text-emerald-600' : 'text-rose-600',
                          )}>
                            {inbound
                              ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                              : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
                            {inbound ? '+' : '−'}{fmt(l.tx.qty)}
                          </span>
                        </td>
                        <td className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', l.balance !== null && l.balance < 0 ? 'font-semibold text-rose-600' : 'text-slate-700')}>
                          {l.balance === null ? '—' : fmt(l.balance)}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.ticket ? (
                            <button
                              type="button"
                              onClick={() => openTicket(l.ticket!)}
                              title={`Open ticket ${l.ticket}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-brand-50/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden /> {l.ticket}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openMoves(l.actionDay)}
                              title={`Open Stock Movements for ${sku.name} on ${l.actionDay}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden /> Stock Movements · {l.actionDay}
                            </button>
                          )}
                        </td>
                        <td className="max-w-[11rem] truncate px-4 py-2.5 text-slate-500" title={l.tx.actionBy || undefined}>
                          {l.tx.actionBy || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] text-slate-500">
            <span>Balance = stock after each movement, counted back from today&apos;s {fmt(sku.currentStock)} {sku.unit || 'pcs'}. Cancelled rows don&apos;t count.</span>
            <button
              type="button"
              onClick={() => openMoves()}
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Full movement history <ExternalLink className="h-3 w-3" aria-hidden />
            </button>
          </footer>
        </section>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  );
}
