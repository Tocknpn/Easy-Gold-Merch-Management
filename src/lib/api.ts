// ── Unified data API: Supabase (live) or in-memory demo (preview) ────────
// DataContext uses ONLY this module, so the app runs identically in both modes.
import { isSupabaseConfigured, supabase } from './supabase';
import * as demoRead from './demoStore';
import * as demoWrite from './demoMutations';
import * as demoData from './demoData';
import type {
  AppUser, SKU, CS_SKU, Ticket, TicketWithItems, StockTransaction, CS_Transaction,
  TicketAction, SkuRemark, TicketStatus, TicketType, SystemConfig,
} from './types';
import { castNumber } from './types';

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
  if (m.includes('inactive')) return 'Account is inactive';
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
      mode: 'demo',
    };
  }

  const [
    usersRes, skusRes, csSkusRes, ticketsRes, itemsRes,
    txRes, csTxRes, actionsRes, catsRes, cfgRes, remarksRes,
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
  ]);
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
    directorComment: t.director_comment, lastActionAt: t.last_action_at, lastActionBy: t.last_action_by,
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
    mode: 'supabase',
  };
}

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
  }));
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
      items: meta.items || [],
      returns: (meta.returns || []).map((r) => ({ sku_id: r.skuId, qty_returned: r.qtyReturned, qty_broken: r.qtyBroken })),
      force_finalize: meta.forceFinalize || false,
    },
  });
  if (error) throw new Error(error.message);
  const res = data as any;
  if (!res.success) throw new Error(res.error || 'Update failed');
}
// ── re-exports of the mutation API (single import point for callers) ────
export {
  apiAddSku, apiUpdateSku, apiDeleteSku, apiRestockSku,
  apiCsAddSku, apiCsUpdateSku, apiCsDeleteSku, apiCsRestockSku, apiCsDestockSku,
  apiMktDestockSku, apiTransferMktToCs,
  apiTransferCsToMkt, apiManageConfig, apiManageCategory, apiAddRemark,
} from './apiMutations';
export { apiUploadSkuImage, apiDeleteSkuImage, apiSetSkuImage } from './apiMutations';