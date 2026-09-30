// ══════════════════════════════════════════════════════════════════════════
//  Easy Gold Merch — Email relay (Google Apps Script)
//
//  WHY THIS EXISTS: it is the only way to send mail AS YOUR OWN Gmail address
//  without a Google Cloud OAuth project. It is a dumb pipe — the who / when /
//  what is decided by Supabase (the send-ticket-email Edge Function) and simply
//  POSTed here. This file never queries your database.
//
//  SETUP (5 minutes — full steps in DEPLOY.md → "Email notifications"):
//    1. https://script.google.com → New project → "Easy Gold Mail Relay"
//       ⚠️  Sign in as the SENDING account (e.g. tockppd@gmail.com). If you are
//          signed into several Google accounts, use an incognito window.
//    2. Paste this whole file over Code.gs and Save.
//    3. Project Settings (⚙) → Script properties → Add script property:
//            RELAY_SECRET = <any long random string>
//       (paste the SAME value into Supabase as EMAIL_RELAY_SECRET)
//    4. Run → testSend → approve the permission prompt → check your inbox.
//    5. Deploy → New deployment → Type: Web app
//            Execute as     : Me        (the sending Gmail account)
//            Who has access : Anyone
//       → Deploy → copy the /exec URL.
//
//  LIMIT: a free @gmail.com account may send 100 RECIPIENTS per day (1,500 on
//  Google Workspace), counted per address in To+Cc, reset every 24h. Every
//  reply reports the remaining quota and it is stored in email_log.
// ══════════════════════════════════════════════════════════════════════════

var SECRET_PROPERTY = 'RELAY_SECRET';
var DEFAULT_FROM_NAME = 'Easy Gold Merch System';
var LOG_SHEET = 'MailRelay_Log';

/** POST {secret, to, cc, subject, html, text, from, replyTo} → sends the mail. */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
    if (!expected) {
      return json({ ok: false, error: 'Relay not configured: set the RELAY_SECRET script property.' });
    }
    if (String(body.secret || '') !== expected) {
      return json({ ok: false, error: 'Unauthorized (secret mismatch).' });
    }

    var to = asList(body.to);
    var cc = asList(body.cc).filter(function (a) { return to.indexOf(a) === -1; });
    if (!to.length) return json({ ok: false, error: 'No recipients — nothing sent.' });

    // Quota is counted PER RECIPIENT: check before spending it so the caller
    // gets a clean error instead of a half-sent batch.
    var need = to.length + cc.length;
    var left = MailApp.getRemainingDailyQuota();
    if (left < need) {
      logRow(body, to, cc, false, 'Quota exhausted');
      return json({
        ok: false, quotaLeft: left, sent: 0,
        error: 'Daily Gmail quota exhausted — ' + left + ' recipient(s) left today, ' + need + ' needed.',
      });
    }

    MailApp.sendEmail({
      to: to.join(','),
      cc: cc.join(','),
      subject: String(body.subject || '(no subject)'),
      htmlBody: String(body.html || ''),
      body: String(body.text || body.subject || ''),   // plain-text fallback
      name: String(body.from || DEFAULT_FROM_NAME),
      replyTo: body.replyTo ? String(body.replyTo) : undefined,
    });

    var remaining = MailApp.getRemainingDailyQuota();
    logRow(body, to, cc, true, '');
    return json({ ok: true, sent: need, quotaLeft: remaining });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    try { logRow(body, [], [], false, msg); } catch (ignored) {}
    return json({ ok: false, error: msg });
  }
}

/** Health check — open this URL in a browser to confirm the relay is live. */
function doGet() {
  var configured = !!PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  return json({
    ok: true,
    service: 'Easy Gold Merch email relay',
    sender: Session.getEffectiveUser().getEmail(),
    secretConfigured: configured,
    quotaLeft: MailApp.getRemainingDailyQuota(),
    hint: configured ? 'POST JSON here from Supabase.' : 'Set the RELAY_SECRET script property.',
  });
}

/** Run this once from the editor (setup step 4) — it mails you a confirmation. */
function testSend() {
  var me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: me,
    subject: '✅ Easy Gold Merch relay test',
    htmlBody: '<p style="font-family:Arial,sans-serif;font-size:14px">The relay is working. '
      + 'Notifications for <b>Easy Gold Merch</b> tickets will be sent from <b>' + me + '</b>.</p>'
      + '<p style="font-family:Arial,sans-serif;font-size:12px;color:#64748b">Recipients left today: '
      + MailApp.getRemainingDailyQuota() + '</p>',
    name: DEFAULT_FROM_NAME,
  });
  Logger.log('Test email sent to ' + me + ' · quota left: ' + MailApp.getRemainingDailyQuota());
}

// ── helpers ──────────────────────────────────────────────────────────────
function asList(v) {
  var raw = Array.isArray(v) ? v : (v ? String(v).split(',') : []);
  var seen = {};
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var a = String(raw[i] || '').trim().toLowerCase();
    if (!a || a.indexOf('@') === -1 || seen[a]) continue;
    seen[a] = true;
    out.push(a);
  }
  return out;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Optional audit trail: works only when the script is bound to a spreadsheet
 *  (standalone projects skip it silently — nothing depends on the log). */
function logRow(body, to, cc, ok, error) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sheet = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['At', 'Ticket', 'Subject', 'To', 'Cc', 'Ok', 'Error', 'Quota left']);
    }
    sheet.appendRow([
      new Date(), String(body.ticketId || ''), String(body.subject || ''),
      to.join(', '), cc.join(', '), ok ? 'YES' : 'NO', String(error || ''),
      MailApp.getRemainingDailyQuota(),
    ]);
  } catch (ignored) { /* standalone script or read-only spreadsheet */ }
}
