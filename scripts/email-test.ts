// ─────────────────────────────────────────────────────────────────────────
// Unit tests for the ticket notification email engine (recipients + template).
// Run:  npm run test:email
//
// These decide whether the RIGHT person gets mail at each approval step, so
// they are tested against a fixture directory rather than production data.
// ─────────────────────────────────────────────────────────────────────────
import {
  EMAIL_STATUS_LABELS, RECIPIENT_RULES, isEmailStatus, linkFor,
  renderTicketEmail, resolveRecipients, stageOf, subjectOf,
  type EmailPerson, type EmailTicket,
} from '../src/lib/ticketEmail';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
  }
}
const eq = (name: string, actual: unknown, expected: unknown): void =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

const APP = 'https://easy-gold-merch.pages.dev';

// ── Fixture directory ────────────────────────────────────────────────────
const users: EmailPerson[] = [
  { id: 'U-WH1', email: 'wh1@easygold.com', fullName: 'Warehouse One', role: 'warehouse', status: 'Active' },
  { id: 'U-WH2', email: 'wh2@easygold.com', fullName: 'Warehouse Two', role: 'Warehouse Manager', status: 'Active' },
  { id: 'U-WH3', email: 'wh3@easygold.com', fullName: 'Warehouse Gone', role: 'warehouse', status: 'Inactive' },
  { id: 'U-LM', email: 'lm@easygold.com', fullName: 'Line Manager', role: 'line_manager', status: 'Active' },
  { id: 'U-DIR', email: 'dir@easygold.com', fullName: 'The Director', role: 'director', status: 'Active' },
  { id: 'U-ADM', email: 'adm@easygold.com', fullName: 'Admin Person', role: 'admin', status: 'Active' },
  { id: 'U-REQ', email: 'requester@easygold.com', fullName: 'Ketmany', role: 'staff', department: 'MKT', status: 'Active' },
];

const ticket = (patch: Partial<EmailTicket> = {}): EmailTicket => ({
  id: 'TKT-1790219577932', status: 'pending', type: 'request',
  createdBy: 'U-REQ', createdByName: 'Ketmany', department: 'MKT',
  deliveryDate: '2026-09-24', createdAt: '2026-09-24T03:12:55.005Z',
  remark: 'ຈອກຂອງຫົວໜ້າ & artist', lastActionBy: 'Ketmany', lastActionStatus: 'Pending',
  items: [
    { skuId: 'S1', skuName: 'Tumbler x LDB', qtyRequested: 20, qtyApproved: 20, unit: 'pcs' },
    { skuId: 'S2', skuName: 'ກ່ອງຂັວນ', qtyRequested: 10, qtyApproved: 10, unit: 'pcs' },
    { skuId: 'S3', skuName: 'Umbrella <X> LDB', qtyRequested: 4, qtyApproved: 10, unit: 'pcs' },
  ],
  ...patch,
});

console.log('\n▸ Recipient matrix (who gets notified at each step)');
{
  const t = ticket();
  eq('pending → To: active Warehouse only', resolveRecipients(t, users, 'pending').to,
    ['wh1@easygold.com', 'wh2@easygold.com']);
  eq('pending → Cc: none (preserves quota)', resolveRecipients(t, users, 'pending').cc, []);

  eq('reviewed → To: Line Manager', resolveRecipients(t, users, 'reviewed').to, ['lm@easygold.com']);
  eq('reviewed → Cc: none', resolveRecipients(ticket({ status: 'reviewed', lastActionBy: 'Warehouse One', whComment: 'Booked' }), users, 'reviewed').cc, []);

  eq('lm_approved → To: Director', resolveRecipients(t, users, 'lm_approved').to, ['dir@easygold.com']);
  eq('lm_approved → Cc: none', resolveRecipients(t, users, 'lm_approved').cc, []);

  eq('finalized → To: requester (the result)', resolveRecipients(t, users, 'finalized').to, ['requester@easygold.com']);
  eq('finalized → Cc: none', resolveRecipients(t, users, 'finalized').cc, []);

  const rejected = ticket({ status: 'rejected', lastActionBy: 'Line Manager' });
  eq('rejected → To: requester', resolveRecipients(rejected, users, 'rejected').to, ['requester@easygold.com']);
  eq('rejected → Cc: none', resolveRecipients(rejected, users, 'rejected').cc, []);

  const returned = ticket({ status: 'returned', type: 'borrow', lastActionBy: 'Warehouse Two' });
  eq('returned → Cc: none', resolveRecipients(returned, users, 'returned').cc, []);

  check('inactive accounts are never notified',
    !resolveRecipients(ticket(), users, 'pending').to.includes('wh3@easygold.com'));
  check('admin is not spammed with approval mail',
    resolveRecipients(ticket(), users, 'lm_approved').to.every((e) => e !== 'adm@easygold.com'));
  check('no address sits in both To and Cc', (() => {
    const r = resolveRecipients(ticket({ status: 'finalized' }), users, 'finalized');
    return r.cc.every((e) => !r.to.includes(e));
  })());
  check('requester still resolved from a raw email created_by (deleted account)',
    resolveRecipients(ticket({ createdBy: 'ghost@easygold.com' }), users, 'finalized').to
      .includes('ghost@easygold.com'));
  eq('all seven stages have a rule', Object.keys(RECIPIENT_RULES).sort(),
    ['finalized', 'lm_approved', 'pending', 'recalled', 'rejected', 'returned', 'reviewed'].sort());
}

console.log('\n▸ Subjects, stages and deep links');
{
  check('Action Required only while someone must act',
    subjectOf(ticket(), 'pending').includes('[Action Required]')
    && subjectOf(ticket(), 'reviewed').includes('[Action Required]')
    && subjectOf(ticket(), 'lm_approved').includes('[Action Required]')
    && !subjectOf(ticket(), 'finalized').includes('[Action Required]'));
  check('subject names the ticket and the next step',
    subjectOf(ticket(), 'reviewed').includes('TKT-1790219577932')
    && subjectOf(ticket(), 'reviewed').includes('Line Manager'));
  check('result subjects are self-explanatory',
    subjectOf(ticket(), 'rejected').includes('Rejected')
    && subjectOf(ticket(), 'finalized').includes('Finalized'));

  check('approver mail opens the Action Center',
    linkFor(ticket(), 'pending', APP).startsWith(`${APP}/action-center?ticket=`));
  check('result mail opens Ticket Tracking',
    linkFor(ticket(), 'finalized', APP).startsWith(`${APP}/ticket-tracking?ticket=`));
  eq('link carries the ticket id', linkFor(ticket(), 'pending', APP), `${APP}/action-center?ticket=TKT-1790219577932`);

  check('stageOf accepts the seven real statuses',
    stageOf('pending') === 'pending' && stageOf('lm_approved') === 'lm_approved');
  check('stageOf rejects anything else',
    stageOf('draft') === null && stageOf('') === null && stageOf(null) === null);
  check('isEmailStatus guards the union', isEmailStatus('returned') && !isEmailStatus('approved'));
  eq('status labels match the app', EMAIL_STATUS_LABELS.reviewed, 'Reviewed');
}

console.log('\n▸ Rendered email (the template your team will read)');
{
  const mail = renderTicketEmail(ticket(), users, { appUrl: APP });

  for (const header of ['No.', 'Item Name', 'Qty Req', 'Qty Appr', 'Status', 'Comment', 'Est. Delivery']) {
    check(`column "${header}" is present`, mail.html.includes(header));
  }
  check('card title matches the original app', mail.html.includes('Merch Request Update — TKT-1790219577932'));
  check('CTA button + fallback link are both there',
    mail.html.includes('Review Ticket in App') && mail.text.includes('Review Ticket in App'));
  check('footer disclaimer is present',
    mail.html.includes('This is an automated notification. Row data is now locked in the tracking system.'));
  check('requester, department and reason are shown',
    mail.html.includes('Ketmany') && mail.html.includes('MKT') && mail.html.includes('ຈອກຂອງຫົວໜ້າ'));
  check('Lao item names survive untouched', mail.html.includes('ກ່ອງຂັວນ') && mail.text.includes('ກ່ອງຂັວນ'));
  check('markup in data is escaped, never injected',
    mail.html.includes('Umbrella &lt;X&gt; LDB') && !mail.html.includes('Umbrella <X> LDB'));
  check('“&” in the reason is escaped', mail.html.includes('&amp; artist'));
  check('approved qty is shown per item (S3: req 4 → appr 10)',
    /Umbrella &lt;X&gt; LDB[\s\S]{0,400}?>4<[\s\S]{0,200}?>10</.test(mail.html));
  check('estimated delivery is the ticket date',
    (mail.html.match(/2026-09-24/g) || []).length >= ticket().items.length);
  check('the status chip carries the current status',
    mail.html.includes('>Pending</span>') && mail.html.includes('#fef3c7'));
  check('no <style> block (Gmail strips them)', !mail.html.toLowerCase().includes('<style'));
  check('no "undefined"/"null" ever leaks into the mail',
    !mail.html.includes('undefined') && !mail.html.includes('null') && !mail.text.includes('undefined'));

  const approved = renderTicketEmail(ticket({ status: 'reviewed', whComment: 'Only 10 in stock' }), users, { appUrl: APP });
  check('the acting level’s comment fills the Comment column',
    approved.html.includes('Only 10 in stock'));
  check('an empty comment falls back to “-”',
    renderTicketEmail(ticket(), users, { appUrl: APP }).html.includes('>-<'));

  const overridden = renderTicketEmail(ticket(), users, { appUrl: APP, stage: 'finalized' });
  check('an explicit stage overrides the ticket status',
    overridden.stage === 'finalized' && overridden.link.includes('/ticket-tracking'));
  eq('rendered recipients ride along with the mail',
    renderTicketEmail(ticket(), users, { appUrl: APP }).to, ['wh1@easygold.com', 'wh2@easygold.com']);
  check('every rendered mail carries a plain-text alternative',
    mail.text.includes('TKT-1790219577932') && mail.text.includes(`${APP}/action-center?ticket=TKT-1790219577932`));
}

console.log(
  failed === 0
    ? '\n✅ All email notification tests passed.\n'
    : `\n❌ ${failed} test${failed === 1 ? '' : 's'} failed.\n`,
);
process.exit(failed === 0 ? 0 : 1);
