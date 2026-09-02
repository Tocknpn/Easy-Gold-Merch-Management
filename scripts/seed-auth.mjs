// Seeds Supabase Auth accounts + maps public.users rows for the Excel users.
// Requires .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-safe).
// Prereq: supabase/seed.sql already ran (so public.users rows exist).
// Run:  npm run seed:auth
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// minimal .env parser
const env = {};
try {
  const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env */ }

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — aborting.');
  process.exit(1);
}

// normalize legacy sheet role labels -> app role
const ROLE_MAP = {
  staff: 'staff', 'staff': 'staff', warehouse: 'warehouse',
  'line manager': 'line_manager', director: 'director', admin: 'admin',
  finance: 'finance', 'customer service': 'customer_service',
  hr: 'staff', pa: 'staff', '': 'staff',
};
const normRole = (role, dept) => {
  const k = String(role || '').toLowerCase().trim();
  if ((k === 'staff' || k === '') && String(dept || '').toUpperCase().trim() === 'CS') return 'customer_service';
  return ROLE_MAP[k] || 'staff';
};

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function readUsersCsv() {
  const rows = readCsvFile(path.join(root, 'data', 'Users.csv'));
  return rows.slice(1)
    .filter((r) => r[0] && r[1])
    .map((r) => {
      const [id, email, password, role, name, dept, status] = r;
      return {
        email: email.toLowerCase().trim(),
        password: String(password).replace(/,.*$/, '').trim(),
        role: normRole(role, dept),
        name: name.trim(),
        dept: dept.trim(),
        status: status.trim() || 'Active',
      };
    });
}

async function main() {
  const users = readUsersCsv();
  console.log(`Seeding ${users.length} auth users...`);
  let ok = 0, updated = 0, skipped = 0, failed = 0;

  for (const u of users) {
    if (!u.password) { console.log(`  skip ${u.email}: no password`); skipped++; continue; }
    try {
      // 1) create (or find) the auth user
      let uid = null;
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((x) => x.email === u.email);
      if (found) {
        uid = found.id;
        if (!found.user_metadata?.passwordSet) {
          await supabase.auth.admin.updateUserById(uid, {
            password: u.password,
            email_confirm: true,
            email_confirmations: true,
            user_metadata: { role: u.role, passwordSet: true },
          });
          updated++;
        } else updated++;
      } else {
        const { data: created, error: err } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { role: u.role, passwordSet: true },
        });
        if (err) throw err;
        uid = created.user.id;
      }
      // 2) map public.users row -> this auth id
      const { error: upd } = await supabase.from('users').update({ id: uid }).eq('email', u.email);
      if (upd) throw upd;
      ok++;
    } catch (e) {
      console.error(`  FAIL ${u.email}: ${e.message || e}`);
      failed++;
    }
  }
  console.log(`Done. created/updated=${ok} skipped=${skipped} failed=${failed}`);
  console.log('Login accounts now use the passwords from your Users.csv (default easygold1234).');
}

main();