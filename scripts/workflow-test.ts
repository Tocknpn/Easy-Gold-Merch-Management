// ── Workflow & reporting test — exercises the SAME engine the UI uses ─────
// Covers: submit → ticket# → booking → WH review → LM → Director (per-role
// visibility), approval-level gating, reject at each stage, recall, MKT↔CS
// transfers, destock/loss, borrow returns, cs_transfer auto-restock and
// reporting math on transaction dates.
// Run: npx tsx scripts/workflow-test.ts
import { demoDB, demoLogin, demoTicketsWithItems } from '../src/lib/demoStore';
import { demoCreateTicket, demoUpdateTicketStatus } from '../src/lib/demoMutations';
import {
  demoAddSku, demoCsAddSku, demoCsDestockSku, demoRestockSku, demoCsRestockSku,
  demoEditStockMovement, demoMktDestockSku, demoTransferMktToCs, demoTransferCsToMkt, demoUpdateSku,
  demoManageConfig,
} from '../src/lib/demoData';
import { demoFetchAudit } from '../src/lib/demoAudit';
import {
  getStockMovement, getMonthRows, getMonthMovement, getMonthEndRows, actionableTicketCount,
  activeBorrows, overdueBorrows, reportableTransactions,
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
  // warehouse: pending approvals only — finalized borrows waiting for return are
  // tracked in Ticket Tracking ("To return to WH"), not the Action Center.
  if (role === 'warehouse') return t.status === 'pending';
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

console.log('\n── 1b) Warehouse Manager request skips the warehouse step (migration 0017)');
const skuW = addSku({ name: 'WF WH Self', category: 'MKT', unit: 'pcs', openingBalance: 30, costPerUnit: 50 });
const beforeW = skuStock(skuW);
const tW = demoCreateTicket({
  createdBy: wh.email, createdByName: wh.fullName, department: wh.department,
  deliveryDate: '2026-12-04', remark: 'wf-wh-self', type: 'request',
  items: [{ skuId: skuW, skuName: 'WF WH Self', qtyRequested: 6, unit: 'pcs' }],
});
const tWr = () => demoTicketsWithItems().find((t) => t.id === tW)!;
check('warehouse request is created already reviewed', tWr().status === 'reviewed');
check('warehouse request never enters the warehouse queue', !acQueue('warehouse').some((t) => t.id === tW));
check('warehouse request is in the LINE MANAGER queue', acQueue('line_manager').some((t) => t.id === tW));
check('booking made once at submission (30→24)', skuStock(skuW) === beforeW - 6);
check('booking row is deduction/Booked', demoDB.transactions.some((tx) => tx.ticketId === tW && tx.type === 'deduction' && tx.status === 'Booked' && tx.qty === 6));
check('qty approved confirmed as requested', tWr().items[0]!.qtyApproved === 6);
check('auto-review note stored on the ticket', /auto-reviewed/i.test(String(tWr().whComment || '')));
check('auto-review note is timestamped', !!tWr().whCommentAt);
check('trail carries Submitted + Reviewed', demoDB.actions.filter((a) => a.ticketId === tW).length === 2);
check('warehouse cannot review its own ticket again', throws(() => demoUpdateTicketStatus(tW, 'reviewed', { actorName: wh.fullName, actorRole: 'warehouse' }), /illegal transition/i));

demoUpdateTicketStatus(tW, 'lm_approved', { actorName: S(lm.email), actorRole: 'line_manager', comment: 'ok by LM' });
check('Line Manager approves without a warehouse step', tWr().status === 'lm_approved');
check('no extra deduction on LM approval', skuStock(skuW) === beforeW - 6);
check('Director queue now shows it', acQueue('director').some((t) => t.id === tW));
demoUpdateTicketStatus(tW, 'finalized', { actorName: S(dir.email), actorRole: 'director', comment: 'go' });
check('finalized end-to-end, stock still −6', tWr().status === 'finalized' && skuStock(skuW) === beforeW - 6);

// The rule must NOT leak to other roles — staff still starts pending.
const skuS = addSku({ name: 'WF Staff Pending', category: 'MKT', unit: 'pcs', openingBalance: 10 });
const tS = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: staff.department,
  deliveryDate: '2026-12-04', type: 'request',
  items: [{ skuId: skuS, skuName: 'WF Staff Pending', qtyRequested: 2, unit: 'pcs' }],
});
check('staff request still starts pending', demoTicketsWithItems().find((t) => t.id === tS)!.status === 'pending');
check('staff request still reaches the warehouse queue', acQueue('warehouse').some((t) => t.id === tS));

console.log('\n── 2) Approval-level enforcement (no skipping, no cross-role)');
const sku2 = addSku({ name: 'WF Gating', category: 'MKT', unit: 'pcs', openingBalance: 50 });
const t2 = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku2, skuName: 'WF Gating', qtyRequested: 4, unit: 'pcs' }],
});
check('pending → lm_approved blocked', throws(() => demoUpdateTicketStatus(t2, 'lm_approved', { actorRole: 'line_manager' }), /illegal transition/i));
check('pending → finalized blocked', throws(() => demoUpdateTicketStatus(t2, 'finalized', { actorRole: 'director' }), /illegal transition/i));
// pending recall is now allowed (WH/admin/creator) and releases the booking
const sku2r = addSku({ name: 'WF Recall Pending', category: 'MKT', unit: 'pcs', openingBalance: 10 });
const t2r = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku2r, skuName: 'WF Recall Pending', qtyRequested: 4, unit: 'pcs' }],
});
const recBefore = skuStock(sku2r);
demoUpdateTicketStatus(t2r, 'recalled', { actorRole: 'warehouse' });
check('pending → recalled works now (matches SQL)', demoTicketsWithItems().find((t) => t.id === t2r)!.status === 'recalled');
check('pending recall returns the booking to stock', skuStock(sku2r) === recBefore + 4);
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

console.log('\n── 3) Reject at each stage releases the booking (no phantom stock-in)');
const sku3 = addSku({ name: 'WF Reject', category: 'MKT', unit: 'pcs', openingBalance: 60 });
const t3a = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 5, unit: 'pcs' }],
});
const b3a = skuStock(sku3);
demoUpdateTicketStatus(t3a, 'rejected', { actorRole: 'warehouse', comment: 'no' });
check('reject(pending) releases booking +5', skuStock(sku3) === b3a + 5);
check('reject cancels the booking row', demoDB.transactions.some((tx) => tx.ticketId === t3a && tx.type === 'deduction' && tx.status === 'Booking Cancelled'));
check('reject writes NO reversal stock-in row', !demoDB.transactions.some((tx) => tx.ticketId === t3a && tx.type === 'addition'));
check('rejected ticket reports zero stock in/out', (() => {
  const dead = demoTicketsWithItems();
  const tx = reportableTransactions(demoDB.transactions, dead).filter((x) => x.ticketId === t3a);
  return tx.length === 0;
})());
const t3b = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 10, unit: 'pcs' }],
});
demoUpdateTicketStatus(t3b, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku3, qtyApproved: 6 }] });
const b3b = skuStock(sku3);
demoUpdateTicketStatus(t3b, 'rejected', { actorRole: 'line_manager', comment: 'LM override' });
check('reject(reviewed) returns approved 6', skuStock(sku3) === b3b + 6);
check('reject(reviewed) cancels the confirmed booking', demoDB.transactions.some((tx) => tx.ticketId === t3b && tx.status === 'Booking Cancelled'));
check('reject(reviewed) writes NO reversal stock-in row', !demoDB.transactions.some((tx) => tx.ticketId === t3b && tx.type === 'addition'));
const t3c = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku3, skuName: 'WF Reject', qtyRequested: 7, unit: 'pcs' }],
});
demoUpdateTicketStatus(t3c, 'reviewed', { actorRole: 'warehouse' });
demoUpdateTicketStatus(t3c, 'lm_approved', { actorRole: 'line_manager' });
const b3c = skuStock(sku3);
demoUpdateTicketStatus(t3c, 'rejected', { actorRole: 'director', comment: 'director veto' });
check('reject(lm_approved) returns stock', skuStock(sku3) === b3c + 7);
console.log('\n── 4) Recall (warehouse + creator), incl. pending recall (proven in §2)');
// Warehouse recall from reviewed (pending recall works — proven in §2):
const sku4 = addSku({ name: 'WF Recall', category: 'MKT', unit: 'pcs', openingBalance: 40 });
const t4wh = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: sku4, skuName: 'WF Recall', qtyRequested: 6, unit: 'pcs' }],
});
demoUpdateTicketStatus(t4wh, 'reviewed', { actorRole: 'warehouse', items: [{ skuId: sku4, qtyApproved: 6 }] });
const b4 = skuStock(sku4);
demoUpdateTicketStatus(t4wh, 'recalled', { actorRole: 'warehouse', comment: 'reorder needed' });
check('warehouse recall(reviewed) returns stock', skuStock(sku4) === b4 + 6);
check('recall cancels the booking row', demoDB.transactions.some((tx) => tx.ticketId === t4wh && tx.status === 'Booking Cancelled'));
check('recall writes NO reversal stock-in row', !demoDB.transactions.some((tx) => tx.ticketId === t4wh && tx.type === 'addition'));
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
check('recall comment is timestamped for My Ticket', !!demoTicketsWithItems().find((t) => t.id === t4wh)!.lastActionAt);

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
check('borrow NOT in WH Action Center (tracked in Ticket Tracking instead)', !acQueue('warehouse').some((t) => t.id === t5));
check('WH actionable badge ignores waiting returns (only pending)', actionableTicketCount(demoDB.tickets, 'warehouse') === demoDB.tickets.filter((t) => t.status === 'pending').length);
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
check('returned borrow no longer listed as waiting', !activeBorrows(demoDB.tickets).some((t) => t.id === t5));

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
// The arrival that CREATED the CS item is its opening balance, so the ledger row
// is stamped OPENING and the dashboard shows it under Opening only (a ticket
// reference there made it count as Opening AND Stock In — see migration 0019).
const cs6 = () => demoDB.csSkus.find((s) => s.id === sku6)!;
check('CS genesis receipt stamped OPENING (not the ticket id)', demoDB.csTransactions.some((tx) => tx.ticketId === 'OPENING' && tx.skuId === sku6 && tx.qty === 10 && tx.comment?.includes('Auto-transferred from MKT WH - Ticket: ' + t6)));
check('CS genesis arrival is not counted as Stock In', getStockMovement(cs6(), demoDB.csTransactions).stockIn === 0);
check('CS genesis SKU created (opening balance = 10)', cs6().openingBalance === 10 && cs6().currentStock === before6c + 10);
check('combined MKT+CS total preserved', (skuStock(sku6) + csStock(sku6)) === (before6m - 10) + (before6c + 10));

// A SECOND cs_transfer for the same item is a normal refill → real ticket id,
// so it shows up as Stock In while Opening keeps the genesis quantity.
const t6b = demoCreateTicket({
  createdBy: cs.email, createdByName: cs.fullName, department: cs.department, type: 'cs_transfer',
  deliveryDate: '2026-12-03', remark: 'top up CS',
  items: [{ skuId: sku6, skuName: 'WF CTSku', qtyRequested: 4, unit: 'pcs' }],
});
demoUpdateTicketStatus(t6b, 'reviewed', { actorRole: 'warehouse' });
demoUpdateTicketStatus(t6b, 'lm_approved', { actorRole: 'line_manager' });
demoUpdateTicketStatus(t6b, 'finalized', { actorRole: 'director' });
check('CS refill credited +4', csStock(sku6) === before6c + 14);
check('CS refill stamped with the ticket id', demoDB.csTransactions.some((tx) => tx.ticketId === t6b && tx.skuId === sku6 && tx.type === 'addition' && tx.qty === 4));
check('CS refill counts as Stock In (+4), Opening unchanged at 10', getStockMovement(cs6(), demoDB.csTransactions).stockIn === 4 && cs6().openingBalance === 10);
console.log('\n── 7) MKT ↔ CS manual transfers (move stock)');
const sku7m = addSku({ name: 'WF Move', category: 'MKT', unit: 'pcs', openingBalance: 30 });
const b7 = skuStock(sku7m), c7 = csStock(sku7m);
demoTransferMktToCs(sku7m, 5, S(wh.email), 'send to CS');
check('MKT→CS: MKT −5', skuStock(sku7m) === b7 - 5);
check('MKT→CS: CS +5', csStock(sku7m) === c7 + 5);
check('MKT→CS: CS item auto-created and visible', demoDB.csSkus.some((s) => s.id === sku7m && s.currentStock === 5 && s.openingBalance === 5));
check('MKT→CS: first arrival stamped OPENING (no phantom Stock In)', demoDB.csTransactions.some((tx) => tx.ticketId === 'OPENING' && tx.skuId === sku7m && tx.qty === 5) && getStockMovement(demoDB.csSkus.find((s) => s.id === sku7m)!, demoDB.csTransactions).stockIn === 0);
check('MKT→CS: tx in both ledgers', demoDB.transactions.some((tx) => tx.ticketId === 'MKT_TRANSFER' && tx.skuId === sku7m && tx.type === 'deduction') && demoDB.csTransactions.some((tx) => tx.skuId === sku7m && tx.type === 'addition'));
// Second arrival of the same item is a real Stock In (the item already exists)
demoTransferMktToCs(sku7m, 3, S(wh.email), 'top-up');
check('MKT→CS: later arrival is a real Stock In (+3)', demoDB.csTransactions.some((tx) => tx.ticketId === 'MKT_TRANSFER' && tx.skuId === sku7m && tx.type === 'addition' && tx.qty === 3) && getStockMovement(demoDB.csSkus.find((s) => s.id === sku7m)!, demoDB.csTransactions).stockIn === 3);
const b7b = skuStock(sku7m), c7b = csStock(sku7m);
demoTransferCsToMkt(sku7m, 5, S(wh.email));
check('CS→MKT: CS −5', csStock(sku7m) === c7b - 5);
check('CS→MKT: MKT +5', skuStock(sku7m) === b7b + 5);
check('CS→MKT: MKT receipt is a Stock In (item already exists)', demoDB.transactions.some((tx) => tx.ticketId === 'CS_TRANSFER' && tx.skuId === sku7m && tx.type === 'addition' && tx.qty === 5));
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

// ── 9b) Month End Report — "Month End Report.md" (dynamic month snapshot) ─
// Opening rolls every movement back from the 1st of the month (so a brand-new
// item starts at 0 and its OPENING genesis row shows as Stock In), Closing
// rolls back only the movements AFTER the month end, and "All" merges the MKT
// and CS rows (quantities AND values summed, each side keeps its own cost).
const curMonth = today.slice(0, 7);
const now = new Date();
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

// Scenario A — a brand-new item is created this month with 100 pcs @ cost 7
const meSku = addSku({ name: 'WF MonthEnd', category: 'MKT', unit: 'pcs', openingBalance: 100, costPerUnit: 7 });
const meCur = getMonthRows(demoDB.skus.filter((s) => s.id === meSku), demoDB.transactions, curMonth)[0];
check('month end: brand-new item opens at 0 (genesis rule)', meCur.openingQty === 0);
check('month end: the OPENING genesis stock counts as Stock In', meCur.stockInQty === 100);
check('month end: closing = current stock in the birth month', meCur.closingQty === 100 && skuStock(meSku) === 100);

// Scenario B — the previous month's report of the same item (it did not exist yet)
const mePrev = getMonthRows(demoDB.skus.filter((s) => s.id === meSku), demoDB.transactions, prevMonth)[0];
check('month end: past month closing is rolled back (0), NOT the live current stock (100)',
  mePrev.closingQty === 0 && skuStock(meSku) === 100);
check('month end: opening + in − out = closing', mePrev.openingQty + mePrev.stockInQty - mePrev.stockOutQty === mePrev.closingQty);
const mvMe = getMonthMovement(demoDB.skus.find((s) => s.id === meSku)!, demoDB.transactions, prevMonth);
check('month end: no ledger variance', mvMe.variance === 0);

// Scenario C — All stock: two warehouses, same item name, different costs
const mergeM = addSku({ name: 'WF Merge', category: 'MKT', unit: 'pcs', openingBalance: 60, costPerUnit: 10 });
const mergeC = addCsSku({ name: 'WF Merge', category: 'MKT', unit: 'pcs', openingBalance: 50, costPerUnit: 12 });
check('month end: the merge pair lives in both warehouses', mergeM !== mergeC && skuStock(mergeM) === 60 && csStock(mergeC) === 50);
const allRows = getMonthEndRows({
  month: curMonth, scope: 'all',
  skus: demoDB.skus, transactions: demoDB.transactions,
  csSkus: demoDB.csSkus, csTransactions: demoDB.csTransactions,
  tickets: demoTicketsWithItems(),
});
const mergedRows = allRows.filter((r) => r.sku.name === 'WF Merge');
check('month end All: matched MKT + CS collapses into one row', mergedRows.length === 1 && mergedRows[0].warehouses === 2);
check('month end All: quantities summed (60 + 50 = 110)', mergedRows[0].closingQty === 110);
check('month end All: values summed (60×10 + 50×12 = 1200)', mergedRows[0].closingVal === 1200);
check('month end All: both items are newborn → opening 0, in = 1200',
  mergedRows[0].openingQty === 0 && mergedRows[0].stockInVal === 1200);
check('month end All: no ledger variance', mergedRows[0].variance === 0);
// The MKT ↔ CS transfers done in §7 use ONE id in both warehouses: the merged
// row must show the true combined stock (MKT 30 + CS 0), not a half-pair.
const moveRows = allRows.filter((r) => r.sku.name === 'WF Move');
check('month end All: internal transfer pair nets out (MKT 30 + CS 0 = 30)', moveRows.length === 1 && moveRows[0].closingQty === 30);
// VAT toggle inflates every value column by 10%
const vatRows = getMonthEndRows({
  month: curMonth, scope: 'mkt', skus: demoDB.skus, transactions: demoDB.transactions,
  csSkus: [], csTransactions: [], tickets: demoTicketsWithItems(), vat: true,
}).filter((r) => r.sku.name === 'WF MonthEnd');
check('month end: VAT toggle = ×1.1 on values', vatRows.length === 1 && Math.abs(vatRows[0].closingVal - 100 * 7 * 1.1) < 1e-6);

// ── 9c) Month End visibility rules ────────────────────────────────────────
// An item never appears before it was created, and a row with no balance and
// no movement for the month is hidden (unless the audit toggle asks for it).
const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
const mktRowsFor = (m: string, name: string, includeEmpty = false) =>
  getMonthEndRows({
    month: m, scope: 'mkt', skus: demoDB.skus, transactions: demoDB.transactions,
    csSkus: [], csTransactions: [], tickets: demoTicketsWithItems(), includeEmpty,
  }).filter((r) => r.sku.name === name);

// (a) created after the reported month → absent, not a zero row
const bornNow = addSku({ name: 'WF BornThisMonth', category: 'MKT', unit: 'pcs', openingBalance: 40, costPerUnit: 3 });
check('month end: item created this month is listed this month',
  mktRowsFor(curMonth, 'WF BornThisMonth').length === 1 && mktRowsFor(curMonth, 'WF BornThisMonth')[0].stockInQty === 40);
check('month end: item created this month is ABSENT from the previous month',
  mktRowsFor(prevMonth, 'WF BornThisMonth').length === 0);
check('month end: an item with only later activity is absent from an older month',
  mktRowsFor('2026-01', 'WF BornThisMonth').length === 0);

// (b) item that existed BEFORE the month, run down to 0 during it
const soldOut = addSku({ name: 'WF Sold Out', category: 'MKT', unit: 'pcs', openingBalance: 10, costPerUnit: 2 });
// back-date the item (and its OPENING row) so it pre-dates the reported month
(demoDB.skus.find((s) => s.id === soldOut) as any).createdAt = `${prevMonth}-05`;
(demoDB.transactions.find((tx) => tx.ticketId === 'OPENING' && tx.skuId === soldOut) as any).date = `${prevMonth}-05`;
demoMktDestockSku(soldOut, 10, S(wh.email), 'sold out');
const soldCur = mktRowsFor(curMonth, 'WF Sold Out');
check('month end: consumed-to-zero item still lists the month it was consumed',
  soldCur.length === 1 && soldCur[0].openingQty === 10 && soldCur[0].stockOutQty === 10 && soldCur[0].closingQty === 0);
check('month end: sold-out item is hidden the following month', mktRowsFor(nextMonth, 'WF Sold Out').length === 0);
check('month end: "Show items with no movement" brings the zero row back',
  mktRowsFor(nextMonth, 'WF Sold Out', true).length === 1);

// (c) zero balance but a Stock In during the month → listed
const refill = addSku({ name: 'WF Refill Only', category: 'MKT', unit: 'pcs', openingBalance: 0, costPerUnit: 1 });
demoRestockSku(refill, 25, 'WH', 'refill');
const refillRows = mktRowsFor(curMonth, 'WF Refill Only');
check('month end: zero-balance item with a Stock In is listed',
  refillRows.length === 1 && refillRows[0].openingQty === 0 && refillRows[0].stockInQty === 25);

// (d) legacy import: baseline in the master, no createdAt and no ledger row → never hidden
const legacy = addSku({ name: 'WF Legacy Baseline', category: 'MKT', unit: 'pcs', openingBalance: 15, costPerUnit: 1 });
(demoDB.skus.find((s) => s.id === legacy) as any).createdAt = null;
demoDB.transactions = demoDB.transactions.filter((tx) => tx.skuId !== legacy);
const legacyRows = mktRowsFor('2026-01', 'WF Legacy Baseline');
check('month end: legacy baseline item (no createdAt, no ledger) is never hidden',
  legacyRows.length === 1 && legacyRows[0].closingQty === 15);

// (f) imported baseline with no OPENING ledger row → birth month shows Stock In
const beforePrevDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
const beforePrev = `${beforePrevDate.getFullYear()}-${String(beforePrevDate.getMonth() + 1).padStart(2, '0')}`;
const imported = addSku({ name: 'WF Imported Baseline', category: 'MKT', unit: 'pcs', openingBalance: 30, costPerUnit: 4 });
(demoDB.skus.find((s) => s.id === imported) as any).createdAt = `${prevMonth}-08`;
demoDB.transactions = demoDB.transactions.filter((tx) => tx.skuId !== imported); // no ledger row at all
const importedPrev = mktRowsFor(prevMonth, 'WF Imported Baseline');
check('month end: imported baseline lands in Stock In of its birth month (Opening 0)',
  importedPrev.length === 1 && importedPrev[0].openingQty === 0 && importedPrev[0].stockInQty === 30 && importedPrev[0].closingQty === 30);
check('month end: the month before an imported item is empty, birth month opens at 0',
  mktRowsFor(beforePrev, 'WF Imported Baseline').length === 0 && importedPrev[0].openingQty === 0);
const importedCur = mktRowsFor(curMonth, 'WF Imported Baseline');
check('month end: ...and it carries over as Opening the next month',
  importedCur.length === 1 && importedCur[0].openingQty === 30 && importedCur[0].stockInQty === 0 && importedCur[0].closingQty === 30);

// (e) hiding is display-only: totals are untouched and only all-zero rows go
const mktAll = (m: string, includeEmpty: boolean) => getMonthEndRows({
  month: m, scope: 'mkt', skus: demoDB.skus, transactions: demoDB.transactions,
  csSkus: [], csTransactions: [], tickets: demoTicketsWithItems(), includeEmpty,
});
const totalOf = (rows: ReturnType<typeof mktAll>) =>
  rows.reduce((a, r) => a + r.openingQty + r.stockInQty + r.stockOutQty + r.closingQty, 0);
const tight = mktAll(curMonth, false), loose = mktAll(curMonth, true);
check('month end: hiding rows does not change any total', tight.length < loose.length && totalOf(tight) === totalOf(loose));
const tightKeys = new Set(tight.map((r) => r.key));
check('month end: only all-zero rows are hidden',
  loose.filter((r) => !tightKeys.has(r.key)).every((r) => r.openingQty === 0 && r.stockInQty === 0 && r.stockOutQty === 0 && r.closingQty === 0));




console.log('\n── 10) Edge: approve MORE than requested (up to available) — last value wins');
const skuA = addSku({ name: 'WF Overapprove', category: 'MKT', unit: 'pcs', openingBalance: 30 });
const tA = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuA, skuName: 'WF Overapprove', qtyRequested: 5, unit: 'pcs' }],
});
const bA = skuStock(skuA);                       // after booking: 30 − 5 = 25
demoUpdateTicketStatus(tA, 'reviewed', { actorName: wh.fullName, actorRole: wh.role, items: [{ skuId: skuA, qtyApproved: 12 }] });
check('review accepts MORE than requested (approved 12, NOT capped to 5)', demoDB.items[tA].find((i) => i.skuId === skuA)!.qtyApproved === 12);
check('over-approval true-ups the booking (stock 25 → 18)', skuStock(skuA) === bA - (12 - 5));
const txARev = demoDB.transactions.find((tx) => tx.ticketId === tA && tx.skuId === skuA && tx.type === 'deduction');
check('booking tx qty updated to 12', !!txARev && txARev.qty === 12);

// LM reduces 12 → 8 — honoured at the LM step too (last value wins)
demoUpdateTicketStatus(tA, 'lm_approved', { actorName: lm.fullName, actorRole: lm.role, items: [{ skuId: skuA, qtyApproved: 8 }] });
check('LM reduce honoured (12 → 8)', demoDB.items[tA].find((i) => i.skuId === skuA)!.qtyApproved === 8);
check('LM reduce returns the diff to stock (18 → 22)', skuStock(skuA) === bA - (12 - 5) + (12 - 8));

// Director increases 8 → 10; finalize deducts the LAST value
demoUpdateTicketStatus(tA, 'finalized', { actorName: dir.fullName, actorRole: dir.role, items: [{ skuId: skuA, qtyApproved: 10 }] });
check('director increase honoured (8 → 10)', demoTicketsWithItems().find((t) => t.id === tA)!.items.find((i) => i.skuId === skuA)!.qtyApproved === 10);
check('finalize deducts the last value (stock 22 → 20)', skuStock(skuA) === bA - (12 - 5) + (12 - 8) - (10 - 8));
const txAFinal = demoDB.transactions.find((tx) => tx.ticketId === tA && tx.skuId === skuA && tx.type === 'deduction');
check('finalized booking DEDUCTED at the last value (10)', !!txAFinal && txAFinal.status === 'Deducted' && txAFinal.qty === 10);

// Reject still returns the last approved value to stock
const skuB = addSku({ name: 'WF RejectLast', category: 'MKT', unit: 'pcs', openingBalance: 20 });
const tB = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuB, skuName: 'WF RejectLast', qtyRequested: 3, unit: 'pcs' }],
});
const bB = skuStock(skuB);                       // 20 − 3 = 17
demoUpdateTicketStatus(tB, 'reviewed', { actorName: wh.fullName, actorRole: wh.role, items: [{ skuId: skuB, qtyApproved: 8 }] });
check('over-approve for the reject case (3 → 8), stock 17 → 12', skuStock(skuB) === bB - (8 - 3));
demoUpdateTicketStatus(tB, 'rejected', { actorName: lm.fullName, actorRole: lm.role, comment: 'x' });
check('reject returns the last value → back to opening 20', skuStock(skuB) === bB + 3);
console.log('\n── 11) SKU Setup edit: opening balance is a plain edit (no stock in/out)');
const skuE = addSku({ name: 'WF Opening Edit', category: 'MKT', unit: 'pcs', openingBalance: 50, costPerUnit: 10 });
const eOpenBefore = demoDB.skus.find((s) => s.id === skuE)!.openingBalance;
const eStockBefore = skuStock(skuE);
const eInflowBefore = demoDB.skus.find((s) => s.id === skuE)!.totalInflow;
const eTxBefore = demoDB.transactions.length;
// raise the opening balance 50 → 70
demoUpdateSku(skuE, { openingBalance: 70 });
const skuEAfter = demoDB.skus.find((s) => s.id === skuE)!;
check('opening edit: opening_balance updated', skuEAfter.openingBalance === eOpenBefore + 20);
check('opening edit: current stock follows by the same delta', skuStock(skuE) === eStockBefore + 20);
check('opening edit: total inflow follows by the same delta', skuEAfter.totalInflow === eInflowBefore + 20);
check('opening edit: NO stock movement row written', demoDB.transactions.length === eTxBefore);
const eMv = getStockMovement(skuEAfter, demoDB.transactions);
check('opening edit: report stock in/out stay 0', eMv.stockIn === 0 && eMv.stockOut === 0);
check('opening edit: report opening/current follow the baseline', eMv.opening === skuEAfter.openingBalance + 20 - 20 && eMv.closing === skuEAfter.currentStock);
const eOpeningTx = demoDB.transactions.find((t) => t.ticketId === 'OPENING' && t.skuId === skuE);
check('opening edit: OPENING ledger row kept in sync', !!eOpeningTx && eOpeningTx.qty === 70);
// lower it again 70 → 55 (still treated as a plain edit)
demoUpdateSku(skuE, { openingBalance: 55 });
check('opening edit down: current stock −15', skuStock(skuE) === eStockBefore + 20 - 15);
check('opening edit down: still no movement row', demoDB.transactions.length === eTxBefore);
// zero removes the OPENING baseline row (and it never counts as stock out)
demoUpdateSku(skuE, { openingBalance: 0 });
check('opening 0 removes the OPENING row', !demoDB.transactions.some((t) => t.ticketId === 'OPENING' && t.skuId === skuE));

console.log('\n── 12) Rename cascades to tickets + both ledgers');
const skuN = addSku({ name: 'WF Old Name', category: 'MKT', unit: 'pcs', openingBalance: 20 });
const tN = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuN, skuName: 'WF Old Name', qtyRequested: 3, unit: 'pcs' }],
});
demoUpdateTicketStatus(tN, 'reviewed', { actorRole: 'warehouse' });
demoUpdateSku(skuN, { name: 'WF New Name' });
check('rename: sku row renamed', demoDB.skus.find((s) => s.id === skuN)!.name === 'WF New Name');
check('rename: ticket item renamed', (demoDB.items[tN] || []).every((i) => i.skuName === 'WF New Name'));
check('rename: ledger rows renamed', demoDB.transactions.filter((tx) => tx.skuId === skuN).every((tx) => tx.skuName === 'WF New Name'));
check('rename: cs ledger rows renamed', demoDB.csTransactions.filter((tx) => tx.skuId === skuN).every((tx) => tx.skuName === 'WF New Name'));

console.log('\n── 13) Approval comments carry a timestamp (My Ticket view)');
const skuC = addSku({ name: 'WF Comment Time', category: 'MKT', unit: 'pcs', openingBalance: 12 });
const tC = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuC, skuName: 'WF Comment Time', qtyRequested: 2, unit: 'pcs' }],
});
demoUpdateTicketStatus(tC, 'reviewed', { actorName: wh.fullName, actorRole: wh.role, comment: 'booked — 2 pcs' });
demoUpdateTicketStatus(tC, 'lm_approved', { actorName: lm.fullName, actorRole: lm.role, comment: 'ok from LM' });
demoUpdateTicketStatus(tC, 'finalized', { actorName: dir.fullName, actorRole: dir.role, comment: 'final go' });
const tCDone = demoTicketsWithItems().find((t) => t.id === tC)!;
check('comment(stamp): warehouse comment + time', tCDone.whComment === 'booked — 2 pcs' && !!tCDone.whCommentAt);
check('comment(stamp): line manager comment + time', tCDone.lmComment === 'ok from LM' && !!tCDone.lmCommentAt);
check('comment(stamp): director comment + time', tCDone.directorComment === 'final go' && !!tCDone.directorCommentAt);
check('comment(stamp): timestamps are ordered WH ≤ LM ≤ Director',
  String(tCDone.whCommentAt) <= String(tCDone.lmCommentAt) && String(tCDone.lmCommentAt) <= String(tCDone.directorCommentAt));

console.log('\n── 14) Stock movement edits — fix wrong amounts at the source (0015)');

// 14a) wrong restock amount corrected: 50 → 30 (stock + inflow follow −20)
const skuM = addSku({ name: 'WF Edit Restock', openingBalance: 100, costPerUnit: 10 });
demoRestockSku(skuM, 50, 'Wh Person', 'wrong refill');
const restockTx = demoDB.transactions.find((t) => t.ticketId === 'RESTOCK' && t.skuId === skuM)!;
check('edit setup: stock = 150 after the wrong refill', skuStock(skuM) === 150);
demoEditStockMovement('mkt', restockTx.id!, { qty: 30 }, 'delivery note says 30', adm.fullName, adm.role);
check('restock edit: ledger row corrected to 30', restockTx.qty === 30);
check('restock edit: current stock follows −20 (130)', skuStock(skuM) === 130);
check('restock edit: total inflow follows −20 (130)', demoDB.skus.find((s) => s.id === skuM)!.totalInflow === 130);
const mvM = getStockMovement(demoDB.skus.find((s) => s.id === skuM)!, demoDB.transactions, todayStr(), todayStr());
check('restock edit: report Stock In shows the corrected 30', mvM.stockIn === 30);
check('restock edit: report closing = current (130)', mvM.closing === 130);
check('restock edit: stamped with editor + reason',
  (restockTx.editedBy || '') === adm.fullName && (restockTx.comment || '').includes('delivery note says 30'));

// 14b) deduction qty corrected on a booked ticket row: 10 → 4 (stock back +6)
const skuD = addSku({ name: 'WF Edit Deduct', openingBalance: 40 });
const tD = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuD, skuName: 'WF Edit Deduct', qtyRequested: 10, unit: 'pcs' }],
});
check('deduct edit setup: booking took 10 (stock 30)', skuStock(skuD) === 30);
const bookedTx = demoDB.transactions.find((t) => t.ticketId === tD && t.skuId === skuD && t.type === 'deduction')!;
demoEditStockMovement('mkt', bookedTx.id!, { qty: 4 }, 'only 4 actually taken', adm.fullName, adm.role);
check('deduct edit: ledger row corrected to 4', bookedTx.qty === 4);
check('deduct edit: stock back +6 (36)', skuStock(skuD) === 36);

// 14c) broken-qty-only edit changes loss reporting, not stock
const skuL = addSku({ name: 'WF Edit Broken', openingBalance: 20 });
demoMktDestockSku(skuL, 5, 'Wh Person', 'damaged units', 2);
const lossTx = demoDB.transactions.find((t) => t.skuId === skuL && (t.status || '') === 'Loss/Broken')!;
const stockBeforeBroken = skuStock(skuL);
demoEditStockMovement('mkt', lossTx.id!, { qtyBroken: 5 }, '3 more found broken on the shelf', adm.fullName, adm.role);
check('broken edit: qty untouched (5) and stock untouched', lossTx.qty === 5 && skuStock(skuL) === stockBeforeBroken);
check('broken edit: broken qty now 5', lossTx.qtyBroken === 5);
const mvL = getStockMovement(demoDB.skus.find((s) => s.id === skuL)!, demoDB.transactions, todayStr(), todayStr());
check('broken edit: report lossQty = 5', mvL.lossQty === 5);

// 14d) date edit moves the row into another report period
const skuT = addSku({ name: 'WF Edit Date', openingBalance: 10 });
demoRestockSku(skuT, 7, 'Wh Person');
const dateTx = demoDB.transactions.find((t) => t.ticketId === 'RESTOCK' && t.skuId === skuT)!;
demoEditStockMovement('mkt', dateTx.id!, { date: '2000-01-15' }, 'recorded in the wrong month', adm.fullName, adm.role);
check('date edit: row moved to the new date', dateTx.date === '2000-01-15');
const mvT = getStockMovement(demoDB.skus.find((s) => s.id === skuT)!, demoDB.transactions, todayStr(), todayStr());
check('date edit: today report no longer counts it', mvT.stockIn === 0);
const mvTOld = getStockMovement(demoDB.skus.find((s) => s.id === skuT)!, demoDB.transactions, '2000-01-01', '2000-01-31');
check('date edit: the corrected month shows it', mvTOld.stockIn === 7);

// 14e) CS warehouse rows — customer_service edits their own, others cannot
const csSku = addCsSku({ name: 'WF Edit CS', openingBalance: 60 });
demoCsRestockSku(csSku, 12, 'CS Person');
const csTx = demoDB.csTransactions.find((t) => t.ticketId === 'RESTOCK' && t.skuId === csSku)!;
check('cs gate: warehouse cannot edit CS rows', throws(() => demoEditStockMovement('cs', csTx.id!, { qty: 5 }, 'x', wh.fullName, wh.role), /not authorized/i));
check('cs gate: staff cannot edit CS rows', throws(() => demoEditStockMovement('cs', csTx.id!, { qty: 5 }, 'x', staff.fullName, staff.role), /not authorized/i));
demoEditStockMovement('cs', csTx.id!, { qty: 9 }, 'CS refill miscounted', cs.fullName, cs.role);
check('cs edit: row corrected to 9', csTx.qty === 9);
check('cs edit: CS stock follows −3 (69)', csStock(csSku) === 69);

// 14f) guards: OPENING rows, cancelled bookings, negative qty, missing reason, unknown row, role gates
const openTx = demoDB.transactions.find((t) => t.ticketId === 'OPENING' && t.skuId === skuM)!;
check('opening row edit refused', throws(() => demoEditStockMovement('mkt', openTx.id!, { qty: 1 }, 'x', adm.fullName, adm.role), /opening rows/i));
const skuRj = addSku({ name: 'WF Edit Cancelled', openingBalance: 30 });
const tRj = demoCreateTicket({
  createdBy: staff.email, createdByName: staff.fullName, department: 'MKT', type: 'request',
  items: [{ skuId: skuRj, skuName: 'WF Edit Cancelled', qtyRequested: 5, unit: 'pcs' }],
});
demoUpdateTicketStatus(tRj, 'rejected', { actorName: wh.fullName, actorRole: wh.role, comment: 'no' });
const cancelledTx = demoDB.transactions.find((t) => t.ticketId === tRj && (t.status || '') === 'Booking Cancelled')!;
check('cancelled booking edit refused', throws(() => demoEditStockMovement('mkt', cancelledTx.id!, { qty: 1 }, 'x', adm.fullName, adm.role), /audit-only/i));
check('negative qty refused', throws(() => demoEditStockMovement('mkt', restockTx.id!, { qty: -3 }, 'x', adm.fullName, adm.role), /quantity must be 0 or greater/i));
check('missing reason refused', throws(() => demoEditStockMovement('mkt', restockTx.id!, { qty: 31 }, '   ', adm.fullName, adm.role), /reason is required/i));
check('unknown row id refused', throws(() => demoEditStockMovement('mkt', 987654321, { qty: 31 }, 'x', adm.fullName, adm.role), /not found/i));
check('mkt gate: customer_service cannot edit MKT rows', throws(() => demoEditStockMovement('mkt', restockTx.id!, { qty: 31 }, 'x', cs.fullName, cs.role), /not authorized/i));
check('ledger ids are unique after all the edits',
  new Set(demoDB.transactions.map((t) => t.id)).size === demoDB.transactions.length &&
  new Set(demoDB.csTransactions.map((t) => t.id)).size === demoDB.csTransactions.length);

console.log('\n── 15) Audit trail (Admin → Audit Trail)');
// Master data, settings and user changes are pushed explicitly in demo mode;
// the ledger / ticket / remark history is derived — together they must read
// like the live audit_log the Admin page shows.
const audSku = addSku({ name: 'WF Audit Item', openingBalance: 5 });
demoUpdateSku(audSku, { costPerUnit: 1500 });
demoManageConfig('bypass_threshold', '999999');
const audAll = demoFetchAudit({ limit: 100000 });

check('audit: a new SKU is logged as "create"',
  audAll.some((e) => e.entityId === audSku && e.action === 'create' && e.summary.includes('WF Audit Item')));
const audSkuEdit = audAll.find((e) => e.entityId === audSku && e.action === 'update');
check('audit: the cost edit is logged with a before → after value',
  // addSku() seeds costPerUnit = 1, then the edit sets 1500
  !!audSkuEdit && (audSkuEdit.changes || []).some((c) => c.field === 'cost_per_unit' && c.from === '1' && c.to === '1500'));
check('audit: a settings change is logged',
  audAll.some((e) => e.module === 'settings' && e.entityId === 'bypass_threshold' && e.action === 'update'));

const audCorr = audAll.find((e) => e.action === 'correct' && e.summary.includes('WF Edit Restock'));
check('audit: a stock correction is logged as "correct" with the typed reason',
  !!audCorr && (audCorr.comment || '').includes('delivery note says 30'));
check('audit: the correction shows the qty move 50 → 30',
  !!audCorr && (audCorr.changes || []).some((c) => c.field === 'qty' && c.from === '50' && c.to === '30'));
check('audit: ledger history is derived from the trail (book/issue/restock present)',
  audAll.some((e) => e.module === 'ledger' && e.action === 'book') &&
  audAll.some((e) => e.module === 'ledger' && e.action === 'restock'));
check('audit: ticket workflow history is derived from ticket_actions',
  audAll.some((e) => e.module === 'ticket' && !!e.refTicket));
check('audit: rows come back newest first',
  audAll.every((e, i) => i === 0 || String(audAll[i - 1].at) >= String(e.at)));
check('audit: a past-only period returns nothing',
  demoFetchAudit({ from: '2000-01-01', to: '2000-01-02', limit: 100000 }).length === 0);
check('audit: today still returns events',
  demoFetchAudit({ from: todayStr(), to: todayStr(), limit: 100000 }).length > 0);
check('audit: the limit is honoured',
  demoFetchAudit({ limit: 5 }).length <= 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
