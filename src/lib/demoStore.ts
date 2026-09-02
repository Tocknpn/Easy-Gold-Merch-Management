// ── In-memory demo engine: data + reads ─────────────────────────────────
import demo from './demo-data.json';
import type {
  AppUser, SKU, CS_SKU, Ticket, TicketWithItems, StockTransaction, CS_Transaction,
  TicketAction, SkuRemark, UserRole,
} from './types';
import { castNumber } from './types';
import { todayStr } from './utils';

export interface DemoDB {
  users: AppUser[];
  skus: SKU[];
  csSkus: CS_SKU[];
  tickets: Ticket[];
  items: Record<string, { skuId: string; skuName: string; qtyRequested: number; qtyApproved: number | null; unit: string }[]>;
  transactions: StockTransaction[];
  csTransactions: CS_Transaction[];
  actions: TicketAction[];
  categories: string[];
  config: Record<string, string>;
  remarks: SkuRemark[];
}

const raw = demo as any;

const normRole = (r: string): UserRole => {
  const m: Record<string, UserRole> = {
    staff: 'staff', warehouse: 'warehouse', 'warehouse manager': 'warehouse',
    'line manager': 'line_manager', 'line_manager': 'line_manager',
    director: 'director', admin: 'admin',
    finance: 'finance', 'customer service': 'customer_service',
    customer_service: 'customer_service', hr: 'hr', pa: 'pa',
  };
  return m[String(r || '').toLowerCase().trim()] || 'staff';
};

const itemGroup = (t: any) => ({
  skuId: t.skuId, skuName: t.skuName, qtyRequested: castNumber(t.qtyRequested),
  qtyApproved: t.qtyApproved === null || t.qtyApproved === undefined ? null : castNumber(t.qtyApproved),
  unit: t.unit || 'pcs',
});

export const demoDB: DemoDB = {
  users: (raw.users || []).map((u: any) => ({
    id: u.id, username: u.email, email: u.email, fullName: u.fullName,
    department: u.department, role: normRole(u.role), status: u.status || 'Active', password: u.password,
  })),
  skus: (raw.skus || []).map((s: any) => ({ ...s, unit: s.unit || 'pcs', status: s.status || 'active' })),
  csSkus: (raw.csSkus || []).map((s: any) => ({ ...s, unit: s.unit || 'pcs', status: s.status || 'active' })),
  tickets: (raw.tickets || []).map((t: any) => ({ ...t })),
  items: Object.fromEntries((raw.ticketItems || []).map((g: any) => [g.ticketId, g.items.map(itemGroup)])),
  transactions: (raw.transactions || []).map((t: any) => ({ ...t })),
  csTransactions: (raw.csTransactions || []).map((t: any) => ({ ...t })),
  actions: (raw.actions || []).map((a: any) => ({ ...a })),
  categories: [...(raw.categories || [])],
  config: { ...(raw.config || {}) },
  remarks: (raw.remarks || []).map((r: any) => ({ ...r })),
};

const nextId = (prefix: string) => prefix + Math.floor(Date.now()).toString();
export { nextId };

export function demoLogin(email: string, password: string): AppUser {
  const u = demoDB.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!u) throw new Error('User not found');
  if (String(u.status).toLowerCase() === 'inactive') throw new Error('Account is inactive');
  if (u.password !== password) throw new Error('Invalid password');
  return { id: u.id, email: u.email, fullName: u.fullName, department: u.department, role: u.role, status: u.status, username: u.username };
}

export function demoTicketsWithItems(): TicketWithItems[] {
  return demoDB.tickets.map((t) => ({ ...t, items: (demoDB.items[t.id] || []).map((i) => ({ ...i })) }));
}