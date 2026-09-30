// ─────────────────────────────────────────────────────────────────────────
// Copies the canonical ticket-email engine into the browser bundle so the
// in-app preview renders exactly what the recipient receives.
//
//   canonical : supabase/functions/send-ticket-email/ticketEmail.ts
//   generated : src/lib/ticketEmail.ts      ← never edit by hand
//
// Run:  npm run email:template      (also runs before `functions:deploy`)
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SOURCE = resolve(root, 'supabase/functions/send-ticket-email/ticketEmail.ts');
const TARGET = resolve(root, 'src/lib/ticketEmail.ts');

const BANNER = `// ══════════════════════════════════════════════════════════════════════════
// GENERATED FILE — DO NOT EDIT.  Run \`npm run email:template\` instead.
// Source of truth: supabase/functions/send-ticket-email/ticketEmail.ts
// (shared by the Supabase Edge Function that sends the mail and by this app,
//  so the Settings → Email preview is byte-for-byte what the reader gets.)
// ══════════════════════════════════════════════════════════════════════════
`;

const source = readFileSync(SOURCE, 'utf8');

// Guard rails: the file must stay browser-safe (no Deno, no imports, no
// aliases) or the Vite build would break the moment a page imports it.
// Comments are stripped first so the prose in the header can mention them.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const problems = [];
if (/^\s*import\s/m.test(code)) problems.push('contains an import statement');
if (/\bDeno\b/.test(code)) problems.push('uses a Deno API');
if (/\bprocess\.env\b/.test(code)) problems.push('reads process.env');
if (/from '@\//.test(code)) problems.push("uses the '@/' alias");
if (problems.length) {
  console.error(`✖ ${SOURCE} is not browser-safe: ${problems.join('; ')}`);
  process.exit(1);
}

// Strip the canonical file's "edit this not that" note so the generated
// banner is the only instruction a reader sees.
const body = source.replace(
  /^\/\/ ── Ticket notification email[\s\S]*?\/\/ canonical copy only[^\n]*\n/u,
  '',
);

const out = `${BANNER}${body}`;
const prev = (() => { try { return readFileSync(TARGET, 'utf8'); } catch { return ''; } })();

if (prev === out) {
  console.log('✔ src/lib/ticketEmail.ts was already up to date');
} else {
  writeFileSync(TARGET, out, 'utf8');
  console.log(`✔ src/lib/ticketEmail.ts updated (${out.split('\n').length} lines)`);
}
