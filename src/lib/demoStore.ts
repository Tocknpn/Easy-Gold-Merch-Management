// ── In-memory demo engine: data + reads ─────────────────────────────────
import demo from './demo-data.json';
import type {
  AppUser, SKU, CS_SKU, Ticket, TicketWithItems, StockTransaction, CS_Transaction,
  TicketAction, SkuRemark, UserRole, AuditEntry, AuditModule,
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
  /** Explicit audit rows (master data / settings / user accounts). The
   *  ticket + ledger + remark history is derived on read in demoAudit.ts. */
  audit: AuditEntry[];
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
  audit: [],
};

// ── Audit helpers (mirror the audit_row() trigger of 0016) ───────────────
// Demo mode has no triggers, so the master-data / settings / user mutations
// call pushAudit() explicitly and the ledger / ticket / remark history is
// derived on read (see demoAudit.ts).
let _auditSeq = 0;
export const nextAuditId = (): number => ++_auditSeq;

/** Who is signed in (demo mode has no server-side JWT to resolve). */
function sessionActor(): Pick<AuditEntry, 'actorName' | 'actorRole' | 'actorEmail'> {
  try {
    const raw = localStorage.getItem('sf_user');
    if (!raw) return { actorName: null, actorRole: null, actorEmail: null };
    const u = JSON.parse(raw) as { fullName?: string; email?: string; role?: string };
    return {
      actorName: u.fullName || u.email || null,
      actorRole: u.role || null,
      actorEmail: u.email || null,
    };
  } catch {
    return { actorName: null, actorRole: null, actorEmail: null };
  }
}

export function pushAudit(
  entry: Partial<AuditEntry> & { module: AuditModule; action: string; summary: string },
): void {
  demoDB.audit.unshift({
    id: nextAuditId(),
    at: new Date().toISOString(),
    ...sessionActor(),
    actorId: null,
    entity: null,
    entityId: null,
    entityName: null,
    warehouse: null,
    refTicket: null,
    amount: null,
    comment: null,
    changes: [],
    origin: 'app',
    ...entry,
  });
}

// ── Ledger row ids ────────────────────────────────────────────────────────
// Live rows carry the DB identity (bigint) id; the Stock Movements editor
// (migration 0015) targets ONE row by id in both modes, so seeded demo rows
// get ids at load time and every demo mutation assigns the next one.
let _txSeq = 0;
export const nextLedgerId = (): number => ++_txSeq;
for (const t of demoDB.transactions) if (t.id == null) t.id = nextLedgerId();
for (const t of demoDB.csTransactions) if (t.id == null) t.id = nextLedgerId();

// Millisecond keys collide when two ids are created in the same ms (two rapid
// ticket submissions, a burst of SKU adds, …) — append a per-ms sequence so
// demo ids are unique too (live uses the same ms scheme; see finding §B).
let _lastMs = -1;
let _seqMs = 0;
const nextId = (prefix: string): string => {
  const ms = Math.floor(Date.now());
  if (ms === _lastMs) _seqMs += 1; else { _lastMs = ms; _seqMs = 0; }
  return `${prefix}${ms}${_seqMs === 0 ? '' : '-' + _seqMs}`;
};
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