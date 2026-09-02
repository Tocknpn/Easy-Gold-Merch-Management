// Exports every app sheet from the source Excel into data/*.csv
// with a UTF-8 BOM so Lao / Unicode text opens correctly in Excel
// and imports cleanly into Supabase (Table Editor CSV import).
//
// Run:  npm run csv:export
// Then: npm run seed:generate   (builds supabase/seed.sql from these CSVs)
//       npm run seed:demo       (rebuilds the offline demo bundle)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// xlsx's ESM entry is the browser build (no Node readFile), so use the CJS build.
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const XLSX_FILE = path.join(root, 'Current Stock Data from previous Web.xlsx');
const OUT_DIR = path.join(root, 'data');

// Excel sheet name -> output CSV file.
// System_Logs and Audit Tab are not used by the app, so they are skipped.
const SHEET_TO_FILE = {
  Users: 'Users.csv',
  CS_SKU_MasterData: 'CS_SKU_MasterData.csv',
  CS_Transactions: 'CS_Transactions.csv',
  SKU_Remarks: 'SKU_Remarks.csv',
  System_Config: 'System_Config.csv',
  Categories: 'Categories.csv',
  SKU_MasterData: 'SKU_MasterData.csv',
  Tickets: 'Tickets.csv',
  TicketItems: 'TicketItems.csv',
  StockTransactions: 'StockTransactions.csv',
  TicketActions: 'TicketActions.csv',
};

// RFC 4180 cell escaping (quote when the value contains , " or a newline).
// Embedded newlines inside a cell are normalized to a space so every logical
// row stays on ONE physical line — Excel, Supabase Table Editor import, and
// the simple line-based seed parsers all handle that safely.
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r\n|\r|\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

if (!fs.existsSync(XLSX_FILE)) {
  console.error('Excel file not found:', XLSX_FILE);
  process.exit(1);
}

const wb = XLSX.readFile(XLSX_FILE);
let total = 0;

for (const [sheet, file] of Object.entries(SHEET_TO_FILE)) {
  const ws = wb.Sheets[sheet];
  if (!ws) { console.warn('  !! sheet not found in Excel:', sheet); continue; }

  // raw:false -> display-formatted strings (dates become ISO text, etc.)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const header = (rows[0] || []).map((h) => String(h ?? '').trim());
  const nCols = header.length;

  // keep data rows that have at least one non-empty cell; pad/clamp to header width
  const data = rows
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => {
      const out = r.slice(0, nCols);
      while (out.length < nCols) out.push('');
      return out.map((c) => String(c ?? ''));
    });

  // \ufeff = UTF-8 BOM (Excel + Lao safe). \r\n line endings.
  const text = '\ufeff' + toCsv([header, ...data]) + '\r\n';
  fs.writeFileSync(path.join(OUT_DIR, file), text, 'utf8');
  console.log(`${file.padEnd(26)} ${data.length} data rows`);
  total += data.length;
}

console.log(`\nDone. ${total} rows exported with UTF-8 BOM -> ${OUT_DIR}`);
