// ── Data mutations (Supabase RPC + demo-mode fallbacks) ─────────────────
import { isLive } from './api';
import { supabase } from './supabase';
import * as demoData from './demoData';
import type { SKU, CS_SKU } from './types';

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

export async function apiUpdateSku(id: string, updates: Partial<SKU>): Promise<void> {
  if (!isLive()) return demoData.demoUpdateSku(id, updates);
  const { data, error } = await supabase!.rpc('manage_sku', { p_action: 'update', p_sku: { id, ...row(updates) } });
  if (error) throw new Error(error.message);
  ok(data);
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

// ── CS SKU management ───────────────────────────────────────────────────
export async function apiCsAddSku(sku: Partial<CS_SKU>): Promise<string> {
  if (!isLive()) return demoData.demoCsAddSku(sku);
  const { data, error } = await supabase!.rpc('manage_cs_sku', { p_action: 'add', p_sku: row(sku) });
  if (error) throw new Error(error.message);
  ok(data);
  return (data as any).id;
}

export async function apiCsUpdateSku(id: string, updates: Partial<CS_SKU>): Promise<void> {
  if (!isLive()) return demoData.demoCsUpdateSku(id, updates);
  const { data, error } = await supabase!.rpc('manage_cs_sku', { p_action: 'update', p_sku: { id, ...row(updates) } });
  if (error) throw new Error(error.message);
  ok(data);
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
export async function apiTransferMktToCs(skuId: string, qty: number, actionBy: string, comment?: string): Promise<void> {
  if (!isLive()) return demoData.demoTransferMktToCs(skuId, qty, actionBy, comment);
  const cs = await supabase!.from('cs_skus').select('*').eq('id', skuId).maybeSingle();
  if (!cs.error && cs.data) {
    await supabase!.from('cs_skus')
      .update({ current_stock: cs.data.current_stock + qty, total_inflow: cs.data.total_inflow + qty })
      .eq('id', skuId);
  } else {
    const mkt = await supabase!.from('skus').select('*').eq('id', skuId).single();
    await supabase!.from('cs_skus').insert({
      id: skuId, name: mkt.data.name, category: mkt.data.category, unit: mkt.data.unit,
      opening_balance: qty, current_stock: qty, total_inflow: qty, image_url: mkt.data.image_url,
      low_stock_threshold: mkt.data.low_stock_threshold, cost_per_unit: mkt.data.cost_per_unit,
    });
  }
  const { data, error } = await supabase!.rpc('manage_sku', {
    p_action: 'destock', p_sku: { id: skuId, qty }, p_remark: comment || 'Transferred to CS warehouse', p_action_by: actionBy,
  });
  if (error) throw new Error(error.message);
  ok(data);
  await supabase!.from('stock_transactions').insert({
    ticket_id: 'MKT_TRANSFER', sku_id: skuId, qty, type: 'deduction',
    date: new Date().toISOString().slice(0, 10), action_by: actionBy,
    status: 'Transferred to CS', comment: comment || 'Transferred to CS warehouse',
  });
}
// ── CS → MKT transfer ───────────────────────────────────────────────────
export async function apiTransferCsToMkt(skuId: string, qty: number, actionBy: string): Promise<void> {
  if (!isLive()) return demoData.demoTransferCsToMkt(skuId, qty, actionBy);
  const mkt = await supabase!.from('skus').select('*').eq('id', skuId).maybeSingle();
  if (!mkt.error && mkt.data) {
    await supabase!.from('skus')
      .update({ current_stock: mkt.data.current_stock + qty, total_inflow: mkt.data.total_inflow + qty })
      .eq('id', skuId);
  } else {
    const cs = await supabase!.from('cs_skus').select('*').eq('id', skuId).single();
    await supabase!.from('skus').insert({
      id: skuId, name: cs.data.name, category: cs.data.category, unit: cs.data.unit,
      opening_balance: qty, current_stock: qty, total_inflow: qty, image_url: cs.data.image_url,
      low_stock_threshold: cs.data.low_stock_threshold, cost_per_unit: cs.data.cost_per_unit,
    });
  }
  const { data, error } = await supabase!.rpc('manage_cs_sku', {
    p_action: 'destock', p_sku: { id: skuId, qty }, p_comment: 'Transferred back to MKT warehouse', p_action_by: actionBy,
  });
  if (error) throw new Error(error.message);
  ok(data);
  await supabase!.from('stock_transactions').insert({
    ticket_id: 'CS_TRANSFER', sku_id: skuId, qty, type: 'addition',
    date: new Date().toISOString().slice(0, 10), action_by: actionBy,
    status: 'Returned to MKT', comment: 'Transferred from CS warehouse',
  });
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