// Functional smoke test for the in-memory demo engine (mirrors the SQL engine).
// Run: npx tsx scripts/smoke-test.ts
import { demoDB, demoLogin, demoTicketsWithItems } from '../src/lib/demoStore';
import { demoCreateTicket, demoUpdateTicketStatus } from '../src/lib/demoMutations';
import {
  demoAddSku, demoCsAddSku, demoCsDestockSku, demoRestockSku, demoTransferCsToMkt,
} from '../src/lib/demoData';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

console.log('-- Login (real seeded users) --');
const admin = demoLogin('tockppd@gmail.com', 'easygold1234');
check('admin login ok', admin.role === 'admin');
const cs = demoLogin('cs@easygold.com', 'easygold1234');
check('cs login ok', cs.role === 'customer_service');
try { demoLogin('tockppd@gmail.com', 'wrong'); check('bad password rejected', false); }
catch (e: any) { check('bad password rejected', /invalid password/i.test(e.message)); }

console.log('-- Ticket state machine --');
const sku = demoDB.skus[0];
const before = sku.currentStock;
const tktId = demoCreateTicket({
  createdBy: admin.email, createdByName: admin.fullName, department: admin.department,
  deliveryDate: '2026-12-01', remark: 'smoke', type: 'request',
  items: [{ skuId: sku.id, skuName: sku.name, qtyRequested: 10, unit: sku.unit }],
});
check('ticket created (pending)', demoDB.tickets.some((t) => t.id === tktId && t.status === 'pending'));

demoUpdateTicketStatus(tktId, 'reviewed', { actorName: 'WH', actorRole: 'warehouse', comment: 'ok' });
check('review booked stock (10 deducted)', demoDB.skus.find((s) => s.id === sku.id)!.currentStock === before - 10);
check('review tx logged', demoDB.transactions.some((tx) => tx.ticketId === tktId && tx.type === 'deduction'));

demoUpdateTicketStatus(tktId, 'lm_approved', { actorName: 'LM', actorRole: 'line_manager', comment: 'ok' });
check('lm_approved', demoDB.tickets.find((t) => t.id === tktId)!.status === 'lm_approved');
demoUpdateTicketStatus(tktId, 'finalized', { actorName: 'Dir', actorRole: 'director' });
check('finalized', demoDB.tickets.find((t) => t.id === tktId)!.status === 'finalized');

console.log('-- Reject returns stock --');
const t2 = demoCreateTicket({
  createdBy: admin.email, createdByName: admin.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku.id, skuName: sku.name, qtyRequested: 5, unit: sku.unit }],
});
demoUpdateTicketStatus(t2, 'reviewed', { actorName: 'WH', actorRole: 'warehouse' });
const afterReview2 = demoDB.skus.find((s) => s.id === sku.id)!.currentStock;
demoUpdateTicketStatus(t2, 'rejected', { actorName: 'WH', actorRole: 'warehouse', comment: 'nope' });
const afterReject = demoDB.skus.find((s) => s.id === sku.id)!.currentStock;
check('reject returns the 5', afterReject === afterReview2 + 5);
check('reject tx status', demoDB.transactions.some((tx) => tx.ticketId === t2 && tx.type === 'addition' && /Rejected/i.test(tx.status || '')));

console.log('-- CS transfer auto-restock --');
// pick an MKT-only SKU so we test auto-creation in CS
const mktOnly = demoDB.skus.find((s) => !demoDB.csSkus.some((c) => c.id === s.id))!;
const csSkuCount = demoDB.csSkus.length;
const t3 = demoCreateTicket({
  createdBy: cs.email, createdByName: cs.fullName, department: 'CS', type: 'cs_transfer',
  items: [{ skuId: mktOnly.id, skuName: mktOnly.name, qtyRequested: 20, unit: mktOnly.unit }],
});
demoUpdateTicketStatus(t3, 'reviewed', { actorName: 'WH', actorRole: 'warehouse' });
demoUpdateTicketStatus(t3, 'lm_approved', { actorName: 'LM', actorRole: 'line_manager' });
demoUpdateTicketStatus(t3, 'finalized', { actorName: 'Dir', actorRole: 'director' });
const csNewSku = demoDB.csSkus.find((s) => s.id === mktOnly.id);
check('cs auto-created from MKT', Boolean(csNewSku) && csNewSku.currentStock === 20 && demoDB.csSkus.length === csSkuCount + 1);
check('cs tx logged', demoDB.csTransactions.some((tx) => tx.ticketId === t3 && tx.type === 'addition'));

console.log('-- Borrow + return --');
const t4 = demoCreateTicket({
  createdBy: admin.email, createdByName: admin.fullName, department: 'MKT', type: 'borrow',
  deliveryDate: '2026-12-01', returnDate: '2026-12-10',
  items: [{ skuId: sku.id, skuName: sku.name, qtyRequested: 8, unit: sku.unit }],
});
demoUpdateTicketStatus(t4, 'reviewed', { actorName: 'WH', actorRole: 'warehouse' });
demoUpdateTicketStatus(t4, 'lm_approved', { actorName: 'LM', actorRole: 'line_manager' });
demoUpdateTicketStatus(t4, 'finalized', { actorName: 'Dir', actorRole: 'director' });
check('borrow active', demoTicketsWithItems().some((t) => t.id === t4 && t.status === 'finalized' && !t.returnedProcessed));
demoUpdateTicketStatus(t4, 'returned', {
  actorName: 'WH', actorRole: 'warehouse', comment: 'returned',
  returns: [{ skuId: sku.id, qtyReturned: 7, qtyBroken: 1 }],
});
const retTx = demoDB.transactions.find((tx) => tx.ticketId === t4 && tx.type === 'addition');
check('return added 7 + broken', Boolean(retTx) && retTx.qty === 7 && retTx.qtyBroken === 1);

console.log('-- SKU + CS operations --');
const newSkuId = demoAddSku({ name: 'Smoke Item', category: 'Merch', unit: 'pcs', openingBalance: 10, costPerUnit: 100 });
check('addSku + opening tx', demoDB.skus.some((s) => s.id === newSkuId) && demoDB.transactions.some((tx) => tx.ticketId === 'OPENING' && tx.skuId === newSkuId));
demoRestockSku(newSkuId, 5, 'WH');
check('restock +5', demoDB.skus.find((s) => s.id === newSkuId)!.currentStock === 15);
const csNew = demoCsAddSku({ name: 'CS Smoke', unit: 'pcs', openingBalance: 4 });
demoCsDestockSku(csNew, 1, 'CS');
check('cs destock', demoDB.csSkus.find((s) => s.id === csNew)!.currentStock === 3);
demoTransferCsToMkt(csNew, 2, 'WH');
check('cs→mkt transfer', demoDB.csSkus.find((s) => s.id === csNew)!.currentStock === 1 && demoDB.skus.some((s) => s.id === csNew && s.currentStock === 2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
try {
  demoUpdateTicketStatus(tktId, 'reviewed', { actorName: 'X', actorRole: 'warehouse' });
  check('illegal transition blocked', false);
} catch (e: any) { check('illegal transition blocked', /illegal transition/i.test(e.message)); }