// ── Data mutations (Supabase RPC + demo-mode fallbacks) ─────────────────
import { isLive } from './api';
import { supabase } from './supabase';
import * as demoData from './demoData';
import type { SKU, CS_SKU, NewUserInput, UserRole, MovementEditPatch } from './types';

const row = (s: Partial<SKU | CS_SKU>) => ({
  ...(s.id ? { id: s.id } : {}),
  name: s.name, category: s.category, unit: s.unit,
  opening_balance: s.openingBalance, current_stock: s.currentStock,
  total_inflow: s.totalInflow, image_url: s.imageUrl,
  low_stock_threshold: s.lowStockThreshold, cost_per_unit: s.costPerUnit,
  qty: (s as any).qty,
  ...(s.status ? { status: s.status } : {}),
});

const ok = (d: any) => {
  if (!d || !d.success) throw new Error(d?.error || 'Operation failed');
};

export async function apiAddSku(sku: Partial<SKU>): Promise<string> {
  if (!isLive()) return demoData.demoAddSku(sku);
  const { data, error } = await supabase!.rpc('manage_sku', { p_action: 'add', p_sku: row(sku) });
  if (error) throw new Error(error.message);
  ok(data);
  return (data as any).id;
}

/**
 * Result of a SKU update. `openingDelta` is the baseline delta the database
 * engine applied; it comes back `null` when the connected database is still
 * running the pre-0013 `manage_sku` (no baseline handling) so the UI can tell
 * the user to apply migration 0013 instead of silently saving an
 * unreconciled opening balance.
 */
export interface SkuUpdateResult { openingDelta: number | null }

const openingDeltaOf = (d: any): number | null => {
  const v = (d as any)?.opening_delta;
  return v === undefined || v === null ? null : Number(v);
};

export async function apiUpdateSku(id: string, updates: Partial<SKU>): Promise<SkuUpdateResult> {
  if (!isLive()) return { openingDelta: demoData.demoUpdateSku(id, updates) };
  const { data, error } = await supabase!.rpc('manage_sku', { p_action: 'update', p_sku: { id, ...row(updates) } });
  if (error) throw new Error(error.message);
  ok(data);
  return { openingDelta: openingDeltaOf(data) };
}

export async function apiDeleteSku(id: string): Promise<void> {
  if (!isLive()) return demoData.demoDeleteSku(id);
  const { data, error } = await supabase!.rpc('manage_sku', { p_action: 'delete', p_sku: { id } });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiRestockSku(id: string, qty: number, actionBy?: string, comment?: string): Promise<void> {
  if (!isLive()) return demoData.demoRestockSku(id, qty, actionBy, comment);
  const { data, error } = await supabase!.rpc('manage_sku', {
    p_action: 'restock', p_sku: { id, qty }, p_remark: comment || null, p_action_by: actionBy || null,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

// ── Edit an existing stock movement row (migration 0015) ─────────────────
// Fixes a wrong refill / issue amount AT THE SOURCE: the ledger row is edited
// and the SKU baseline is re-synced by the same delta, so Stock In / Stock Out
// reporting shows the right numbers without compensating entries.
// Authorization is enforced by the RPC from the JWT (admin = both warehouses,
// warehouse = MKT rows, customer_service = CS rows); the editor identity is
// passed only for the demo engine, which has no server session.
export async function apiEditStockMovement(
  warehouse: 'mkt' | 'cs',
  txId: number,
  patch: MovementEditPatch,
  reason: string,
  editor?: { name?: string | null; role?: string | null },
): Promise<void> {
  if (!isLive()) {
    return demoData.demoEditStockMovement(warehouse, txId, patch, reason, editor?.name || '', editor?.role || '');
  }
  const p: Record<string, unknown> = {};
  if (patch.qty !== undefined) p.qty = patch.qty;
  if (patch.qtyBroken !== undefined) p.qty_broken = patch.qtyBroken;
  if (patch.date !== undefined) p.date = patch.date;
  if (patch.actionBy !== undefined) p.action_by = patch.actionBy;
  const { data, error } = await supabase!.rpc('edit_stock_movement', {
    p_warehouse: warehouse,
    p_tx_id: txId,
    p_patch: p,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

// ── CS SKU management ───────────────────────────────────────────────────
export async function apiCsAddSku(sku: Partial<CS_SKU>): Promise<string> {
  if (!isLive()) return demoData.demoCsAddSku(sku);
  const { data, error } = await supabase!.rpc('manage_cs_sku', { p_action: 'add', p_sku: row(sku) });
  if (error) throw new Error(error.message);
  ok(data);
  return (data as any).id;
}

export async function apiCsUpdateSku(id: string, updates: Partial<CS_SKU>): Promise<SkuUpdateResult> {
  if (!isLive()) return { openingDelta: demoData.demoCsUpdateSku(id, updates) };
  const { data, error } = await supabase!.rpc('manage_cs_sku', { p_action: 'update', p_sku: { id, ...row(updates) } });
  if (error) throw new Error(error.message);
  ok(data);
  return { openingDelta: openingDeltaOf(data) };
}

export async function apiCsDeleteSku(id: string): Promise<void> {
  if (!isLive()) return demoData.demoCsDeleteSku(id);
  const { data, error } = await supabase!.rpc('manage_cs_sku', { p_action: 'delete', p_sku: { id } });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiCsRestockSku(id: string, qty: number, actionBy?: string, comment?: string): Promise<void> {
  if (!isLive()) return demoData.demoCsRestockSku(id, qty, actionBy, comment);
  const { data, error } = await supabase!.rpc('manage_cs_sku', {
    p_action: 'restock', p_sku: { id, qty }, p_comment: comment || null, p_action_by: actionBy || null,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiCsDestockSku(id: string, qty: number, actionBy?: string, comment?: string, broken = 0): Promise<void> {
  if (!isLive()) return demoData.demoCsDestockSku(id, qty, actionBy, comment, broken);
  const { data, error } = await supabase!.rpc('manage_cs_sku', {
    p_action: 'destock', p_sku: { id, qty }, p_comment: comment || null, p_action_by: actionBy || null,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

// ── MKT warehouse direct destock (issue out / loss write-off) ───────────
export async function apiMktDestockSku(id: string, qty: number, actionBy?: string, comment?: string, broken = 0): Promise<void> {
  if (!isLive()) return demoData.demoMktDestockSku(id, qty, actionBy, comment, broken);
  const { data, error } = await supabase!.rpc('manage_sku', {
    p_action: 'destock', p_sku: { id, qty }, p_remark: comment || null, p_action_by: actionBy || null,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

// ── MKT → CS transfer (done by the MKT team) ────────────────────────────
// The whole move runs INSIDE the `transfer_mkt_to_cs` RPC (migration 0018), so
// it is one transaction and can never debit MKT while leaving CS empty. The RPC
// also auto-creates the CS item on its first arrival, stamped as that item's
// OPENING ledger row.
//
// Why it must not be done with direct table writes any more: every app table has
// RLS enabled and only SELECT policies exist, so `supabase.from('cs_skus')
// .insert(...)` is rejected — and supabase-js RETURNS that error instead of
// throwing, which silently swallowed it (MKT was debited via the manage_sku RPC,
// the CS warehouse received nothing).
export async function apiTransferMktToCs(skuId: string, qty: number, actionBy: string, comment?: string): Promise<void> {
  if (!isLive()) return demoData.demoTransferMktToCs(skuId, qty, actionBy, comment);
  const { data, error } = await supabase!.rpc('transfer_mkt_to_cs', {
    p_sku_id: skuId, p_qty: qty, p_action_by: actionBy, p_comment: comment || null,
  });
  if (error) throw new Error(error.message);
  ok(data);
}
// ── CS → MKT transfer ───────────────────────────────────────────────────
export async function apiTransferCsToMkt(skuId: string, qty: number, actionBy: string): Promise<void> {
  if (!isLive()) return demoData.demoTransferCsToMkt(skuId, qty, actionBy);
  const { data, error } = await supabase!.rpc('transfer_cs_to_mkt', {
    p_sku_id: skuId, p_qty: qty, p_action_by: actionBy,
  });
  if (error) throw new Error(error.message);
  ok(data);
}

// ── config / category / remark ───────────────────────────────────────────
export async function apiManageConfig(key: string, value: string): Promise<void> {
  if (!isLive()) return demoData.demoManageConfig(key, value);
  const { error } = await supabase!.rpc('manage_config', { p_key: key, p_value: value });
  if (error) throw new Error(error.message);
}

// ── SKU photo upload (Supabase Storage bucket "sku-images") ─────────────
const SKU_IMAGE_BUCKET = 'sku-images';

/**
 * Upload a SKU profile photo to Supabase Storage and return its public URL.
 * The caller then saves that URL into the SKU (imageUrl) via updateSku/addSku.
 * In demo mode the file is read as a data URL so the preview keeps working offline.
 */
export async function apiUploadSkuImage(file: File): Promise<string> {
  if (!isLive()) return demoData.demoUploadSkuImage(file);
  const path = `skus/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase!.storage.from(SKU_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw new Error(error.message);
  const { data } = supabase!.storage.from(SKU_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Deletes a stored SKU photo when it is replaced or removed.
 * Only touches objects that actually live in our "sku-images" bucket —
 * legacy Google Drive URLs are left alone.
 */
export async function apiDeleteSkuImage(url: string): Promise<void> {
  if (!isLive() || !url) return;
  const marker = `/storage/v1/object/public/${SKU_IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return;
  const path = decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  const { error } = await supabase!.storage.from(SKU_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/**
 * Explicitly sets (or clears, when imageUrl is null) a SKU's photo URL.
 * Needed because manage_sku updates keep the old image_url on null
 * (coalesce), so removing a photo has to go through this dedicated RPC.
 */
export async function apiSetSkuImage(skuId: string, imageUrl: string | null, warehouse: 'mkt' | 'cs'): Promise<void> {
  if (!isLive()) {
    const patch = { imageUrl };
    if (warehouse === 'mkt') demoData.demoUpdateSku(skuId, patch);
    else demoData.demoCsUpdateSku(skuId, patch);
    return;
  }
  const { data, error } = await supabase!.rpc('set_sku_image', {
    p_sku_id: skuId,
    p_image_url: imageUrl,
    p_warehouse: warehouse,
  });
  if (error) throw new Error(error.message);
  const res = data as any;
  if (!res?.success) throw new Error(res?.error || 'Failed to update SKU photo');
}

export async function apiManageCategory(action: 'add' | 'delete', name: string): Promise<void> {
  if (!isLive()) return demoData.demoManageCategory(action, name);
  const { error } = await supabase!.rpc('manage_category', { p_action: action, p_name: name });
  if (error) throw new Error(error.message);
}

export async function apiAddRemark(skuId: string, remark: string, userName: string, userRole: string): Promise<void> {
  if (!isLive()) return demoData.demoAddRemark(skuId, remark, userName, userRole);
  const { error } = await supabase!.rpc('add_remark', {
    p_sku_id: skuId, p_remark: remark, p_user_name: userName, p_user_role: userRole,
  });
  if (error) throw new Error(error.message);
}

// ── User management (Admin) — migration 0009_user_management.sql ─────────
// The password lives in public.users (visible to Admins) AND is hashed into
// auth.users (what actually signs the user in). Both are written by the
// manage_user() RPC, which also verifies the caller really is an Admin.

export async function apiAddUser(u: NewUserInput): Promise<string> {
  if (!isLive()) return demoData.demoAddUser(u);
  const { data, error } = await supabase!.rpc('manage_user', {
    p_action: 'add',
    p_user: {
      email: u.email.trim().toLowerCase(),
      username: u.username?.trim() || u.email.trim().toLowerCase(),
      full_name: u.fullName.trim(),
      department: u.department?.trim() || '',
      role: u.role,
      password: u.password,
    },
  });
  if (error) throw new Error(error.message);
  ok(data);
  return (data as any).id;
}

export async function apiUpdateUser(
  id: string,
  patch: { email?: string; fullName?: string; username?: string; department?: string; role?: UserRole; status?: string },
): Promise<void> {
  if (!isLive()) {
    return demoData.demoUpdateUser(id, {
      email: patch.email, fullName: patch.fullName, username: patch.username,
      department: patch.department, role: patch.role, status: patch.status,
    });
  }
  const { data, error } = await supabase!.rpc('manage_user', {
    p_action: 'update',
    p_user: {
      id,
      ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
      ...(patch.department !== undefined ? { department: patch.department } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
  });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiSetUserPassword(id: string, password: string): Promise<void> {
  if (!isLive()) return demoData.demoSetUserPassword(id, password);
  const { data, error } = await supabase!.rpc('manage_user', {
    p_action: 'set_password', p_user: { id, password },
  });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiSetUserStatus(id: string, status: 'Active' | 'Inactive'): Promise<void> {
  if (!isLive()) return demoData.demoSetUserStatus(id, status);
  const { data, error } = await supabase!.rpc('manage_user', {
    p_action: 'set_status', p_user: { id, status },
  });
  if (error) throw new Error(error.message);
  ok(data);
}

export async function apiDeleteUser(id: string): Promise<void> {
  if (!isLive()) return demoData.demoDeleteUser(id);
  const { data, error } = await supabase!.rpc('manage_user', {
    p_action: 'delete', p_user: { id },
  });
  if (error) throw new Error(error.message);
  ok(data);
}

/** Admin-only: read a user's stored password (RPC checks the JWT role). */
export async function apiRevealUserPassword(id: string): Promise<string | null> {
  if (!isLive()) return demoData.demoRevealUserPassword(id);
  const { data, error } = await supabase!.rpc('reveal_user_password', { p_user_id: id });
  if (error) throw new Error(error.message);
  const res = data as any;
  if (!res?.success) throw new Error(res?.error || 'Could not read the password');
  return res.has_password ? String(res.password ?? '') : null;
}