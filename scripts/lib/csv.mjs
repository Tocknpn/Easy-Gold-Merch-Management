// Robust RFC-4180 CSV reader — handles quoted fields, doubled quotes,
// embedded commas, and quoted fields that span multiple lines.
// Shared by generate-seed.mjs, generate-demo-data.mjs and seed-auth.mjs.
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