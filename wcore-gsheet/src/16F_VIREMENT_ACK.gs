/**
 * "C'est fait" button of the low-balance alert (ntfy): the workbook re-reads the bank accounts right away.
 *
 * The alert is sent by the owner's local script with the common ntfy tool and its --ack option: a tap publishes
 * "<project>:<token>" on a reply topic of the ntfy server. The watchdog (every 10 min) polls that topic here, takes
 * each tap at most once, and runs ONE guarded re-read (16E_BANK_SYNC.gs). A tap is only a declaration: the worst a
 * stranger who knew the reply topic could do is trigger that same read, which is rate-limited by its own budget.
 *
 * The ntfy server and the reply topic live ONLY in the user properties of the owner (this repository is public),
 * installed by the owner with WCORE_EB_INSTALL_NTFY. Nothing here logs or returns an amount or a topic.
 */
var EB_PROP_NTFY_SERVER = "EB_NTFY_SERVER";
var EB_PROP_NTFY_TOPIC = "EB_NTFY_ACK_TOPIC";
var EB_PROP_NTFY_TOKEN = "EB_NTFY_TOKEN";
var EB_PROP_ACK_DONE = "EB_ACK_DONE";
var EB_PROP_ACK_POLLED = "EB_ACK_POLLED_AT";
var EB_PROP_ACK_LAST = "EB_ACK_LAST";
var EB_ACK_PROJECT = "wcoreRoot";
var EB_ACK_MAX_AGE_MS = 2 * 3600 * 1000;
var EB_ACK_MIN_POLL_GAP_MS = 2 * 60 * 1000;
var EB_ACK_DONE_KEEP = 200;
var EB_ACK_DEADLINE_S = 8;

/** Owner, from the editor: stores the ntfy server, the reply topic and (optional) access token. Nothing is shown back. */
function WCORE_EB_INSTALL_NTFY() {
  var ui = SpreadsheetApp.getUi();
  var server = _wcoreEbAsk_(ui, "Bouton 1/3", "Adresse du serveur ntfy (https://...) :");
  if (server === null) return;
  var topic = _wcoreEbAsk_(ui, "Bouton 2/3", "Sujet de reponse (ack_topic) :");
  if (topic === null) return;
  var token = _wcoreEbAsk_(ui, "Bouton 3/3", "Jeton d'acces ntfy (laisse vide s'il n'y en a pas) :");
  if (token === null) return;
  server = String(server).trim().replace(/\/+$/, "");
  topic = String(topic).trim();
  token = String(token).trim();
  var ok = /^https:\/\/[\w.-]+(?::\d+)?$/.test(server) && /^[A-Za-z0-9_-]{16,64}$/.test(topic) && !/\s/.test(token);
  if (ok) {
    var o = {};
    o[EB_PROP_NTFY_SERVER] = server;
    o[EB_PROP_NTFY_TOPIC] = topic;
    o[EB_PROP_NTFY_TOKEN] = token;
    _wcoreEbProps_().setProperties(o);
  }
  ui.alert("Bouton", ok ? "Installe." : "Refuse : INVALID", ui.ButtonSet.OK);
}

/** Taps ("<project>:<token>") of the last EB_ACK_MAX_AGE_MS in an ntfy NDJSON answer, oldest first, deduplicated. */
function _wcoreEbParseAcks_(ndjson, now) {
  var out = [], seen = {};
  String(ndjson || "").split("\n").forEach(function (line) {
    if (!line.trim()) return;
    var ev;
    try { ev = JSON.parse(line); } catch (e) { return; }
    if (!ev || ev.event !== "message" || typeof ev.message !== "string" || typeof ev.time !== "number" || !isFinite(ev.time)) return;
    var ts = Number(ev.time) * 1000;
    if (ts > now + 5 * 60 * 1000 || now - ts > EB_ACK_MAX_AGE_MS) return;
    var m = /^([A-Za-z][A-Za-z-]{1,30}):(virement-[a-z0-9-]{2,30})$/.exec(ev.message.trim());
    if (!m || m[1] !== EB_ACK_PROJECT || seen[m[2]]) return;
    seen[m[2]] = 1;
    out.push({ token: m[2], ts: ts });
  });
  return out.sort(function (a, b) { return a.ts - b.ts; });
}

function _wcoreEbAckDone_() {
  try { var d = JSON.parse(_wcoreEbProps_().getProperty(EB_PROP_ACK_DONE) || "[]"); return Array.isArray(d) ? d : []; } catch (e) { return []; }
}

/**
 * Watchdog pass. Takes the new taps at most once each (marked BEFORE the read, so a failed read is a lost refresh,
 * never a second one) and runs a single guarded re-read. Returns reason codes only.
 */
function _wcoreCheckVirementAck_() {
  var out = { ran: false, reason: "", taken: 0 };
  try {
    var props = _wcoreEbProps_();
    var server = props.getProperty(EB_PROP_NTFY_SERVER), topic = props.getProperty(EB_PROP_NTFY_TOPIC);
    if (!server || !topic || !props.getProperty(EB_PROP_KEY)) { out.reason = "NOT_CONFIGURED"; return out; }
    var now = Date.now();
    if (now - Number(props.getProperty(EB_PROP_ACK_POLLED) || 0) < EB_ACK_MIN_POLL_GAP_MS) { out.reason = "TOO_SOON"; return out; }
    props.setProperty(EB_PROP_ACK_POLLED, String(now));
    var token = props.getProperty(EB_PROP_NTFY_TOKEN);
    var headers = token ? { Authorization: "Bearer " + token } : {};
    var resp = UrlFetchApp.fetch(server + "/" + topic + "/json?poll=1&since=2h", { method: "get", headers: headers, muteHttpExceptions: true, followRedirects: false, deadline: EB_ACK_DEADLINE_S });
    out.ran = true;
    if (resp.getResponseCode() !== 200) { out.reason = "HTTP_" + resp.getResponseCode(); return out; }
    var done = _wcoreEbAckDone_();
    var fresh = _wcoreEbParseAcks_(resp.getContentText(), now).filter(function (a) { return done.indexOf(a.token) < 0; });
    if (!fresh.length) { out.reason = "NONE"; return out; }
    out.taken = fresh.length;
    props.setProperty(EB_PROP_ACK_DONE, JSON.stringify(done.concat(fresh.map(function (a) { return a.token; })).slice(-EB_ACK_DONE_KEEP)));
    var r = _wcoreEbRefreshSecurisation_(true);
    out.reason = r.reason;
    props.setProperty(EB_PROP_ACK_LAST, JSON.stringify({ at: now, reason: r.reason }));
  } catch (e) {
    out.reason = "ERROR"; // the raw exception is never kept: it could carry a topic or bank data
  }
  return out;
}

/** Owner, from the editor: shows the outcome of the last tap (reason code and time only). */
function WCORE_EB_ACK_STATUS() {
  var last = null;
  try { last = JSON.parse(_wcoreEbProps_().getProperty(EB_PROP_ACK_LAST) || "null"); } catch (e) { last = null; }
  var msg = last ? "Dernier appui traite : " + last.reason + " (" + new Date(last.at).toISOString() + ")" : "Aucun appui traite.";
  try { SpreadsheetApp.getUi().alert("Bouton", msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) { /* nothing is logged */ }
  return { reason: last ? last.reason : "NONE" };
}
