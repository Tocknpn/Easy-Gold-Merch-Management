// ── Workflow & reporting test — exercises the SAME engine the UI uses ─────
// Covers: submit → ticket# → booking → WH review → LM → Director (per-role
// visibility), approval-level gating, reject at each stage, recall, MKT↔CS
// transfers, destock/loss, borrow returns, cs_transfer auto-restock and
// reporting math on transaction dates.
// Run: npx tsx scripts/workflow-test.ts
import { demoDB, demoLogin, demoTicketsWithItems } from '../src/lib/demoStore';
import { demoCreateTicket, demoUpdateTicketStatus } from '../src/lib/demoMutations';
import {
  demoAddSku, demoCsAddSku, demoCsDestockSku, demoRestockSku,
  demoMktDestockSku, demoTransferMktToCs, demoTransferCsToMkt,
} from '../src/lib/demoData';
import {
  getStockMovement, getMonthRows, actionableTicketCount,
  activeBorrows, overdueBorrows,
} from '../src/lib/stockMovement';
import { todayStr } from '../src/lib/utils';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};
const throws = (fn: () => unknown, re?: RegExp) => {
  try { fn(); return re ? false : true; }
  catch (e: any) { return re ? re.test(String(e.message)) : false; }
};
const skuStock = (id: string) => demoDB.skus.find((s) => s.id === id)!.currentStock;
const csStock = (id: string) => demoDB.csSkus.find((s) => s.id === id)?.currentStock ?? 0;

// nextId() in demoStore is millisecond-based; rapid sequential adds collide,
// so give every test SKU a guaranteed-unique id (see finding §F).
let skuSeq = 0;
const uniq = () => `wf-sku-${skuSeq++}`;
const addSku = (o: any) => demoAddSku({ id: uniq(), unit: 'pcs', costPerUnit: 1, ...o });
const addCsSku = (o: any) => demoCsAddSku({ id: uniq(), unit: 'pcs', costPerUnit: 1, ...o });

// ── helpers that mirror ActionCenterPage.roleQueue exactly ───────────────
const acQueue = (role: string) => demoTicketsWithItems().filter((t) => {
  if (role === 'warehouse') return t.status === 'pending' || (t.status === 'finalized' && t.type === 'borrow' && !t.returnedProcessed);
  if (role === 'line_manager') return t.status === 'reviewed';
  if (role === 'director') return t.status === 'lm_approved';
  if (role === 'admin') return !['finalized', 'rejected', 'returned', 'recalled'].includes(t.status);
  return false;
});
const myTickets = (email: string) => demoTicketsWithItems().filter((t) => t.createdBy.toLowerCase() === email.toLowerCase());

const staff = demoLogin('phonethida.easygold@gmail.com', 'easygold1234');   // staff
const wh    = demoLogin('somparthana.bpv@gmail.com', 'easygold1234');       // warehouse
const lm    = demoLogin('alounys08@gmail.com', 'easygold1234');             // line manager
const dir   = demoLogin('sphengxay@gmail.com', 'easygold1234');             // director
const adm   = demoLogin('tockppd@gmail.com', 'easygold1234');               // admin
const cs    = demoLogin('cs@easygold.com', 'easygold1234');                 // customer_service
const S = (email: string) => email.split('@')[0];

// ══════════════════════════════════════════════════════════════════════
console.log('\n── 1) Full request chain: submit → # → booking → WH → LM → Director');
const sku = addSku({ name: 'WF Test Mug', category: 'MKT', unit: 'pcs', openingBalance: 100, costPerUnit: 100, lowStockThreshold: 5 });
const before1 = skuStock(sku);
const t1 = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: staff.department,
  deliveryDate: '2026-12-01', remark: 'wf-happy', type: 'request',
  items: [{ skuId: sku, skuName: 'WF Test Mug', qtyRequested: 8, unit: 'pcs' }],
});
check(`ticket created with TKT number (${t1})`, /^TKT-/.test(t1));
check('status = pending', demoTicketsWithItems().find((t) => t.id === t1)!.status === 'pending');
check('booking deducted at submission (100→92)', skuStock(sku) === before1 - 8);
check('booking tx = deduction/Booked', demoDB.transactions.some((tx) => tx.ticketId === t1 && tx.type === 'deduction' && tx.status === 'Booked' && tx.qty === 8));
check('requester sees it in My Tickets', myTickets(staff.email).some((t) => t.id === t1));
check('WH Action Center sees pending', acQueue('warehouse').some((t) => t.id === t1));
check('LM does NOT see it yet', !acQueue('line_manager').some((t) => t.id === t1));
check('Director does NOT see it yet', !acQueue('director').some((t) => t.id === t1));
check('Admin sees it', acQueue('admin').some((t) => t.id === t1));
check('actionable badge count for WH ≥ 1', actionableTicketCount(demoDB.tickets, 'warehouse') >= 1);

demoUpdateTicketStatus(t1, 'reviewed', { actorName: S(wh.email), actorRole: 'warehouse', comment: 'booked 8', actualDeliveryDate: '2026-12-01', items: [{ skuId: sku, qtyApproved: 8 }] });
check('reviewed: status ok', demoTicketsWithItems().find((t) => t.id === t1)!.status === 'reviewed');
check('reviewed: no double deduction (still −8)', skuStock(sku) === before1 - 8);
check('reviewed: actual delivery date stored', demoTicketsWithItems().find((t) => t.id === t1)!.actualDeliveryDate === '2026-12-01');
check('WH queue no longer shows it', !acQueue('warehouse').some((t) => t.id === t1));
check('LM queue now shows it', acQueue('line_manager').some((t) => t.id === t1));

demoUpdateTicketStatus(t1, 'lm_approved', { actorName: S(lm.email), actorRole: 'line_manager', comment: 'ok by LM' });
check('lm_approved', demoTicketsWithItems().find((t) => t.id === t1)!.status === 'lm_approved');
check('Director queue now shows it', acQueue('director').some((t) => t.id === t1));
check('LM queue cleared', !acQueue('line_manager').some((t) => t.id === t1));

demoUpdateTicketStatus(t1, 'finalized', { actorName: S(dir.email), actorRole: 'director', comment: 'go' });
const t1r = demoTicketsWithItems().find((t) => t.id === t1)!;
check('finalized', t1r.status === 'finalized');
check('stock stays at −8 after finalize', skuStock(sku) === before1 - 8);
check('Director & Admin queues cleared', !acQueue('director').some((t) => t.id === t1) && !acQueue('admin').some((t) => t.id === t1));
check('audit trail has all 4 steps', demoDB.actions.filter((a) => a.ticketId === t1).length >= 4);

console.log('\n── 2) Approval-level enforcement (no skipping, no cross-role)');
const sku2 = addSku({ name: 'WF Gating', category: 'MKT', unit: 'pcs', openingBalance: 50 });
const t2 = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku2, skuName: 'WF Gating', qtyRequested: 4, unit: 'pcs' }],
});
check('pending → lm_approved blocked', throws(() => demoUpdateTicketStatus(t2, 'lm_approved', { actorRole: 'line_manager' }), /illegal transition/i));
check('pending → finalized blocked', throws(() => demoUpdateTicketStatus(t2, 'finalized', { actorRole: 'director' }), /illegal transition/i));
check('pending → recalled blocked (matches SQL)', throws(() => demoUpdateTicketStatus(t2, 'recalled', { actorRole: 'warehouse' }), /illegal transition/i));
demoUpdateTicketStatus(t2, 'reviewed', { actorRole: 'warehouse' });
check('reviewed → finalized blocked', throws(() => demoUpdateTicketStatus(t2, 'finalized', { actorRole: 'director' }), /illegal transition/i));
check('reviewed → reviewed blocked (idempotency guard)', throws(() => demoUpdateTicketStatus(t2, 'reviewed', { actorRole: 'warehouse' }), /illegal transition/i));
check('returned on non-borrow blocked', throws(() => demoUpdateTicketStatus(t2, 'returned', { actorRole: 'warehouse', returns: [{ skuId: sku2, qtyReturned: 4, qtyBroken: 0 }] }), /illegal transition/i));
const gatedBefore = skuStock(sku2);
demoUpdateTicketStatus(t2, 'finalized', { actorRole: 'admin', forceFinalize: true });
check('admin emergency finalize (force) from reviewed works', demoTicketsWithItems().find((t) => t.id === t2)!.status === 'finalized');
check('emergency finalize did NOT double-deduct', skuStock(sku2) === gatedBefore);

console.log('\n── 2b) Role enforcement (server-side mirror: real-user lookup)');
const skuR = addSku({ name: 'WF Role', category: 'MKT', unit: 'pcs', openingBalance: 40 });
const tR = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuR, skuName: 'WF Role', qtyRequested: 4, unit: 'pcs' }],
});
check('staff cannot review', throws(() => demoUpdateTicketStatus(tR, 'reviewed', { actorName: staff.fullName, actorRole: staff.role }), /not authorized/i));
check('staff cannot finalize (even with force)', throws(() => demoUpdateTicketStatus(tR, 'finalized', { actorName: staff.fullName, actorRole: staff.role, forceFinalize: true }), /not authorized/i));
check('customer_service cannot approve', throws(() => demoUpdateTicketStatus(tR, 'lm_approved', { actorName: cs.fullName, actorRole: cs.role }), /not authorized/i));
demoUpdateTicketStatus(tR, 'reviewed', { actorName: wh.fullName, actorRole: wh.role });
check('warehouse CAN review (real-name lookup)', demoTicketsWithItems().find((t) => t.id === tR)!.status === 'reviewed');
check('staff cannot approve as LM', throws(() => demoUpdateTicketStatus(tR, 'lm_approved', { actorName: staff.fullName, actorRole: staff.role }), /not authorized/i));
demoUpdateTicketStatus(tR, 'lm_approved', { actorName: lm.fullName, actorRole: lm.role });
check('line_manager CAN approve', demoTicketsWithItems().find((t) => t.id === tR)!.status === 'lm_approved');
check('warehouse cannot finalize', throws(() => demoUpdateTicketStatus(tR, 'finalized', { actorName: wh.fullName, actorRole: wh.role }), /not authorized/i));
check('staff cannot reject', throws(() => demoUpdateTicketStatus(tR, 'rejected', { actorName: staff.fullName, actorRole: staff.role }), /not authorized/i));
check('director cannot recall (only WH/admin/creator)', throws(() => demoUpdateTicketStatus(tR, 'recalled', { actorName: dir.fullName, actorRole: dir.role }), /not authorized/i));
demoUpdateTicketStatus(tR, 'finalized', { actorName: dir.fullName, actorRole: dir.role });
check('director CAN finalize', demoTicketsWithItems().find((t) => t.id === tR)!.status === 'finalized');

console.log('\n── 3) Reject at each stage returns booked stock');
const sku3 = addSku({ name: 'WF Reject', category: 'MKT', unit: 'pcs', openingBalance: 60 });
const t3a = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 5, unit: 'pcs' }],
});
const b3a = skuStock(sku3);
demoUpdateTicketStatus(t3a, 'rejected', { actorRole: 'warehouse', comment: 'no' });
check('reject(pending) releases booking +5', skuStock(sku3) === b3a + 5);
check('reject tx status Booking Released', demoDB.transactions.some((tx) => tx.ticketId === t3a && tx.type === 'addition' && tx.status === 'Rejected - Booking Released'));
const t3b = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 10, unit: 'pcs' }],
});
demoUpdateTicketStatus(t3b, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku3, qtyApproved: 6 }] });
const b3b = skuStock(sku3);
demoUpdateTicketStatus(t3b, 'rejected', { actorRole: 'line_manager', comment: 'LM override' });
check('reject(reviewed) returns approved 6', skuStock(sku3) === b3b + 6);
check('reject tx status Stock Returned', demoDB.transactions.some((tx) => tx.ticketId === t3b && tx.type === 'addition' && tx.status === 'Rejected - Stock Returned'));
const t3c = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 7, unit: 'pcs' }],
});
demoUpdateTicketStatus(t3c, 'reviewed', { actorRole: 'warehouse' });
demoUpdateTicketStatus(t3c, 'lm_approved', { actorRole: 'line_manager' });
const b3c = skuStock(sku3);
demoUpdateTicketStatus(t3c, 'rejected', { actorRole: 'director', comment: 'director veto' });
check('reject(lm_approved) returns stock', skuStock(sku3) === b3c + 7);
console.log('\n── 4) Recall (warehouse + creator), incl. pending blocked');
// pending → recalled already proven blocked in §2. Warehouse recall from reviewed:
const sku4 = addSku({ name: 'WF Recall', category: 'MKT', unit: 'pcs', openingBalance: 40 });
const t4wh = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku4, skuName: 'WF Recall', qtyRequested: 6, unit: 'pcs' }],
});
demoUpdateTicketStatus(t4wh, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku4, qtyApproved: 6 }] });
const b4 = skuStock(sku4);
demoUpdateTicketStatus(t4wh, 'recalled', { actorRole: 'warehouse', comment: 'reorder needed' });
check('warehouse recall(reviewed) returns stock', skuStock(sku4) === b4 + 6);
check('recall tx status Recalled - Stock Returned', demoDB.transactions.some((tx) => tx.ticketId === t4wh && tx.type === 'addition' && tx.status === 'Recalled - Stock Returned'));
check('ticket now recalled', demoTicketsWithItems().find((t) => t.id === t4wh)!.status === 'recalled');
check('recalled ticket leaves every approval queue', !acQueue('warehouse').some((t) => t.id === t4wh) && !acQueue('line_manager').some((t) => t.id === t4wh) && !acQueue('director').some((t) => t.id === t4wh) && !acQueue('admin').some((t) => t.id === t4wh));
const t4cr = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku4, skuName: 'WF Recall', qtyRequested: 3, unit: 'pcs' }],
});
demoUpdateTicketStatus(t4cr, 'reviewed', { actorRole: 'warehouse' });
demoUpdateTicketStatus(t4cr, 'lm_approved', { actorRole: 'line_manager' });
const b4c = skuStock(sku4);
demoUpdateTicketStatus(t4cr, 'recalled', { actorName: staff.fullName, actorRole: 'staff', comment: 'wrong qty' });
check('creator recall(lm_approved) returns stock', skuStock(sku4) === b4c + 3);

console.log('\n── 5) Borrow lifecycle: booking → finalize → active/overdue → return');
const sku5 = addSku({ name: 'WF Borrow', category: 'MKT', unit: 'pcs', openingBalance: 80 });
const t5 = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'borrow',
  deliveryDate: '2026-12-10', returnDate: '2026-09-05',
  items: [{ skuId: sku5, skuName: 'WF Borrow', qtyRequested: 10, unit: 'pcs' }],
});
demoUpdateTicketStatus(t5, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku5, qtyApproved: 10 }] });
demoUpdateTicketStatus(t5, 'lm_approved', { actorRole: 'line_manager' });
demoUpdateTicketStatus(t5, 'finalized', { actorRole: 'director' });
check('borrow active after finalize', activeBorrows(demoDB.tickets).some((t) => t.id === t5));
check('borrow shows in WH queue (return to process)', acQueue('warehouse').some((t) => t.id === t5));
check('overdue detected (return date < today)', overdueBorrows(demoDB.tickets).some((t) => t.id === t5));
const st5 = skuStock(sku5);
demoUpdateTicketStatus(t5, 'returned', {
  actorRole: 'warehouse', comment: 'back safe',
  returns: [{ skuId: sku5, qtyReturned: 7, qtyBroken: 1 }],
});
check('return adds back 7 (not 10)', skuStock(sku5) === st5 + 7);
check('return tx records broken=1', demoDB.transactions.some((tx) => tx.ticketId === t5 && tx.type === 'addition' && tx.qty === 7 && tx.qtyBroken === 1));
check('return comment flags broken/lost', demoDB.transactions.some((tx) => tx.ticketId === t5 && tx.comment?.includes('1 broken/lost')));
check('no longer active borrow', !activeBorrows(demoDB.tickets).some((t) => t.id === t5));
check('no longer in WH queue', !acQueue('warehouse').some((t) => t.id === t5));

console.log('\n── 6) CS transfer ticket: books MKT, auto-restocks CS at finalize');
const sku6 = addSku({ name: 'WF CTSku', category: 'MKT', unit: 'pcs', openingBalance: 90 });
const before6m = skuStock(sku6), before6c = csStock(sku6);
const t6 = demoCreateTicket({
  createdBy: cs.email, createdByName: cs.fullName, department: cs.department, type: 'cs_transfer',
  deliveryDate: '2026-12-02', remark: 'restock CS',
  items: [{ skuId: sku6, skuName: 'WF CTSku', qtyRequested: 12, unit: 'pcs' }],
});
check('cs_transfer books MKT at submission (90→78)', skuStock(sku6) === before6m - 12);
check('CS not credited before finalize', csStock(sku6) === before6c);
demoUpdateTicketStatus(t6, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku6, qtyApproved: 10 }] });
check('review true-up releases over-booked 2 back to MKT', skuStock(sku6) === before6m - 10);
demoUpdateTicketStatus(t6, 'lm_approved', { actorRole: 'line_manager' });
check('CS still not credited at lm_approved', csStock(sku6) === before6c);
demoUpdateTicketStatus(t6, 'finalized', { actorRole: 'director' });
check('CS credited +10 at finalize', csStock(sku6) === before6c + 10);
check('CS tx logged with auto-transfer comment', demoDB.csTransactions.some((tx) => tx.ticketId === t6 && tx.type === 'addition' && tx.comment?.includes('Auto-transferred from MKT WH - Ticket: ' + t6)));
check('CS genesis SKU created (opening balance = 10)', demoDB.csSkus.some((s) => s.id === sku6 && s.openingBalance === 10 && s.currentStock === before6c + 10));
check('combined MKT+CS total preserved', (skuStock(sku6) + csStock(sku6)) === (before6m - 10) + (before6c + 10));
console.log('\n── 7) MKT ↔ CS manual transfers (move stock)');
const sku7m = addSku({ name: 'WF Move', category: 'MKT', unit: 'pcs', openingBalance: 30 });
const b7 = skuStock(sku7m), c7 = csStock(sku7m);
demoTransferMktToCs(sku7m, 5, S(wh.email), 'send to CS');
check('MKT→CS: MKT −5', skuStock(sku7m) === b7 - 5);
check('MKT→CS: CS +5', csStock(sku7m) === c7 + 5);
check('MKT→CS: tx in both ledgers', demoDB.transactions.some((tx) => tx.ticketId === 'MKT_TRANSFER' && tx.skuId === sku7m && tx.type === 'deduction') && demoDB.csTransactions.some((tx) => tx.skuId === sku7m && tx.type === 'addition'));
const b7b = skuStock(sku7m), c7b = csStock(sku7m);
demoTransferCsToMkt(sku7m, 5, S(wh.email));
check('CS→MKT: CS −5', csStock(sku7m) === c7b - 5);
check('CS→MKT: MKT +5', skuStock(sku7m) === b7b + 5);
check('over-transfer MKT blocked', throws(() => demoTransferMktToCs(sku7m, skuStock(sku7m) + 1, S(wh.email)), /invalid transfer quantity|insufficient/i));
check('zero/negative transfer blocked', throws(() => demoTransferMktToCs(sku7m, 0, S(wh.email)), /invalid transfer quantity/i));

console.log('\n── 8) Destock / loss / rebalance (MKT + CS)');
const sku8 = addSku({ name: 'WF Destock', category: 'MKT', unit: 'pcs', openingBalance: 20 });
demoMktDestockSku(sku8, 3, S(wh.email), 'event giveaways');
check('MKT destock −3', skuStock(sku8) === 17);
demoMktDestockSku(sku8, 2, S(wh.email), 'broken in storage', 2);
check('MKT loss write-off −2 + broken flag', skuStock(sku8) === 15 && demoDB.transactions.some((tx) => tx.skuId === sku8 && tx.qty === 2 && tx.qtyBroken === 2));
const cs8 = addCsSku({ name: 'WF CS Destock', category: 'CS', unit: 'pcs', openingBalance: 12 });
demoCsDestockSku(cs8, 4, S(cs.email), 'customer giveaways');
check('CS destock −4', demoDB.csSkus.find((s) => s.id === cs8)!.currentStock === 8);
demoCsDestockSku(cs8, 999, 'CS');
check('CS destock cannot go below 0', demoDB.csSkus.find((s) => s.id === cs8)!.currentStock === 0);
const sku8b = addSku({ name: 'WF Rebalance', category: 'MKT', unit: 'pcs', openingBalance: 10 });
demoMktDestockSku(sku8b, 7, S(wh.email), 'initial count: 3 left');
check('rebalance path (destock diff) works', skuStock(sku8b) === 3);

console.log('\n── 9) Reporting: transaction dates, opening/closing math, month rows');
const rmSku = addSku({ name: 'WF Report', category: 'MKT', unit: 'pcs', openingBalance: 50, costPerUnit: 10 });
const rt1 = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  deliveryDate: '2026-12-03',
  items: [{ skuId: rmSku, skuName: 'WF Report', qtyRequested: 10, unit: 'pcs' }],
});
demoUpdateTicketStatus(rt1, 'reviewed', { actorRole: 'warehouse', actualDeliveryDate: '2026-12-03', items: [{ skuId: rmSku, qtyApproved: 10 }] });
demoUpdateTicketStatus(rt1, 'lm_approved', { actorRole: 'line_manager' });
demoUpdateTicketStatus(rt1, 'finalized', { actorRole: 'director' });
const today = todayStr();
const mv = getStockMovement(demoDB.skus.find((s) => s.id === rmSku)!, demoDB.transactions, today, today);
check('report: stockOut = 10 (the booking/issue tx dated today)', mv.stockOut === 10);
check('report: opening = 50, closing = current (40)', mv.opening === 50 && mv.closing === 40);
check('report: opening + in − out === closing', mv.opening + mv.stockIn - mv.stockOut === mv.closing);
const monthRows = getMonthRows(demoDB.skus.filter((s) => s.id === rmSku), demoDB.transactions, today.slice(0, 7));
check('month rows balance open+in−out=close', monthRows.every((r) => r.openingQty + r.stockInQty - r.stockOutQty === r.closingQty));
const mvPrev = getStockMovement(demoDB.skus.find((s) => s.id === rmSku)!, demoDB.transactions, '2026-01-01', '2026-01-31');
check('report: old range shows zero movement', mvPrev.stockOut === 0);
const rmTicket = demoTicketsWithItems().find((t) => t.id === rt1)!;
check('ticket.deliveryDate stored (2026-12-03)', rmTicket.deliveryDate === '2026-12-03');
check('ticket.actualDeliveryDate stored (2026-12-03)', rmTicket.actualDeliveryDate === '2026-12-03');
const allTx = demoDB.transactions.filter((tx) => tx.ticketId === rt1);
check('all workflow txs have YYYY-MM-DD date', allTx.every((tx) => /^\d{4}-\d{2}-\d{2}$/.test(tx.date || '')));

console.log('\n── 10) Edge: over-approval at review is now CAPPED at requested');
const skuA = addSku({ name: 'WF Overapprove', category: 'MKT', unit: 'pcs', openingBalance: 30 });
const tA = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuA, skuName: 'WF Overapprove', qtyRequested: 5, unit: 'pcs' }],
});
const bA = skuStock(skuA);   // after booking: 30 − 5 = 25
demoUpdateTicketStatus(tA, 'reviewed', { actorName: wh.fullName, actorRole: wh.role, items: [{ skuId: skuA, qtyApproved: 12 }] });
check('over-approval capped to requested (approved 12 → 5, NO extra deduction)', skuStock(skuA) === bA);
check('qty_approved recorded = 5 (not 12)', demoDB.items[tA].find((i) => i.skuId === skuA)!.qtyApproved === 5);
demoUpdateTicketStatus(tA, 'rejected', { actorName: wh.fullName, actorRole: wh.role, comment: 'x' });
check('reject after capped review returns the 5 → back to opening 30', skuStock(skuA) === bA + 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
