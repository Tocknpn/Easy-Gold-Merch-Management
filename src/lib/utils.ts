import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CURRENCY } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (n: number | string | null | undefined): string =>
  Number(n || 0).toLocaleString('en-US');

export const money = (n: number | string | null | undefined): string =>
  CURRENCY + fmt(Math.round(Number(n || 0)));

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local (device timezone) YYYY-MM-DD of a timestamp — the Audit page groups
 *  and date-filters by this, so "today" means today where the user sits. */
export function dayOf(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Shifts a YYYY-MM-DD string by whole days (negative = earlier). */
export function shiftDay(dayStr: string, days: number): string {
  const [y, m, d] = String(dayStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dayStr;
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function safeImageUrl(url?: string | null): string {
  if (!url) return '';
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/uc?id=${m[1]}`;
  return url;
}

export function lastActionWhen(t?: string | null): string {
  if (!t) return '—';
  try {
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return t;
  }
}

/** Full date + time label — used for approval comments ("who commented when"). */
export function whenDateTime(t?: string | null): string {
  if (!t) return '—';
  try {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t;
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return t;
  }
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const NAMED_COLORS = [
  '#2563eb', '#0ea5e9', '#06b6d4', '#10b981', '#f59e0b',
  '#f43f5e', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];
export const unitColor = (unit: string): string => {
  let h = 0;
  for (const ch of unit) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return NAMED_COLORS[h % NAMED_COLORS.length];
};