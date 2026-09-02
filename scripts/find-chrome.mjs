import fs from 'node:fs';
function findChrome(dir, depth) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return out; }
  for (const n of entries) {
    const full = dir + '\\' + n;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (depth > 0) out.push(...findChrome(full, depth - 1));
    } else if (/chrome\.exe$/i.test(n) || /chromium/i.test(n)) {
      out.push(full);
    }
  }
  return out;
}
const base = 'C:\\Users\\advice\\AppData\\Local\\ms-playwright';
console.log('--- chromium-1228 ---');
console.log(JSON.stringify(findChrome(base + '\\chromium-1228', 3)));
console.log('--- headless shell ---');
console.log(JSON.stringify(findChrome(base + '\\chromium_headless_shell-1228', 3)));
console.log('DONE');