// ── Unified data API: Supabase (live) or in-memory demo (preview) ────────
// DataContext uses ONLY this module, so the app runs identically in both modes.
import { isSupabaseConfigured, supabase } from './supabase';
import * as demoRead from './demoStore';
import * as demoWrite from './demoMutations';
import * as demoData from './demoData';
import * as demoAudit from './demoAudit';
import type {
  AppUser, SKU, CS_SKU, Ticket, TicketWithItems, StockTransaction, CS_Transaction,
  TicketAction, SkuRemark, TicketStatus, TicketType, SystemConfig, AuditEntry,
  TicketEdit, TicketEditChange, TicketEditLine,
} from './types';
import { castNumber } from './types';
import { shiftDay } from './utils';

export interface DataBundle {
  users: AppUser[];
  skus: SKU[];
  csSkus: CS_SKU[];
  tickets: TicketWithItems[];
  transactions: StockTransaction[];
  csTransactions: CS_Transaction[];
  actions: TicketAction[];
  categories: string[];
  config: SystemConfig;
  remarks: SkuRemark[];
  /** Admin ticket edits (migration 0024), newest first. */
  ticketEdits: TicketEdit[];
  mode: 'demo' | 'supabase';
}

export const isLive = () => isSupabaseConfigured();

// ── login ────────────────────────────────────────────────────────────────
export async function apiLogin(email: string, password: string): Promise<AppUser> {
  if (!isLive()) {
    return demoRead.demoLogin(email, password);
  }
  const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error.message));
  const { data: profile } = await supabase!
    .from('users')
    .select('id,username,email,full_name,department,role,status')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (!profile) throw new Error('No application profile found for this account');
  if (String(profile.status || '').toLowerCase() !== 'active') {
    await supabase!.auth.signOut().catch(() => {});
    throw new Error('Account is inactive');
  }
  return {
    id: profile.id, username: profile.username, email: profile.email,
    fullName: profile.full_name || email, department: profile.department || '',
    role: (profile.role || 'staff') as AppUser['role'], status: profile.status || 'Active',
  };
}

const mapAuthError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Invalid password';
  if (m.includes('not found')) return 'User not found';
  if (m.includes('inactive') || m.includes('banned')) return 'Account is inactive';
  if (m.includes('already registered')) return 'Account already registered';
  return msg;
};
// ── bundle ───────────────────────────────────────────────────────────────
export async function apiFetchBundle(): Promise<DataBundle> {
  if (!isLive()) {
    const tickets = demoRead.demoTicketsWithItems();
    return {
      users: demoRead.demoDB.users.map(({ password: _pw, ...u }) => u),
      skus: [...demoRead.demoDB.skus],
      csSkus: [...demoRead.demoDB.csSkus],
      tickets,
      transactions: [...demoRead.demoDB.transactions],
      csTransactions: [...demoRead.demoDB.csTransactions],
      actions: [...demoRead.demoDB.actions],
      categories: [...demoRead.demoDB.categories],
      config: { ...demoRead.demoDB.config },
      remarks: [...demoRead.demoDB.remarks],
      ticketEdits: demoRead.demoDB.ticketEdits.map((e) => ({ ...e, changes: e.changes.map((c) => ({ ...c })) })),
      mode: 'demo',
    };
  }

  const [
    usersRes, skusRes, csSkusRes, ticketsRes, itemsRes,
    txRes, csTxRes, actionsRes, catsRes, cfgRes, remarksRes, editsRes,
  ] = await Promise.all([
    supabase!.from('users').select('id,username,email,full_name,department,role,status'),
    supabase!.from('skus').select('*').order('name'),
    supabase!.from('cs_skus').select('*').order('name'),
    supabase!.from('tickets').select('*').order('created_at', { ascending: false }),
    supabase!.from('ticket_items').select('*'),
    supabase!.from('stock_transactions').select('*').order('action_at', { ascending: false }),
    supabase!.from('cs_transactions').select('*').order('action_at', { ascending: false }),
    supabase!.from('ticket_actions').select('*').order('action_at', { ascending: false }),
    supabase!.from('categories').select('name'),
    supabase!.from('system_config').select('key,value,description'),
    supabase!.from('sku_remarks').select('*').order('created_at', { ascending: false }),
    supabase!.from('ticket_edits').select('*').order('at', { ascending: false }),
  ]);
  // ticket_edits is optional: before migration 0024 is applied the table does
  // not exist — the app still loads, it just has no edit history to show.
  const ticketEdits: TicketEdit[] = editsRes.error ? [] : (editsRes.data as any[]).map(mapTicketEdit);
  for (const r of [usersRes, skusRes, csSkusRes, ticketsRes, itemsRes, txRes, csTxRes, actionsRes, catsRes, cfgRes, remarksRes]) {
    if (r.error) throw new Error(r.error.message);
  }
  const skus = (skusRes.data as any[]).map(rowToSku);
  const csSkus = (csSkusRes.data as any[]).map(rowToSku);

  const itemsByTicket = new Map<string, Record<string, unknown>[]>();
  for (const it of itemsRes.data as any[]) {
    const arr = itemsByTicket.get(it.ticket_id) || [];
    arr.push(it);
    itemsByTicket.set(it.ticket_id, arr);
  }
  const tickets: TicketWithItems[] = (ticketsRes.data as any[]).map((t) => ({
    id: t.id, createdBy: t.created_by || '', createdByName: t.created_by_name || '',
    department: t.department || '', deliveryDate: t.delivery_date, remark: t.remark,
    status: t.status, type: (t.type || 'request') as TicketType, returnDate: t.return_date,
    createdAt: t.created_at, whComment: t.wh_comment, lmComment: t.lm_comment,
    directorComment: t.director_comment,
    whCommentAt: t.wh_comment_at, lmCommentAt: t.lm_comment_at, directorCommentAt: t.director_comment_at,
    lastActionAt: t.last_action_at, lastActionBy: t.last_action_by,
    lastActionStatus: t.last_action_status, lastActionComment: t.last_action_comment,
    actualDeliveryDate: t.actual_delivery_date, actualReturnDate: t.actual_return_date,
    returnedProcessed: t.status === 'returned',
    items: (itemsByTicket.get(t.id) || []).map((i: any) => ({
      skuId: i.sku_id, skuName: i.sku_name, qtyRequested: castNumber(i.qty_requested),
      qtyApproved: i.qty_approved === null ? null : castNumber(i.qty_approved),
      unit: i.unit || 'pcs',
    })),
  }));

  return {
    users: (usersRes.data as any[]).map((u: any) => ({
      id: u.id, username: u.username, email: u.email, fullName: u.full_name,
      department: u.department || '', role: (u.role || 'staff') as AppUser['role'], status: u.status || 'Active',
    })),
    skus, csSkus, tickets,
    transactions: mapTx(txRes.data as any[]),
    csTransactions: (csTxRes.data as any[]).map((t: any) => ({
      id: t.id, ticketId: t.ticket_id, skuId: t.sku_id, skuName: t.sku_name, qty: castNumber(t.qty),
      type: t.type, date: t.date, actionAt: t.action_at, actionBy: t.action_by, comment: t.comment,
      status: t.status ?? null,
      editedBy: t.edited_by ?? null, editedAt: t.edited_at ?? null,
    })),
    actions: (actionsRes.data as any[]).map((a: any) => ({
      id: a.id, ticketId: a.ticket_id, action: a.action, status: a.status,
      actionAt: a.action_at, actionBy: a.action_by, comment: a.comment, role: a.role,
    })),
    categories: (catsRes.data as any[]).map((c) => c.name),
    config: Object.fromEntries((cfgRes.data as any[]).map((c) => [c.key, c.value])),
    remarks: (remarksRes.data as any[]).map((r: any) => ({
      skuId: r.sku_id, remark: r.remark, userName: r.user_name, userRole: r.user_role, createdAt: r.created_at,
    })),
    ticketEdits,
    mode: 'supabase',
  };
}

const mapTicketEdit = (r: any): TicketEdit => ({
  id: Number(r.id),
  ticketId: r.ticket_id,
  at: r.at,
  actorName: r.actor_name ?? null,
  actorRole: r.actor_role ?? null,
  remark: r.remark || '',
  changes: (Array.isArray(r.changes) ? r.changes : []).map((c: any): TicketEditChange => ({
    skuId: c.sku_id, skuName: c.sku_name || c.sku_id,
    from: castNumber(c.from), to: castNumber(c.to), delta: castNumber(c.delta),
    action: c.action,
  })),
});

const rowToSku = (r: any): SKU => ({
  id: r.id, name: r.name, category: r.category || '', unit: r.unit || 'pcs',
  openingBalance: castNumber(r.opening_balance), currentStock: castNumber(r.current_stock),
  totalInflow: castNumber(r.total_inflow), imageUrl: r.image_url, lowStockThreshold: castNumber(r.low_stock_threshold),
  costPerUnit: castNumber(r.cost_per_unit), createdAt: r.created_at, status: r.status || 'active',
});

const mapTx = (rows: any[]): StockTransaction[] =>
  rows.map((t: any) => ({
    id: t.id, ticketId: t.ticket_id, skuId: t.sku_id, skuName: t.sku_name, qty: castNumber(t.qty),
    qtyBroken: castNumber(t.qty_broken), type: t.type, date: t.date, actionAt: t.action_at,
    actionBy: t.action_by, status: t.status, comment: t.comment,
    editedBy: t.edited_by ?? null, editedAt: t.edited_at ?? null,
  }));
// ── audit trail (Admin → Audit Trail) ────────────────────────────────────
// Rows live in `public.audit_log` (migration 0016) and are written by
// database triggers — the app only ever READS them, and RLS only returns rows
// to an Admin, so a non-admin session gets an empty list (never an error).
// Fetched on demand (not part of the shared data bundle) so the bundle stays
// small for everyone else.
const AUDIT_COLUMNS =
  'id,at,actor_id,actor_name,actor_email,actor_role,module,action,entity,entity_id,entity_name,' +
  'warehouse,ref_ticket,amount,summary,comment,changes,origin';

const mapAudit = (r: any): AuditEntry => ({
  id: Number(r.id),
  at: r.at,
  actorId: r.actor_id ?? null,
  actorName: r.actor_name ?? null,
  actorEmail: r.actor_email ?? null,
  actorRole: r.actor_role ?? null,
  module: (r.module || 'app') as AuditEntry['module'],
  action: r.action || 'update',
  entity: r.entity ?? null,
  entityId: r.entity_id ?? null,
  entityName: r.entity_name ?? null,
  warehouse: r.warehouse ?? null,
  refTicket: r.ref_ticket ?? null,
  amount: r.amount == null ? null : castNumber(r.amount),
  summary: r.summary || '',
  comment: r.comment ?? null,
  changes: Array.isArray(r.changes) ? r.changes : [],
  origin: r.origin ?? null,
});

export async function apiFetchAudit(
  opts: { from?: string | null; to?: string | null; limit?: number } = {},
): Promise<AuditEntry[]> {
  const limit = Math.max(1, Math.min(opts.limit || 300, 2000));
  if (!isLive()) return demoAudit.demoFetchAudit({ ...opts, limit });

  let q = supabase!
    .from('audit_log')
    .select(AUDIT_COLUMNS)
    .order('at', { ascending: false })
    .limit(limit);
  // The date range is padded by one day so no row can fall outside a
  // timezone-shifted boundary — the page re-filters by the local day.
  if (opts.from) q = q.gte('at', shiftDay(opts.from, -1));
  if (opts.to) q = q.lte('at', shiftDay(opts.to, 1) + 'T23:59:59.999Z');

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as any[]).map(mapAudit);
}

// ── mutations ────────────────────────────────────────────────────────────
export async function apiCreateTicket(p: {
  createdBy: string; createdByName: string; department: string;
  deliveryDate?: string | null; remark?: string; type: TicketType; returnDate?: string | null;
  items: { skuId: string; skuName: string; qtyRequested: number; unit?: string }[];
}): Promise<{ id: string }> {
  if (!isLive()) {
    return { id: demoWrite.demoCreateTicket(p) };
  }
  const { data, error } = await supabase!.rpc('create_ticket', {
    p_created_by: p.createdBy,
    p_created_by_name: p.createdByName,
    p_department: p.department,
    p_delivery_date: p.deliveryDate || null,
    p_remark: p.remark || '',
    p_type: p.type,
    p_return_date: p.returnDate || null,
    p_items: p.items.map((i) => ({ sku_id: i.skuId, sku_name: i.skuName, qty_requested: i.qtyRequested, unit: i.unit || 'pcs' })),
  });
  if (error) throw new Error(error.message);
  const res = data as any;
  if (!res.success) throw new Error(res.error || 'Failed to create ticket');
  return { id: res.id };
}

export async function apiUpdateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  meta: {
    actorName: string; actorRole: string; comment?: string;
    actualDeliveryDate?: string | null; items?: ({ skuId: string; qtyApproved: number })[] | null;
    returns?: ({ skuId: string; qtyReturned: number; qtyBroken: number })[] | null;
    forceFinalize?: boolean;
  },
): Promise<void> {
  if (!isLive()) {
    return demoWrite.demoUpdateTicketStatus(ticketId, status, meta);
  }
  const { data, error } = await supabase!.rpc('update_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
    p_meta: {
      actor_name: meta.actorName,
      actor_role: meta.actorRole,
      comment: meta.comment || '',
      actual_delivery_date: meta.actualDeliveryDate || null,
      // The engine reads e->>'sku_id' / e->>'qty_approved', so items must be
      // snake_case like `returns` below — sending camelCase silently made the
      // warehouse's adjusted approved quantities fall back to qty_requested.
      items: (meta.items || []).map((i) => ({ sku_id: i.skuId, qty_approved: i.qtyApproved })),
      returns: (meta.returns || []).map((r) => ({ sku_id: r.skuId, qty_returned: r.qtyReturned, qty_broken: r.qtyBroken })),
      force_finalize: meta.forceFinalize || false,
    },
  });
  if (error) throw new Error(error.message);
  const res = data as any;
  if (!res.success) throw new Error(res.error || 'Update failed');
}

// ── Admin "Edit Ticket" (migration 0024) ─────────────────────────────────
// Adjust / add / remove items on a finalized ticket. The engine validates every
// line before writing anything (all-or-nothing), refuses stale edits via the
// per-line expectedQty, writes append-only ledger rows dated today and records
// one ticket_edits row + an 'Edited' ticket_actions row. Admin is enforced from
// the JWT; the editor identity is passed only for the demo engine.
export async function apiEditTicket(
  ticketId: string,
  lines: TicketEditLine[],
  remark: string,
  editor?: { name?: string | null; role?: string | null },
): Promise<{ editId: number }> {
  if (!isLive()) {
    return { editId: demoWrite.demoEditTicket(ticketId, lines, remark, editor?.name || '', editor?.role || '') };
  }
  const { data, error } = await supabase!.rpc('edit_ticket', {
    p_ticket_id: ticketId,
    p_items: lines.map((l) => ({ sku_id: l.skuId, qty: l.qty, expected_qty: l.expectedQty })),
    p_remark: remark,
  });
  if (error) {
    if (/edit_ticket/.test(error.message) && /(not find|does not exist)/i.test(error.message)) {
      throw new Error('Edit Ticket is not installed on the database yet — apply migration 0024_edit_ticket.sql');
    }
    throw new Error(error.message);
  }
  const res = data as any;
  if (!res?.success) throw new Error(res?.error || 'Edit failed');
  return { editId: Number(res.edit_id) };
}
// ── re-exports of the mutation API (single import point for callers) ────
export {
  apiAddSku, apiUpdateSku, apiDeleteSku, apiRestockSku, apiEditStockMovement,
  apiCsAddSku, apiCsUpdateSku, apiCsDeleteSku, apiCsRestockSku, apiCsDestockSku,
  apiMktDestockSku, apiTransferMktToCs,
  apiTransferCsToMkt, apiManageConfig, apiManageCategory, apiAddRemark,
  apiAddUser, apiUpdateUser, apiSetUserPassword, apiSetUserStatus,
  apiDeleteUser, apiRevealUserPassword,
} from './apiMutations';
export { apiUploadSkuImage, apiDeleteSkuImage, apiSetSkuImage } from './apiMutations';