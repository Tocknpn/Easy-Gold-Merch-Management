import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Minus, Trash2, Send, Loader2, ShoppingBag, Package, ArrowUpDown, Check, MousePointerClick, FilePlus2, Repeat } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/primitives';
import { cn, fmt, money, safeImageUrl, todayStr } from '@/lib/utils';
import type { SKU, TicketType } from '@/lib/types';

// ── shop-style product helpers ─────────────────────────────────────────────

function SkuThumb({ sku, className }: { sku: SKU; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = safeImageUrl(sku.imageUrl);
  if (!url || broken) {
    return (
      <div className={cn('flex items-center justify-center bg-gradient-to-br from-brand-100 via-white to-accent-100 text-brand-300', className)}>
        <Package className="h-8 w-8" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={sku.name}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}

function QtyStepper({ qty, onSet }: { qty: number; onSet: (n: number) => void }) {
  // Local "draft" allows the user to blank the field (Del) to type a new amount
  // WITHOUT un-selecting the item — the cart only changes on a valid number,
  // and blur restores the previous quantity if still empty.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (n: number) => {
    setDraft(null);
    onSet(n);
  };

  return (
    <div className="no-print inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => commit(Math.max(0, qty - 1))}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-l-xl text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        className="h-8 w-14 border-x border-slate-200 text-center text-sm font-semibold text-slate-800 outline-none"
        value={draft ?? String(qty)}
        inputMode="numeric"
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          if (raw !== '' && Number.isFinite(n)) commit(Math.max(0, Math.floor(n)));
        }}
        onBlur={() => setDraft(null)}
        aria-label="Quantity to order"
      />
      <button
        type="button"
        onClick={() => commit(qty + 1)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-r-xl text-slate-500 transition hover:bg-slate-50 hover:text-brand-600"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StockBadge({ sku }: { sku: SKU }) {
  const stock = sku.currentStock;
  const threshold = sku.lowStockThreshold ? sku.lowStockThreshold : 0;
  const tone =
    stock === 0
      ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
      : stock <= threshold
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  const label =
    stock === 0
      ? 'Out of stock'
      : stock <= threshold
        ? `Low stock · ${fmt(stock)} left`
        : `In stock · ${fmt(stock)} ${sku.unit}`;
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset', tone)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stock === 0 ? 'bg-rose-500' : stock <= threshold ? 'bg-amber-500' : 'bg-emerald-500')} />
      {label}
    </span>
  );
}

// ── shared request/borrow form (pick & shop) ───────────────────────────────

export function TicketForm({
  mode,
  onModeChange,
}: {
  mode: 'request' | 'borrow';
  onModeChange?: (m: 'request' | 'borrow') => void;
}) {
  const { user } = useAuth();
  const { skus: allSkus, loading, createTicket } = useData();
  // Inactive SKUs (disabled in Manage Stock → SKU Setup) are hidden from the shop picker
  const skus = useMemo(() => allSkus.filter((s) => s.status !== 'inactive'), [allSkus]);
  const navigate = useNavigate();
  const isBorrow = mode === 'borrow';
  const isCS = user?.role === 'customer_service';

  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [sortBy, setSortBy] = useState('name-asc');
  const [delivery, setDelivery] = useState(todayStr());
  const [returnDate, setReturnDate] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(skus.map((s) => s.category).filter((c): c is string => Boolean(c))))],
    [skus],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = [...skus]
      .filter((s) => cat === 'All' || s.category === cat)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q));
    switch (sortBy) {
      case 'name-desc':
        arr.sort((a, b) => b.name.localeCompare(a.name, 'la'));
        break;
      case 'stock-low':
        arr.sort((a, b) =>
          (a.currentStock === 0 ? 1 : 0) - (b.currentStock === 0 ? 1 : 0) || a.currentStock - b.currentStock,
        );
        break;
      case 'stock-high':
        arr.sort((a, b) =>
          (b.currentStock === 0 ? 1 : 0) - (a.currentStock === 0 ? 1 : 0) || b.currentStock - a.currentStock,
        );
        break;
      case 'price-low':
        arr.sort((a, b) => a.costPerUnit - b.costPerUnit);
        break;
      case 'price-high':
        arr.sort((a, b) => b.costPerUnit - a.costPerUnit);
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name, 'la'));
    }
    return arr;
  }, [skus, search, cat, sortBy]);

  const qtyOf = (id: string) => cart[id] || 0;
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = skus.reduce((sum, s) => sum + s.costPerUnit * qtyOf(s.id), 0);
  const cartRows = skus.filter((s) => qtyOf(s.id) > 0);

  const addToCart = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const setQty = (id: string, raw: string) =>
    setCart((c) => {
      const n = Math.max(0, Math.floor(Number(raw) || 0));
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  const clearCart = () => setCart({});

  const submit = async () => {
    const items = cartRows.map((s) => ({
      skuId: s.id, skuName: s.name, qtyRequested: qtyOf(s.id), unit: s.unit || 'pcs',
    }));
    if (items.length === 0) { toast('Add at least one item to your cart', 'error'); return; }
    if (isBorrow && !returnDate) { toast('Return date is required for borrows', 'error'); return; }
    setBusy(true);
    try {
      const type: TicketType = isBorrow ? 'borrow' : isCS ? 'cs_transfer' : 'request';
      await createTicket({
        createdBy: user?.email || user?.id || '',
        createdByName: user?.fullName || '',
        department: user?.department || '',
        deliveryDate: delivery || null,
        remark,
        type,
        returnDate: isBorrow ? returnDate || null : null,
        items,
      });
      toast('Ticket submitted (Pending)');
      navigate('/ticket-tracking');
    } catch (e: any) {
      toast(e?.message || 'Failed to create ticket', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {onModeChange ? 'Request' : isBorrow ? 'Item Borrow' : 'New Request'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isBorrow
              ? 'Picking items to borrow — they must come back by the return date below.'
              : 'Pick the items you need and submit for approval.'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
          <ShoppingBag className="h-4 w-4 text-brand-600" />
          <span>
            <b className="text-slate-800">{totalItems}</b> item{totalItems === 1 ? '' : 's'} · <b className="text-slate-800">{money(subtotal)}</b>
          </span>
        </div>
      </div>

      {isCS && !isBorrow && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          💡 This request will be fulfilled from the <b>MKT Warehouse</b>. Once approved, items are added to your <b>CS Warehouse</b>.
        </div>
      )}
      {isBorrow && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          🔁 Borrowed items must be returned by the <b>return date</b>. Lost or damaged items are charged at the listed value.
        </div>
      )}

      {/* Toolbar: search + sort + categories */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Search items by name or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative w-full sm:w-56 shrink-0">
            <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select className="input pl-10 pr-9" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name-asc">Sort · Name A→Z</option>
              <option value="name-desc">Sort · Name Z→A</option>
              <option value="stock-low">Sort · In stock first</option>
              <option value="stock-high">Sort · Most stock</option>
              <option value="price-low">Sort · Price low → high</option>
              <option value="price-high">Sort · Price high → low</option>
            </select>
          </div>
          <p className="shrink-0 text-xs text-slate-500">
            {filtered.length} of {skus.length} items
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                cat === c ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog + cart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Product catalog */}
        <div>
          {loading && skus.length === 0 ? (
            <div className="card flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading items…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card flex h-64 flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
              <Package className="h-10 w-10" />
              <p className="text-sm font-semibold text-slate-500">No items match your filters</p>
              <p className="text-xs">Try a different search or category.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <MousePointerClick className="h-3.5 w-3.5 text-brand-500" />
                Tap an item to select it — tap again to remove it
              </div>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((sku) => {
                const qty = qtyOf(sku.id);
                const inCart = qty > 0;
                const out = sku.currentStock <= 0;
                const overStock = !out && qty > sku.currentStock;
                const canSelect = !out;
                return (
                  <div
                    key={sku.id}
                    role="button"
                    tabIndex={canSelect ? 0 : -1}
                    aria-pressed={inCart}
                    aria-disabled={!canSelect}
                    onClick={() => canSelect && (inCart ? setQty(sku.id, '0') : addToCart(sku.id))}
                    onKeyDown={(e) => {
                      if (!canSelect) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (inCart) setQty(sku.id, '0');
                        else addToCart(sku.id);
                      }
                    }}
                    className={cn(
                      'card group flex items-center gap-3 p-2.5 transition',
                      out
                        ? 'cursor-not-allowed select-none border-slate-200 bg-slate-50 opacity-60 grayscale'
                        : 'cursor-pointer select-none',
                      inCart
                        ? 'bg-brand-50/60 ring-2 ring-brand-500/70'
                        : 'hover:shadow-md hover:ring-1 hover:ring-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70',
                    )}
                    title={out ? 'Out of stock — not available' : inCart ? 'Click to remove from selection' : 'Click to select'}
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      <SkuThumb sku={sku} className="h-full w-full object-cover" />
                      {inCart && (
                        <>
                          <span className="absolute inset-0 grid place-items-center bg-brand-600/35">
                            <Check className="h-7 w-7 text-white drop-shadow-sm" />
                          </span>
                          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-lg bg-brand-600 text-[10px] font-bold text-white shadow">
                            {qty}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="relative min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-semibold', out ? 'text-slate-400' : 'text-slate-800')}>{sku.name}</p>
                      {sku.name.length > 16 && (
                        <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden max-w-[280px] whitespace-normal break-words rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg group-hover:block">
                          {sku.name}
                        </span>
                      )}
                      <p className="truncate text-[11px] text-slate-400">{sku.category || 'General'} · {sku.unit}</p>
                      <div className="mt-1.5">
                        <StockBadge sku={sku} />
                      </div>
                      <p className={cn('mt-1 text-xs font-bold leading-none', out ? 'text-slate-400' : 'text-brand-700')}>
                        {money(sku.costPerUnit)}
                      </p>
                      {overStock && (
                        <p className="mt-1 text-[10px] font-medium text-amber-600">
                          Only {fmt(sku.currentStock)} now — rest from restock
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                      {inCart && <QtyStepper qty={qty} onSet={(n) => setQty(sku.id, String(n))} />}
                    </div>
                  </div>
                );
              })}
              </div>{/* end grid */}
            </>
          )}
        </div>
        {/* Cart / checkout */}
        <aside id="cart-summary" className="scroll-mt-20 lg:sticky lg:top-6 lg:h-fit">
          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <ShoppingBag className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Your cart</p>
                  <p className="text-[11px] text-slate-400">
                    {totalItems === 0 ? 'Nothing selected yet' : `${totalItems} item${totalItems === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              {totalItems > 0 && (
                <button type="button" onClick={clearCart} className="btn btn-ghost btn-sm text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>

            {onModeChange && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  {(['request', 'borrow'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onModeChange(m)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition',
                        mode === m ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-200' : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      {m === 'request' ? <FilePlus2 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
                      {m === 'request' ? 'Request' : 'Borrow'}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {isBorrow
                    ? 'Borrow — you must return the items by the return date below.'
                    : 'Request — items are fulfilled from stock after approval.'}
                </p>
              </div>
            )}

            {cartRows.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <Package className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Your cart is empty</p>
                <p className="max-w-[220px] text-xs text-slate-400">
                  Tap an item in the list to add it to your cart.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {cartRows.map((sku) => {
                    const qty = qtyOf(sku.id);
                    return (
                      <div key={sku.id} className="flex items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <SkuThumb sku={sku} className="h-full w-full object-cover" />
                          <span className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-bl-lg bg-brand-600 text-[9px] font-bold text-white">
                            {qty}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">{sku.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {money(sku.costPerUnit)} / {sku.unit}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <QtyStepper qty={qty} onSet={(n) => setQty(sku.id, String(n))} />
                          <button
                            type="button"
                            onClick={() => setQty(sku.id, '0')}
                            className="text-[10px] font-semibold text-rose-500 hover:text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{totalItems} item{totalItems === 1 ? '' : 's'}</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900">
                    <span>Estimated value</span>
                    <span>{money(subtotal)}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="label">Delivery date</label>
                    <input className="input" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
                  </div>
                  {isBorrow && (
                    <div>
                      <label className="label">Return date *</label>
                      <input className="input" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="label">Remark / purpose</label>
                    <input
                      className="input"
                      placeholder="Optional note for the warehouse / LM"
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                    />
                  </div>
                </div>

                <button type="button" className="btn btn-primary mt-4 w-full" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {busy ? 'Submitting…' : isBorrow ? 'Submit Borrow Request' : 'Submit Request'}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile floating checkout bar */}
      {totalItems > 0 && (
        <a
          href="#cart-summary"
          className="no-print fixed inset-x-4 bottom-4 z-40 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-pop lg:hidden"
        >
          <ShoppingBag className="h-4 w-4 text-brand-300" />
          <span>{totalItems} {totalItems === 1 ? 'item' : 'items'} · {money(subtotal)}</span>
          <span className="ml-auto text-brand-300">Review cart →</span>
        </a>
      )}
    </div>
  );
}