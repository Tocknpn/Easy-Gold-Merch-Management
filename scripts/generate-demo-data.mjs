// Generates src/lib/demo-data.json from data/*.csv (single-file offline preview bundle)
// Run: node scripts/generate-demo-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const readCsv = (name) => {
  // robust RFC-4180 parse (handles quoted fields, commas, embedded newlines, BOM)
  return readCsvFile(path.join(root, 'data', name));
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const clean = (v) => (v === null || v === undefined) ? null : String(v).trim() || null;

// users (strip passwords from the frontend bundle)
const users = readCsv('Users.csv').slice(1)
  .filter((r) => r[0] && r[1])
  .map((r) => ({
    id: r[0], email: String(r[1]).toLowerCase().trim(), fullName: r[4], department: r[5],
    role: (() => {
      const k = String(r[3] || '').toLowerCase().trim();
      const map = { staff: 'staff', warehouse: 'warehouse', 'line manager': 'line_manager', director: 'director', admin: 'admin', finance: 'finance', 'customer service': 'customer_service', hr: 'staff', pa: 'staff' };
      if ((k === 'staff' || k === '') && String(r[5] || '').toUpperCase().trim() === 'CS') return 'customer_service';
      return map[k] || 'staff';
    })(),
    status: r[6] || 'Active',
    password: clean(r[2]) || 'demo123',
  }));

const skus = readCsv('SKU_MasterData.csv').slice(1).filter((r) => r[0]).map((r) => ({
  id: r[0], name: r[1], category: r[2], unit: r[3], openingBalance: num(r[4]), currentStock: num(r[5]),
  imageUrl: clean(r[6]), lowStockThreshold: num(r[7]), totalInflow: num(r[8]), costPerUnit: num(r[9]), createdAt: clean(r[10]),
}));

const csSkus = readCsv('CS_SKU_MasterData.csv').slice(1).filter((r) => r[0]).map((r) => ({
  id: r[0], name: r[1], category: r[2], unit: r[3], openingBalance: num(r[4]), currentStock: num(r[5]),
  totalInflow: num(r[6]), lowStockThreshold: num(r[7]), costPerUnit: num(r[8]), imageUrl: clean(r[9]), createdAt: clean(r[10]),
}));

const tickets = readCsv('Tickets.csv').slice(1).filter((r) => r[0]).map((r) => ({
  id: r[0], status: r[1] || 'pending', createdBy: clean(r[2]), createdByName: r[3], department: r[4],
  deliveryDate: clean(r[5]), remark: clean(r[6]), createdAt: clean(r[7]), whComment: clean(r[8]),
  lmComment: clean(r[9]), directorComment: clean(r[10]), lastActionAt: clean(r[12]), lastActionBy: clean(r[13]),
  lastActionStatus: clean(r[14]), lastActionComment: clean(r[15]), actualDeliveryDate: clean(r[16]),
  type: clean(r[17]) || 'request', returnDate: clean(r[18]),
}));

// note: col 11 = 'Actual Delivery Date' (legacy duplicate) — column 16 is the real one.
const ticketItems = [];
for (const r of readCsv('TicketItems.csv').slice(1).filter((r) => r[0])) {
  const existing = ticketItems.find((i) => i.ticketId === r[0]) ||
    (ticketItems.push({ ticketId: r[0], items: [] }), ticketItems[ticketItems.length - 1]);
  existing.items.push({
    skuId: r[1], skuName: r[2], qtyRequested: num(r[3]), qtyApproved: r[4] === '' ? null : num(r[4]), unit: r[5],
  });
}

const transactions = readCsv('StockTransactions.csv').slice(1).filter((r) => r[1]).map((r) => ({
  ticketId: r[1], skuId: r[2], skuName: clean(r[11]), qty: num(r[3]), type: r[4], date: clean(r[5]),
  actionAt: clean(r[6]), actionBy: clean(r[7]), status: clean(r[8]), comment: clean(r[9]), qtyBroken: num(r[10]),
}));

const csTransactions = readCsv('CS_Transactions.csv').slice(1).filter((r) => r[1]).map((r) => ({
  ticketId: r[1], skuId: r[2], skuName: clean(r[3]), qty: num(r[4]), type: r[5], date: clean(r[6]),
  actionAt: clean(r[7]), actionBy: clean(r[8]), comment: clean(r[9]),
}));

const actions = readCsv('TicketActions.csv').slice(1).filter((r) => r[1]).map((r) => ({
  ticketId: r[1], action: r[2], status: clean(r[3]), actionAt: clean(r[4]), actionBy: clean(r[5]), comment: clean(r[6]), role: clean(r[7]),
}));

const categories = readCsv('Categories.csv').slice(1).filter((r) => r[0]).map((r) => r[0]);
const config = {};
for (const r of readCsv('System_Config.csv').slice(1).filter((r) => r[0])) config[r[0]] = r[1];
const remarks = readCsv('SKU_Remarks.csv').slice(1).filter((r) => r[0]).map((r) => ({
  skuId: r[0], remark: r[1], userName: r[2], userRole: r[3], createdAt: clean(r[4]),
}));

const bundle = {
  meta: { generated: new Date().toISOString(), source: 'Current Stock Data from previous Web.xlsx' },
  users, skus, csSkus, tickets, ticketItems, transactions, csTransactions, actions, categories, config, remarks,
};
fs.writeFileSync(path.join(root, 'src', 'lib', 'demo-data.json'), JSON.stringify(bundle));
console.log('demo-data.json written:', (bundle.users.length + ' users, ' + bundle.skus.length + ' skus, ' +
  bundle.csSkus.length + ' cs skus, ' + bundle.tickets.length + ' tickets, ' + bundle.transactions.length +
  ' tx, ' + bundle.csTransactions.length + ' cs tx'));