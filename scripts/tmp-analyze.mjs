import fs from 'node:fs';
const js = fs.readFileSync(new URL('../dist/assets/index-B0Mv9ooF.js', import.meta.url), 'utf8');
// Find the th class definition and locate the table header JSX after it
const marker = 'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const wIdx = js.indexOf(marker);
console.log('wIdx =', wIdx);
// After w=..., N=...; return jsxs div space-y-4 ... find thead bg-slate-50
// Search forward for thead bg-slate-50 from wIdx
let i = js.indexOf('"thead",{className:"bg-slate-50"', wIdx);
console.log('thead idx =', i);
if (i >= 0) console.log(js.slice(Math.max(0, i - 300), i + 1800));