// ── Core domain types (mirror the legacy app + Supabase schema) ───────────
export type UserRole =
  | 'staff' | 'warehouse' | 'line_manager' | 'director'
  | 'admin' | 'finance' | 'customer_service' | 'hr' | 'pa';

export type WarehouseScope = 'mkt' | 'cs';

export type TicketStatus =
  | 'pending' | 'reviewed' | 'lm_approved' | 'finalized'
  | 'rejected' | 'returned' | 'recalled';

export type TicketType = 'request' | 'borrow' | 'cs_transfer';

export interface AppUser {
  id: string;
  username?: string;
  email: string;
  fullName: string;
  department: string;
  role: UserRole;
  status: string;
  password?: string; // demo-only, never shipped from Supabase
}

export interface SKU {
  id: string;
  name: string;
  category?: string;
  unit: string;
  openingBalance: number;
  currentStock: number;
  totalInflow: number;
  imageUrl?: string | null;
  lowStockThreshold: number;
  costPerUnit: number;
  createdAt?: string | null;
  status?: string | null; // 'active' | 'inactive' — inactive SKUs are hidden from request/borrow pickers
}

export interface TicketItem {
  skuId: string;
  skuName: string;
  qtyRequested: number;
  qtyApproved?: number | null;
  unit?: string;
}

export interface Ticket {
  id: string;
  createdBy: string;      // email or user id
  createdByName: string;
  department: string;
  deliveryDate?: string | null;
  remark?: string | null;
  status: TicketStatus;
  type: TicketType;
  returnDate?: string | null;
  createdAt?: string | null;
  whComment?: string | null;
  lmComment?: string | null;
  directorComment?: string | null;
  lastActionAt?: string | null;
  lastActionBy?: string | null;
  lastActionStatus?: string | null;
  lastActionComment?: string | null;
  actualDeliveryDate?: string | null;
  actualReturnDate?: string | null;
  returnedProcessed?: boolean;
}

export interface StockTransaction {
  id?: number;
  ticketId?: string | null;
  skuId?: string | null;
  skuName?: string | null;
  qty: number;
  qtyBroken?: number;
  type: 'addition' | 'deduction';
  date?: string | null;
  actionAt?: string | null;
  actionBy?: string | null;
  status?: string | null;
  comment?: string | null;
}

export interface TicketAction {
  id?: number;
  ticketId?: string | null;
  action?: string | null;
  status?: string | null;
  actionAt?: string | null;
  actionBy?: string | null;
  comment?: string | null;
  role?: string | null;
}

export interface SkuRemark {
  skuId?: string | null;
  remark?: string | null;
  userName?: string | null;
  userRole?: string | null;
  createdAt?: string | null;
}

export interface CS_SKU extends SKU {}
export type CS_Transaction = StockTransaction;

export interface SystemConfig {
  [key: string]: string;
}

export const CURRENCY = '₭';

export const ROLE_LABELS: Record<string, string> = {
  staff: 'Staff',
  warehouse: 'Warehouse Manager',
  line_manager: 'Line Manager',
  director: 'Director',
  admin: 'Admin',
  finance: 'Finance',
  customer_service: 'Customer Service',
  hr: 'HR',
  pa: 'PA',
};

export const NORMAL_ROLES: UserRole[] = [
  'staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service',
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  lm_approved: 'LM Approved',
  finalized: 'Finalized',
  rejected: 'Rejected',
  returned: 'Returned',
  recalled: 'Recalled',
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reviewed: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  lm_approved: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  finalized: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  returned: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  recalled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export const TYPE_LABELS: Record<TicketType, string> = {
  request: 'Request',
  borrow: 'Borrow',
  cs_transfer: 'CS Transfer',
};

export function castNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calculateTicketTotal(ticket: TicketWithItems, skus: SKU[]): number {
  return ticket.items.reduce((sum, it) => {
    const sku = skus.find((s) => s.id === it.skuId);
    return sum + (it.qtyApproved ?? it.qtyRequested) * (sku?.costPerUnit ?? 0);
  }, 0);
}

export interface TicketWithItems extends Ticket {
  items: TicketItem[];
}