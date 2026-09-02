import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Modal, Badge, toast } from '@/components/ui/primitives';
import { fmt, money, safeImageUrl } from '@/lib/utils';
import type { SKU } from '@/lib/types';

export function SkuDetailModal({ sku, warehouse, onClose }: {
  sku: SKU; warehouse: 'mkt' | 'cs'; onClose: () => void;
}) {
  const { user } = useAuth();
  const { transactions, csTransactions, restockSku, csRestockSku, csDestockSku } = useData();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const tx = warehouse === 'cs' ? csTransactions : transactions;
  const history = useMemo(() => tx.filter((t) => t.skuId === sku.id).slice(0, 12), [tx, sku.id]);
  const low = sku.currentStock <= sku.lowStockThreshold;
  const out = sku.currentStock <= 0;
  const totalValue = sku.currentStock * sku.costPerUnit;
  const usage = sku.totalInflow > 0 ? Math.max(0, ((sku.totalInflow - sku.currentStock) / sku.totalInflow) * 100) : 0;
  const isRated = ['admin', 'warehouse', 'customer_service'].includes(user?.role || '');

  const doRestock = async () => {
    const n = Number(qty);
    if (!(n > 0)) { toast('Enter a quantity greater than 0', 'error'); return; }
    try {
      if (warehouse === 'cs') await csRestockSku(sku.id, n, user?.fullName, note || undefined);
      else await restockSku(sku.id, n, user?.fullName, note || undefined);
      toast(`${sku.name} restocked +${n}`); setQty(''); setNote('');
    } catch (e: any) { toast(e?.message || 'Restock failed', 'error'); }
  };
  const doDestock = async () => {
    const n = Number(qty);
    if (!(n > 0)) { toast('Enter a quantity greater than 0', 'error'); return; }
    try {
      await csDestockSku(sku.id, n, user?.fullName, note || undefined);
      toast(`${sku.name} destocked -${n}`); setQty(''); setNote('');
    } catch (e: any) { toast(e?.message || 'Destock failed', 'error'); }
  };

  return (
    <Modal open onClose={onClose} title={sku.name} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          {sku.imageUrl
            ? <img src={safeImageUrl(sku.imageUrl)} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
            : <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-2xl">📦</span>}
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
{isRated && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <label className="label">Quantity</label>
              <input className="input w-28" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input className="input w-52" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new batch" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-success btn-sm" onClick={doRestock}>+ Restock</button>
              {warehouse === 'cs' && <button className="btn btn-danger btn-sm" onClick={doDestock}>− Destock</button>}
            </div>
          </div>
        )}

        <div>
          <p className="label">Recent transactions</p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3.5 py-2">Date</th>
                  <th className="px-3.5 py-2">Type</th>
                  <th className="px-3.5 py-2 text-right">Qty</th>
                  <th className="px-3.5 py-2">Status</th>
                  <th className="px-3.5 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length === 0 && (
                  <tr><td colSpan={5} className="px-3.5 py-4 text-center text-slate-400">No transactions yet</td></tr>
                )}
                {history.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3.5 py-2 text-slate-600">{(t.date || '').slice(0, 10)}</td>
                    <td className="px-3.5 py-2">
                      <span className={t.type === 'addition' ? 'font-medium text-emerald-600' : 'font-medium text-rose-500'}>
                        {t.type === 'addition' ? 'Stock in' : 'Stock out'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right font-semibold">{fmt(t.qty)}</td>
                    <td className="px-3.5 py-2 text-slate-600">{t.status || t.ticketId || '—'}</td>
                    <td className="px-3.5 py-2 text-slate-500">{t.actionBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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