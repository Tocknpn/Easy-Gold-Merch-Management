import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── toast system (module-level store) ───────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; msg: string; type: ToastType }

let listeners: ((t: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];
let nextId = 1;

export function toast(msg: string, type: ToastType = 'success') {
  const item = { id: nextId++, msg, type };
  toasts = [...toasts, item];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => dismissToast(item.id), 4200);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l(toasts));
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.push(setItems);
    setItems(toasts);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm no-print">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-2.5 rounded-xl border bg-white px-4 py-3 shadow-pop animate-slide-in-right text-sm',
            t.type === 'error' ? 'border-rose-200' : t.type === 'info' ? 'border-sky-200' : 'border-emerald-200',
          )}
        >
          {t.type === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />}
          {t.type === 'error' && <AlertCircle className="mt-0.5 h-4 w-4 text-rose-600 shrink-0" />}
          {t.type === 'info' && <Info className="mt-0.5 h-4 w-4 text-sky-600 shrink-0" />}
          <span className="flex-1 text-slate-700">{t.msg}</span>
          <button onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────
export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, icon, tone = 'blue',
}: {
  label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode;
  tone?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-brand-50 text-brand-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="card card-pad flex items-start gap-3 animate-fade-in">
      {icon && <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────
export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className={cn('my-6 w-full rounded-2xl bg-white shadow-pop animate-scale-in', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Segmented control ───────────────────────────────────────────────────
export function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 no-print">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[10px] px-3.5 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Spinner / states ────────────────────────────────────────────────────
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {sub && <p className="max-w-sm text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function ErrorBanner({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div className="card card-pad flex items-start gap-3 border-rose-200 bg-rose-50">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
        <p className="mt-1 text-xs text-rose-600">{msg}</p>
      </div>
      {retry && <button onClick={retry} className="btn btn-secondary btn-sm">Retry</button>}
    </div>
  );
}