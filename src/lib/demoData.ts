// ── In-memory demo engine: SKU / config mutations ────────────────────────
import { demoDB, nextId } from './demoStore';
import type { SKU, CS_SKU } from './types';
import { castNumber } from './types';
import { todayStr } from './utils';

export function demoAddSku(sku: Partial<SKU>): string {
  const id = sku.id || nextId('sku-');
  const opening = castNumber(sku.openingBalance);
  demoDB.skus.push({
    id, name: sku.name || 'Untitled', category: sku.category || '', unit: sku.unit || 'pcs',
    openingBalance: opening, currentStock: sku.currentStock !== undefined ? castNumber(sku.currentStock) : opening,
    totalInflow: opening, imageUrl: sku.imageUrl || null,
    lowStockThreshold: castNumber(sku.lowStockThreshold), costPerUnit: castNumber(sku.costPerUnit),
    createdAt: todayStr(), status: sku.status || 'active',
  });
  if (opening > 0)
    demoDB.transactions.unshift({ ticketId: 'OPENING', skuId: id, skuName: sku.name, qty: opening, type: 'addition', date: todayStr(), actionBy: '', status: 'Opening', comment: 'Opening balance on SKU creation' });
  return id;
}

export function demoUpdateSku(id: string, updates: Partial<SKU>): void {
  const s = demoDB.skus.find((x) => x.id === id);
  if (!s) throw new Error('SKU not found');
  Object.assign(s, updates);
}

export function demoDeleteSku(id: string): void {
  demoDB.skus = demoDB.skus.filter((s) => s.id !== id);
}

export function demoRestockSku(id: string, qty: number, actionBy?: string, comment?: string): void {
  const s = demoDB.skus.find((x) => x.id === id);
  if (!s) throw new Error('SKU not found');
  if (!(qty > 0)) throw new Error('Restock quantity must be greater than 0');
  s.currentStock += qty;
  s.totalInflow += qty;
  demoDB.transactions.unshift({ ticketId: 'RESTOCK', skuId: id, skuName: s.name, qty, type: 'addition', date: todayStr(), actionAt: new Date().toISOString(), actionBy, status: 'Restock', comment: comment || 'Manual restock' });
}

export function demoCsAddSku(sku: Partial<CS_SKU>): string {
  const id = sku.id || 'CS-SKU-' + Math.floor(Date.now()).toString();
  const opening = castNumber(sku.openingBalance);
  demoDB.csSkus.push({
    id, name: sku.name || 'Untitled', category: sku.category || '', unit: sku.unit || 'pcs',
    openingBalance: opening, currentStock: sku.currentStock !== undefined ? castNumber(sku.currentStock) : opening,
    totalInflow: opening, imageUrl: sku.imageUrl || null,
    lowStockThreshold: castNumber(sku.lowStockThreshold), costPerUnit: castNumber(sku.costPerUnit),
    createdAt: todayStr(), status: sku.status || 'active',
  });
  if (opening > 0)
    demoDB.csTransactions.unshift({ ticketId: 'OPENING', skuId: id, skuName: sku.name, qty: opening, type: 'addition', date: todayStr(), actionAt: new Date().toISOString(), actionBy: '', comment: 'Opening balance on SKU creation' });
  return id;
}

export function demoCsUpdateSku(id: string, updates: Partial<CS_SKU>): void {
  const s = demoDB.csSkus.find((x) => x.id === id);
  if (!s) throw new Error('CS SKU not found');
  Object.assign(s, updates);
}

export function demoCsDeleteSku(id: string): void {
  demoDB.csSkus = demoDB.csSkus.filter((s) => s.id !== id);
}

export function demoCsRestockSku(id: string, qty: number, actionBy?: string, comment?: string): void {
  const s = demoDB.csSkus.find((x) => x.id === id);
  if (!s) throw new Error('CS SKU not found');
  if (!(qty > 0)) throw new Error('Restock quantity must be greater than 0');
  s.currentStock += qty; s.totalInflow += qty;
  demoDB.csTransactions.unshift({ ticketId: 'RESTOCK', skuId: id, skuName: s.name, qty, type: 'addition', date: todayStr(), actionAt: new Date().toISOString(), actionBy, comment: comment || 'Manual restock' });
}

export function demoCsDestockSku(id: string, qty: number, actionBy?: string, comment?: string, broken = 0): void {
  const s = demoDB.csSkus.find((x) => x.id === id);
  if (!s) throw new Error('CS SKU not found');
  if (!(qty > 0)) throw new Error('Destock quantity must be greater than 0');
  s.currentStock = Math.max(0, s.currentStock - qty);
  demoDB.csTransactions.unshift({
    ticketId: 'DIRECT_DESTOCK', skuId: id, skuName: s.name, qty, qtyBroken: broken || undefined, type: 'deduction',
    date: todayStr(), actionAt: new Date().toISOString(), actionBy,
    status: broken > 0 ? 'Loss/Broken' : 'Destock', comment: comment || 'Direct destock',
  });
}

// MKT warehouse direct destock (issue out / loss write-off) — no ticket needed
export function demoMktDestockSku(id: string, qty: number, actionBy?: string, comment?: string, broken = 0): void {
  const s = demoDB.skus.find((x) => x.id === id);
  if (!s) throw new Error('SKU not found');
  if (!(qty > 0)) throw new Error('Destock quantity must be greater than 0');
  if (qty > s.currentStock) throw new Error(`Only ${s.currentStock} ${s.unit} in stock`);
  s.currentStock -= qty;
  demoDB.transactions.unshift({
    ticketId: 'DIRECT_DESTOCK', skuId: id, skuName: s.name, qty, qtyBroken: broken || undefined, type: 'deduction',
    date: todayStr(), actionAt: new Date().toISOString(), actionBy,
    status: broken > 0 ? 'Loss/Broken' : 'Destock', comment: comment || 'Direct destock',
  });
}

// MKT → CS warehouse transfer (done by the MKT team)
export function demoTransferMktToCs(skuId: string, qty: number, actionBy: string, comment?: string): void {
  const mkt = demoDB.skus.find((s) => s.id === skuId);
  if (!mkt) throw new Error('SKU not found');
  if (!(qty > 0) || qty > mkt.currentStock) throw new Error('Invalid transfer quantity');
  mkt.currentStock -= qty;
  const cs = demoDB.csSkus.find((s) => s.id === skuId);
  if (cs) { cs.currentStock += qty; cs.totalInflow += qty; }
  else {
    demoDB.csSkus.push({
      id: skuId, name: mkt.name, category: mkt.category || 'General', unit: mkt.unit || 'pcs',
      openingBalance: qty, currentStock: qty, totalInflow: qty, imageUrl: mkt.imageUrl || null,
      lowStockThreshold: mkt.lowStockThreshold || 0, costPerUnit: mkt.costPerUnit || 0,
      createdAt: todayStr(), status: 'active',
    });
  }
  demoDB.transactions.unshift({
    ticketId: 'MKT_TRANSFER', skuId, skuName: mkt.name, qty, type: 'deduction',
    date: todayStr(), actionAt: new Date().toISOString(), actionBy,
    status: 'Transferred to CS', comment: comment || 'Transferred to CS warehouse',
  });
  demoDB.csTransactions.unshift({
    ticketId: 'MKT_TRANSFER_IN', skuId, skuName: mkt.name, qty, type: 'addition',
    date: todayStr(), actionAt: new Date().toISOString(), actionBy,
    comment: 'Auto-transferred from MKT WH' + (comment ? ' — ' + comment : ''),
  });
}

export function demoTransferCsToMkt(skuId: string, qty: number, actionBy: string): void {
  const cs = demoDB.csSkus.find((s) => s.id === skuId);
  if (!cs) throw new Error('CS SKU not found');
  if (!(qty > 0) || qty > cs.currentStock) throw new Error('Invalid transfer quantity');
  const mkt = demoDB.skus.find((s) => s.id === skuId);
  if (mkt) mkt.currentStock += qty;
  else demoDB.skus.push({ ...cs, currentStock: qty, totalInflow: qty });
  cs.currentStock -= qty;
  demoDB.transactions.unshift({ ticketId: 'CS_TRANSFER', skuId, skuName: cs.name, qty, type: 'addition', date: todayStr(), actionAt: new Date().toISOString(), actionBy, status: 'Returned to MKT', comment: 'Transferred from CS warehouse' });
  demoDB.csTransactions.unshift({ ticketId: 'CS_TRANSFER_OUT', skuId, skuName: cs.name, qty, type: 'deduction', date: todayStr(), actionAt: new Date().toISOString(), actionBy, comment: 'Transferred back to MKT warehouse' });
}

export function demoManageConfig(key: string, value: string): void {
  demoDB.config[key] = value;
}

export function demoManageCategory(action: 'add' | 'delete', name: string): void {
  if (action === 'add' && name && !demoDB.categories.includes(name)) demoDB.categories.push(name);
  if (action === 'delete') demoDB.categories = demoDB.categories.filter((c) => c !== name);
}

export function demoAddRemark(skuId: string, remark: string, userName: string, userRole: string): void {
  demoDB.remarks.unshift({ skuId, remark, userName, userRole, createdAt: new Date().toISOString() });
}

// ── SKU photo (demo mode) ─────────────────────────────────────────────────
// Reads the chosen file into a data URL so the demo behaves exactly like the
// live flow (upload → URL → save into the SKU record). Demo data is in memory
// only, so the picture disappears on reload — same as any other demo mutation.
export function demoUploadSkuImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image file'));
    reader.readAsDataURL(file);
  });
}