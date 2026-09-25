// ============================================================
// Generates supabase/seed.sql from data/*.csv
// Upgraded for migration 0019 (Blue edition):
//   - Self-contained: wrapped in begin; ... commit;
//   - Idempotent wipe of transactional tables (ticket_items,
//     ticket_actions, stock_transactions, cs_transactions,
//     tickets, sku_remarks)
//   - Natural-key upsert of masters (users by email, skus by id,
//     cs_skus by id, categories by name, system_config by key)
//     so existing auth user UUID links are preserved
//   - Robust date/serial parsing (Excel 46073 -> 2026-02-20)
//   - Role canonicalization (migration 0011 + CS department rule)
//   - SKU status='active' (migration 0013)
//   - Re-asserts system_config.engine_version='0014' (migration 0014)
//   - Derives wh/lm/director_comment_at from ticket_actions
//   - Emits a verification summary query at the end
//
// Run:  node scripts/generate-seed.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');

const readCsv = (name) => readCsvFile(path.join(dataDir, name));

// Escape a string for SQL; null/undefined/empty becomes NULL
const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).trim();
  if (s === '') return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
};

// Coerce to a finite number or '0'
const num = (v) => {
  if (v === null || v === undefined || v === '') return '0';
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? String(n) : '0';
};

// Coerce an Excel date (serial number like 46073 or ISO string) to 'YYYY-MM-DD'
const date = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).trim();
  if (!s) return 'NULL';

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return `'${d.toISOString().slice(0, 10)}'`;
    }
  }

  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? `'${m[0]}'` : 'NULL';
};

// Coerce to an ISO timestamptz string
const ts = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).trim();
  if (!s) return 'NULL';

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return `'${d.toISOString()}'`;
    }
  }

  if (s.includes('T')) return q(s);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? `'${m[0]}T00:00:00Z'` : 'NULL';
};

// Canonicalize legacy role labels (matches migration 0011 + AuthContext + seed-auth)
const normRole = (role, dept) => {
  const k = String(role || '').toLowerCase().trim();
  if ((k === 'staff' || k === '') && String(dept || '').toUpperCase().trim() === 'CS') {
    return 'customer_service';
  }
  const map = {
    staff: 'staff',
    warehouse: 'warehouse',
    'warehouse manager': 'warehouse',
    'line manager': 'line_manager',
    line_manager: 'line_manager',
    director: 'director',
    admin: 'admin',
    finance: 'finance',
    'customer service': 'customer_service',
    customer_service: 'customer_service',
    hr: 'hr',
    pa: 'pa',
  };
  return map[k] || 'staff';
};

const lines = [];

lines.push('-- ============================================================');
lines.push('-- Easy Gold Merch Management — Complete Database Import');
lines.push('-- Generated from Actual Database.xlsx via scripts/generate-seed.mjs');
lines.push('-- Compatible with migration 0019 (Blue edition).');
lines.push('--');
lines.push('-- HOW TO APPLY:');
lines.push('--   1. Supabase Dashboard -> SQL Editor -> New query');
lines.push('--   2. Paste this ENTIRE file and press Run');
lines.push('--   3. Run `npm run seed:auth` in your terminal to create/link logins');
lines.push('-- ============================================================');
lines.push('');
lines.push('begin;');
lines.push('');

// 1. WIPE TRANSACTIONAL DATA (FK-safe order)
lines.push('-- ── Step 1: Wipe transactional tables in FK-safe order ──');
lines.push('delete from public.ticket_items;');
lines.push('delete from public.ticket_actions;');
lines.push('delete from public.stock_transactions;');
lines.push('delete from public.cs_transactions;');
lines.push('delete from public.sku_remarks;');
lines.push('delete from public.tickets;');
lines.push('');

// 2. CATEGORIES (upsert)
lines.push('-- ── Step 2: Categories (upsert) ──');
const catRows = readCsv('Categories.csv').slice(1).filter((r) => r[0] && r[0].trim());
for (const r of catRows) {
  lines.push(`insert into public.categories (name) values (${q(r[0])}) on conflict (name) do nothing;`);
}
lines.push('');

// 3. SYSTEM CONFIG (upsert, plus re-assert engine_version)
lines.push('-- ── Step 3: System Config (upsert + re-assert engine_version) ──');
const cfgRows = readCsv('System_Config.csv').slice(1).filter((r) => r[0] && r[0].trim());
for (const r of cfgRows) {
  lines.push(`insert into public.system_config (key, value, description)
  values (${q(r[0])}, ${q(r[1])}, ${q(r[2] || '')})
  on conflict (key) do update set value = excluded.value, description = excluded.description;`);
}
// Crucial: UI uses engine_version='0014' to enable over-approval
lines.push(`insert into public.system_config (key, value, description)
  values ('engine_version', '0014', 'Approved-qty propagation (over-approval enabled)')
  on conflict (key) do update set value = excluded.value;`);
lines.push('');

// 4. USERS (upsert by email)
lines.push('-- ── Step 4: Users (upsert by email, preserves existing auth UUID) ──');
const users = readCsv('Users.csv');
const usersRows = users.slice(1).filter((r) => r[0] && r[1]);
for (const r of usersRows) {
  const [id, email, password, role, name, dept, status] = r;
  const canonicalRole = normRole(role, dept);
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  lines.push(`insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), ${q(email)}, ${q(cleanEmail)}, ${q(name)}, ${q(dept)}, ${q(canonicalRole)}, ${q(status || 'Active')}, ${q(cleanPass)}, now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();`);
}
lines.push('');

// 5. MKT SKUs (upsert by id)
lines.push('-- ── Step 5: MKT SKUs (upsert by id, default status=active) ──');
const skus = readCsv('SKU_MasterData.csv');
for (const r of skus.slice(1).filter((r) => r[0])) {
  const [id, name, cat, unit, opening, current, image, threshold, inflow, cost, created] = r;
  lines.push(`insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values (${q(id)}, ${q(name)}, ${q(cat)}, ${q(unit || 'pcs')}, ${num(opening)}, ${num(current)}, ${num(inflow)}, ${q(image)}, ${num(threshold)}, ${num(cost)}, ${ts(created)}, 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');`);
}
lines.push('');

// 6. CS SKUs (upsert by id)
lines.push('-- ── Step 6: CS SKUs (upsert by id, default status=active) ──');
const csSkus = readCsv('CS_SKU_MasterData.csv');
for (const r of csSkus.slice(1).filter((r) => r[0])) {
  const [id, name, cat, unit, opening, current, inflow, threshold, cost, image, created] = r;
  lines.push(`insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values (${q(id)}, ${q(name)}, ${q(cat)}, ${q(unit || 'pcs')}, ${num(opening)}, ${num(current)}, ${num(inflow)}, ${q(image)}, ${num(threshold)}, ${num(cost)}, ${ts(created)}, 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');`);
}
lines.push('');

// 7. TICKETS
lines.push('-- ── Step 7: Tickets ──');
const tickets = readCsv('Tickets.csv');
for (const r of tickets.slice(1).filter((r) => r[0])) {
  const [id, status, createdBy, createdByName, dept, delivery, remark, createdAt,
         wh, lm, dir, _ad11, lastAt, lastBy, lastStatus, lastComment, actualDelivery16, type, returnDate] = r;

  lines.push(`insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    ${q(id)}, ${q(status || 'pending')}, ${q(createdBy)}, ${q(createdByName)}, ${q(dept)},
    ${date(delivery)}, ${q(remark || '')}, ${ts(createdAt)}, ${q(wh || '')}, ${q(lm || '')}, ${q(dir || '')},
    ${ts(lastAt)}, ${q(lastBy)}, ${q(lastStatus)}, ${q(lastComment || '')},
    ${date(actualDelivery16)}, ${q(type || 'request')}, ${date(returnDate)}
  );`);
}
lines.push('');

// 8. TICKET ITEMS
lines.push('-- ── Step 8: Ticket Items ──');
const items = readCsv('TicketItems.csv');
for (const r of items.slice(1).filter((r) => r[0] && r[1])) {
  const [tid, skuId, skuName, qtyReq, qtyApp, unit] = r;
  const appQty = qtyApp === '' || qtyApp === undefined || qtyApp === null ? 'NULL' : num(qtyApp);
  lines.push(`insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values (${q(tid)}, ${q(skuId)}, ${q(skuName)}, ${num(qtyReq)}, ${appQty}, ${q(unit || 'pcs')});`);
}
lines.push('');

// 9. STOCK TRANSACTIONS (MKT)
lines.push('-- ── Step 9: Stock Transactions (MKT) ──');
const txs = readCsv('StockTransactions.csv');
for (const r of txs.slice(1).filter((r) => r[1])) {
  const [_id, ticketId, skuId, qty, type, d, actionAt, actionBy, status, comment, broken, skuName] = r;
  lines.push(`insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values (${q(ticketId)}, ${q(skuId)}, ${q(skuName)}, ${num(qty)}, ${num(broken)}, ${q(type)}, ${date(d)}, ${ts(actionAt)}, ${q(actionBy)}, ${q(status || '')}, ${q(comment || '')});`);
}
lines.push('');

// 10. CS TRANSACTIONS
lines.push('-- ── Step 10: CS Transactions ──');
const csTx = readCsv('CS_Transactions.csv');
for (const r of csTx.slice(1).filter((r) => r[1])) {
  const [_id, ticketId, skuId, skuName, qty, type, d, actionAt, actionBy, comment] = r;
  lines.push(`insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values (${q(ticketId)}, ${q(skuId)}, ${q(skuName)}, ${num(qty)}, ${q(type)}, ${date(d)}, ${ts(actionAt)}, ${q(actionBy)}, ${q(comment || '')});`);
}
lines.push('');

// 11. TICKET ACTIONS (audit trail)
lines.push('-- ── Step 11: Ticket Actions ──');
const actions = readCsv('TicketActions.csv');
for (const r of actions.slice(1).filter((r) => r[1])) {
  const [_id, ticketId, action, status, actionAt, actionBy, comment, role] = r;
  lines.push(`insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values (${q(ticketId)}, ${q(action)}, ${q(status || '')}, ${ts(actionAt)}, ${q(actionBy)}, ${q(comment || '')}, ${q(role || '')});`);
}
lines.push('');

// 12. SKU REMARKS
lines.push('-- ── Step 12: SKU Remarks ──');
const remarks = readCsv('SKU_Remarks.csv');
for (const r of remarks.slice(1).filter((r) => r[0])) {
  const [skuId, remark, user, role, created] = r;
  lines.push(`insert into public.sku_remarks (sku_id, remark, user_name, user_role, created_at)
  values (${q(skuId)}, ${q(remark || '')}, ${q(user)}, ${q(role)}, ${ts(created)});`);
}
lines.push('');

// 13. DERIVE PER-LEVEL COMMENT TIMESTAMPS
lines.push('-- ── Step 13: Backfill per-level comment timestamps from ticket_actions ──');
lines.push(`update public.tickets t
   set wh_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('warehouse', 'warehouse manager')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.wh_comment is not null and t.wh_comment <> '';`);

lines.push(`update public.tickets t
   set lm_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('line manager', 'line_manager')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.lm_comment is not null and t.lm_comment <> '';`);

lines.push(`update public.tickets t
   set director_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('director', 'admin')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.director_comment is not null and t.director_comment <> '';`);
lines.push('');

lines.push('commit;');
lines.push('');

// 14. VERIFICATION QUERY BLOCK
lines.push('-- ── Step 14: Verification (run after commit to review counts) ──');
lines.push(`select 'users'               as table_name, count(*) as row_count from public.users union all
select 'categories',          count(*) from public.categories union all
select 'system_config',       count(*) from public.system_config union all
select 'skus (MKT)',          count(*) from public.skus union all
select 'cs_skus',             count(*) from public.cs_skus union all
select 'tickets',             count(*) from public.tickets union all
select 'ticket_items',        count(*) from public.ticket_items union all
select 'stock_transactions',  count(*) from public.stock_transactions union all
select 'cs_transactions',     count(*) from public.cs_transactions union all
select 'ticket_actions',      count(*) from public.ticket_actions union all
select 'sku_remarks',         count(*) from public.sku_remarks
order by table_name;`);

const outPath = path.join(root, 'supabase', 'seed.sql');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

const stat = fs.statSync(outPath);
console.log(`seed.sql successfully generated: ${lines.length} lines, ${(stat.size / 1024).toFixed(1)} KB`);
console.log(`Output: ${outPath}`);
