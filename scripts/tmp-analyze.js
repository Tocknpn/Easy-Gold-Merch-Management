const fs = require('fs');
const js = fs.readFileSync('dist/assets/index-B0Mv9ooF.js', 'utf8');
const terms = ['"Ticket"', '"Ticket ID"', '"Items"', '"Created"', '"Delivery"', '"Return due"', '"Last action"', '"Status"', '"Requester"', '"Department"', '"Type"', '"My Requests"', '"All Tickets"', '"Stock Movements"'];
for (const s of terms) {
  let i = js.indexOf(s), n = 0;
  while (i >= 0 && n < 3) { n++; console.log(s, n, '=>', i); i = js.indexOf(s, i + 1); }
  if (n === 0) console.log(s, '=> NOT FOUND');
}
console.log('--- around "Ticket" ---');
const i = js.indexOf('"Ticket"');
if (i >= 0) console.log(js.slice(Math.max(0, i - 500), i + 900));