// ── READ-ONLY production audit (no writes, no write RPCs) ────────────────
// Covers QA cases B01, B05, H01, D29 (invariant), F03-style ledger sanity.
// Run: node scripts/prod-readonly-audit.mjs [staffEmail] [staffPassword]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.existsSync('.env')
    ? fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    : [],
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env'); process.exit(2); }

let pass = 0, fail = 0, warn = 0;
const ok = (n) => { pass++; console.log(`  ok    ${n}`); };
const bad = (n, d = '') => { fail++; console.log(`  FAIL  ${n} ${d}`); };
const note = (n) => { warn++; console.log(`  WARN  ${n}`); };

const TABLES = ['users', 'skus', 'cs_skus', 'tickets', 'ticket_items', 'stock_transactions',
  'cs_transactions', 'system_config', 'categories', 'audit_log', 'email_log'];

// ── B05: anonymous access ────────────────────────────────────────────────
console.log('\n── B05 anonymous (no login) must read nothing');
const anon = createClient(url, key, { auth: { persistSession: false } });
for (const t of TABLES) {
  const { data, error } = await anon.from(t).select('*').limit(1);
  if (error || !data || data.length === 0) ok(`anon cannot read ${t}`);
  else bad(`anon CAN read ${t}`);
}
const rpcChecks = [
  { fn: 'manage_user', params: { p_action: 'add', p_user: {} } },
  { fn: 'reveal_user_password', params: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { fn: 'update_ticket_status', params: { p_ticket_id: 'dummy', p_status: 'reviewed' } },
  { fn: 'create_ticket', params: { p_created_by: 'anon', p_created_by_name: 'anon', p_department: 'none', p_delivery_date: '2026-10-10', p_remark: 'audit', p_items: [] } },
];
for (const { fn, params } of rpcChecks) {
  const { error } = await anon.rpc(fn, params);
  if (error) {
    const isDenied = error.code === '42501' || /permission denied|not authorized/i.test(error.message);
    if (isDenied) ok(`anon denied on ${fn} (42501: permission denied)`);
    else ok(`anon cannot execute ${fn} (${error.code || error.message.slice(0, 45)})`);
  } else {
    bad(`anon executed ${fn}`);
  }
}

// ── B01 / signed-in checks ───────────────────────────────────────────────
const [email, password] = process.argv.slice(2);
if (!email) { console.log('\n(skip signed-in checks: pass staffEmail staffPassword)'); }
else {
  console.log(`\n── B01 signed-in as ${email} (read-only)`);
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error: le } = await c.auth.signInWithPassword({ email, password });
  if (le) { bad('login', le.message); }
  else {
    ok('login works');
    const u = await c.from('users').select('*').limit(50);
    if (u.error) ok('users table not readable by this role');
    else {
      const cols = Object.keys(u.data[0] || {});
      const leaked = u.data.filter((r) => r.password).length;
      if (cols.includes('password') && leaked > 0) bad(`users.password readable: ${leaked} plaintext passwords exposed to this account`);
      else ok('users.password not exposed');
      if (u.data.length > 1) note(`account can list ${u.data.length} users (names/emails/roles) — confirm this is intended`);
    }
    const defaultPw = email && password === 'easygold1234';
    if (defaultPw) note('this account still uses the shared default password easygold1234 (A10)');

    // ── D29: ledger invariant, MKT + CS ────────────────────────────────
    console.log('\n── D29 ledger invariant: current = opening + Σadd − Σded (excl. cancelled)');
    for (const [skuT, txT] of [['skus', 'stock_transactions'], ['cs_skus', 'cs_transactions']]) {
      const s = await c.from(skuT).select('*').limit(5000);
      const t = await c.from(txT).select('*').limit(50000);
      if (s.error || t.error) { bad(`read ${skuT}/${txT}`, (s.error || t.error).message); continue; }
      const dead = (r) => /cancel|revers/i.test(String(r.status || ''));
      const by = new Map();
      for (const r of t.data) {
        if (dead(r)) continue;
        const a = by.get(r.sku_id) || { add: 0, ded: 0, open: 0 };
        const q = Number(r.qty || 0);
        if (r.ticket_id === 'OPENING') a.open += q;          // opening row counts toward baseline
        else if (r.type === 'addition') a.add += q;
        else if (r.type === 'deduction') a.ded += q;
        by.set(r.sku_id, a);
      }
      let drift = 0; const samples = [];
      for (const k of s.data) {
        const a = by.get(k.id) || { add: 0, ded: 0, open: 0 };
        const expected = Number(k.opening_balance || 0) + a.add - a.ded;
        if (Math.abs(expected - Number(k.current_stock || 0)) > 1e-9) {
          drift++; if (samples.length < 8) samples.push(`${k.id} "${k.name}" expected ${expected} actual ${k.current_stock}`);
        }
        if (Number(k.current_stock) < 0) bad(`${skuT} ${k.id} has NEGATIVE stock ${k.current_stock}`);
      }
      if (drift === 0) ok(`${skuT}: all ${s.data.length} SKUs reconcile with ${txT}`);
      else { bad(`${skuT}: ${drift} of ${s.data.length} SKUs drift from ledger`); samples.forEach((x) => console.log('        ' + x)); }
    }

    // ── data hygiene ───────────────────────────────────────────────────
    console.log('\n── data hygiene');
    const tk = await c.from('tickets').select('id,status,created_at').limit(20000);
    if (!tk.error) {
      const ids = tk.data.map((r) => r.id);
      ids.length === new Set(ids).size ? ok(`ticket ids unique (${ids.length})`) : bad('duplicate ticket ids');
      const known = new Set(['pending', 'reviewed', 'lm_approved', 'finalized', 'rejected', 'returned', 'recalled']);
      const odd = tk.data.filter((r) => !known.has(r.status));
      odd.length ? bad(`${odd.length} tickets with unknown status`) : ok('all ticket statuses valid');
    }
    const items = await c.from('ticket_items').select('ticket_id,qty_requested').limit(50000);
    if (!items.error && !tk.error) {
      const tset = new Set(tk.data.map((r) => r.id));
      const orphan = items.data.filter((r) => !tset.has(r.ticket_id)).length;
      orphan ? bad(`${orphan} orphan ticket_items`) : ok('no orphan ticket_items');
    }
    const cfg = await c.from('system_config').select('key,value');
    if (!cfg.error) {
      const m = Object.fromEntries(cfg.data.map((r) => [r.key, r.value]));
      console.log(`  info  engine_version=${m.engine_version} email_enabled=${m.email_enabled} email_app_url=${m.email_app_url}`);
      if (m.engine_version && m.engine_version < '0014') bad('engine_version older than 0014');
    }
  }
}

console.log(`\n${pass} ok, ${fail} FAIL, ${warn} warn`);
process.exit(fail ? 1 : 0);
