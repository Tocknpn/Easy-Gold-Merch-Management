// Generates supabase/seed.sql from the Excel-derived CSV files in data/
// Run: node scripts/generate-seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');

const readCsv = (name) => {
  // robust RFC-4180 parse (handles quoted fields, commas, embedded newlines, BOM)
  return readCsvFile(path.join(dataDir, name));
};

const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '0';
};
const date = (v) => {
  if (!v) return 'NULL';
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  return m ? `'${m[0]}'` : 'NULL';
};
const ts = (v) => {
  if (!v) return 'NULL';
  const s = String(v);
  if (s.includes('T')) return q(s);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? q(`${m[0]}T00:00:00`) : 'NULL';
};

const lines = [];
lines.push('-- ============================================================');
lines.push('-- Easy Gold Merch — SEED data migrated from the previous web');
lines.push('-- system Excel (Current Stock Data from previous Web.xlsx)');
lines.push('-- Run AFTER 0001..0004 in the Supabase SQL Editor.');
lines.push('-- ============================================================');
lines.push('');
lines.push('begin;');
lines.push('');

// ---- users (id filled with random uuid; auth mapping done by scripts/seed-auth.mjs)
lines.push('-- USERS  (id is replaced by the real auth user id when running seed-auth)');
const users = readCsv('Users.csv');
const usersRows = users.slice(1).filter((r) => r[0] && r[1]);
for (const r of usersRows) {
  const [id, email, _pwd, role, name, dept, status] = r;
  lines.push(`insert into public.users (id, username, email, full_name, department, role, status)
  values (gen_random_uuid(), ${q(email)}, ${q(email.toLowerCase())}, ${q(name)}, ${q(dept)}, ${q(role)}, ${q(status || 'Active')});`);
}
lines.push('');

// ---- categories
lines.push('-- CATEGORIES');
for (const r of readCsv('Categories.csv').slice(1).filter((r) => r[0])) {
  lines.push(`insert into public.categories (name) values (${q(r[0])}) on conflict (name) do nothing;`);
}
lines.push('');

// ---- config
lines.push('-- SYSTEM CONFIG');
for (const r of readCsv('System_Config.csv').slice(1).filter((r) => r[0])) {
  lines.push(`insert into public.system_config (key, value, description) values (${q(r[0])}, ${q(r[1])}, ${q(r[2] || '')});`);
}
lines.push('');

// ---- MKT SKUs
lines.push('-- MKT SKUs');
const skus = readCsv('SKU_MasterData.csv');
for (const r of skus.slice(1).filter((r) => r[0])) {
  const [id, name, cat, unit, opening, current, image, threshold, inflow, cost, created] = r;
  lines.push(`insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at)
  values (${q(id)}, ${q(name)}, ${q(cat)}, ${q(unit)}, ${num(opening)}, ${num(current)}, ${num(inflow)}, ${q(image)}, ${num(threshold)}, ${num(cost)}, ${ts(created)});`);
}
lines.push('');

// ---- CS SKUs
lines.push('-- CS SKUs');
for (const r of readCsv('CS_SKU_MasterData.csv').slice(1).filter((r) => r[0])) {
  const [id, name, cat, unit, opening, current, inflow, threshold, cost, image, created] = r;
  lines.push(`insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at)
  values (${q(id)}, ${q(name)}, ${q(cat)}, ${q(unit)}, ${num(opening)}, ${num(current)}, ${num(inflow)}, ${q(image)}, ${num(threshold)}, ${num(cost)}, ${ts(created)});`);
}
lines.push('');

// ---- tickets
lines.push('-- TICKETS');
const tickets = readCsv('Tickets.csv');
for (const r of tickets.slice(1).filter((r) => r[0])) {
  const [id, status, createdBy, createdByName, dept, delivery, remark, createdAt,
         wh, lm, dir, _ad, lastAt, lastBy, lastStatus, lastComment, actualDelivery, type, returnDate] = r;
  lines.push(`insert into public.tickets (id, created_by, created_by_name, department, delivery_date, remark, status, type, return_date, created_at, wh_comment, lm_comment, director_comment, last_action_at, last_action_by, last_action_status, last_action_comment, actual_delivery_date)
  values (${q(id)}, ${q(createdBy)}, ${q(createdByName)}, ${q(dept)}, ${date(delivery)}, ${q(remark || '')}, ${q(status || 'pending')}, ${q(type || 'request')}, ${date(returnDate)}, ${ts(createdAt)}, ${q(wh || '')}, ${q(lm || '')}, ${q(dir || '')}, ${ts(lastAt)}, ${q(lastBy)}, ${q(lastStatus)}, ${q(lastComment || '')}, ${date(actualDelivery)});`);
}
lines.push('');

fs.writeFileSync(path.join(root, 'supabase', 'seed_part1.sql'), lines.join('\n') + '\n');
console.log('seed_part1.sql written:', lines.length, 'lines');
// ============ PART 2: ticket items, transactions, actions, remarks ============
const lines2 = [];

// ---- ticket items
lines2.push('-- TICKET ITEMS');
const items = readCsv('TicketItems.csv');
for (const r of items.slice(1).filter((r) => r[0])) {
  const [tid, skuId, skuName, qtyReq, qtyApp, unit] = r;
  lines2.push(`insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values (${q(tid)}, ${q(skuId)}, ${q(skuName)}, ${num(qtyReq)}, ${num(qtyApp)}, ${q(unit)});`);
}
lines2.push('');

// ---- stock transactions (MKT)
lines2.push('-- STOCK TRANSACTIONS (MKT)');
const txs = readCsv('StockTransactions.csv');
for (const r of txs.slice(1).filter((r) => r[1])) {
  const [id, ticketId, skuId, qty, type, d, actionAt, actionBy, status, comment, broken, skuName] = r;
  lines2.push(`insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values (${q(ticketId)}, ${q(skuId)}, ${q(skuName)}, ${num(qty)}, ${num(broken)}, ${q(type)}, ${date(d)}, ${ts(actionAt)}, ${q(actionBy)}, ${q(status || '')}, ${q(comment || '')});`);
}
lines2.push('');

// ---- CS transactions
lines2.push('-- CS TRANSACTIONS');
const csTx = readCsv('CS_Transactions.csv');
for (const r of csTx.slice(1).filter((r) => r[1])) {
  const [id, ticketId, skuId, skuName, qty, type, d, actionAt, actionBy, comment] = r;
  lines2.push(`insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values (${q(ticketId)}, ${q(skuId)}, ${q(skuName)}, ${num(qty)}, ${q(type)}, ${date(d)}, ${ts(actionAt)}, ${q(actionBy)}, ${q(comment || '')});`);
}
lines2.push('');

// ---- ticket actions (audit)
lines2.push('-- TICKET ACTIONS (audit trail)');
const actions = readCsv('TicketActions.csv');
for (const r of actions.slice(1).filter((r) => r[1])) {
  const [id, ticketId, action, status, actionAt, actionBy, comment, role] = r;
  lines2.push(`insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values (${q(ticketId)}, ${q(action)}, ${q(status || '')}, ${ts(actionAt)}, ${q(actionBy)}, ${q(comment || '')}, ${q(role || '')});`);
}
lines2.push('');

// ---- SKU remarks
lines2.push('-- SKU REMARKS');
const remarks = readCsv('SKU_Remarks.csv');
for (const r of remarks.slice(1).filter((r) => r[0])) {
  const [skuId, remark, user, role, created] = r;
  lines2.push(`insert into public.sku_remarks (sku_id, remark, user_name, user_role, created_at)
  values (${q(skuId)}, ${q(remark || '')}, ${q(user)}, ${q(role)}, ${ts(created)});`);
}
lines2.push('');

lines2.push('commit;');
fs.writeFileSync(path.join(root, 'supabase', 'seed_part2.sql'), lines2.join('\n') + '\n');

// ---- combine into final seed.sql
const part1 = fs.readFileSync(path.join(root, 'supabase', 'seed_part1.sql'), 'utf8');
const part2 = fs.readFileSync(path.join(root, 'supabase', 'seed_part2.sql'), 'utf8');
fs.writeFileSync(path.join(root, 'supabase', 'seed.sql'), part1.trimEnd() + '\n\n' + part2.trimStart());
fs.rmSync(path.join(root, 'supabase', 'seed_part1.sql'));
fs.rmSync(path.join(root, 'supabase', 'seed_part2.sql'));

console.log('seed.sql written:', fs.statSync(path.join(root, 'supabase', 'seed.sql')).size, 'bytes');