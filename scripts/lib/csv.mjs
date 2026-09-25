// Robust RFC-4180 CSV reader and writer — handles quoted fields, doubled quotes,
// embedded commas, UTF-8 BOM, and quoted fields that span multiple lines.
// Shared by generate-seed.mjs, generate-demo-data.mjs, export-csv.mjs and seed-auth.mjs.
import fs from 'node:fs';

export function parseCsv(text) {
  // strip any UTF-8 BOM (our exporter writes one for Excel/Lao safety)
  const norm = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cur = '', inQ = false;

  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (inQ) {
      if (c === '"') {
        if (norm[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c; // includes embedded \n / \r inside quoted fields
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && norm[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      row = row.map((f) => (f === undefined ? '' : String(f)));
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  row = row.map((f) => (f === undefined ? '' : String(f)));
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function readCsvFile(filePath) {
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

/**
 * RFC-4180 cell escaper.
 * Embedded newlines are flattened to a space so each logical row stays on
 * one physical line — safe for Excel, Supabase Table Editor and simple parsers.
 */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r\n|\r|\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * Writes an array of rows to a CSV file with a UTF-8 BOM (Lao-safe in Excel & Supabase).
 */
export function writeCsvFile(filePath, rows) {
  const text = '\ufeff' + toCsv(rows) + '\r\n';
  fs.writeFileSync(filePath, text, 'utf8');
}
