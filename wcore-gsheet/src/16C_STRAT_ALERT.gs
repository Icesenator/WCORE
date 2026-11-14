/**
 * 16C_STRAT_ALERT.gs - v4.17.3
 *
 * Phone alert when a Strat rebalancing cell turns to X, called by WATCHDOG_FROM_RECAP (every
 * 10 min). Since 2026-11-12 the workbook never calls ntfy itself: ntfy.sh answers 429 to the
 * shared Apps Script egress addresses. It posts a closed, structured event to the WCORE API
 * (POST /api/gsheet/notify, same token and URL as the web scan), which composes the text and
 * keeps the ntfy topic on the server side.
 *
 * Cells: AY1 = crypto rebalancing, BE1 = stock rebalancing (Florian, 12/11: only the
 * rebalancings go to the phone; tab errors and stale updates go to the WCORE session through
 * its scheduled check). A notification is sent only when a cell goes from V to X (a cell
 * already at X on the first observation does not notify). A refused or failed send keeps the
 * previous state of that cell, so the next pass tries again; the API deduplicates.
 *
 * Content: category, the two symbols from Q1/S1 of the portfolio tab and their gap (column P,
 * real minus target, whole euros) — explicit decisions of Florian on 2026-11-12.
 * State: WCORE_STRAT_ALERT_LAST = {"AY1":"V","BE1":"X","occ":{"AY1":"AY1-<ms>"}} (occurrence
 * ids of undelivered transitions). One check at a time (script lock).
 */

var STRAT_ALERT_CELLS = [
  { cell: "AY1", col: 0, category: "crypto", tradeSheet: "Portefeuille Crypto" },
  { cell: "BE1", col: 6, category: "action", tradeSheet: "Portefeuille Action" }
];
var STRAT_ALERT_STATE_KEY = "WCORE_STRAT_ALERT_LAST";
var STRAT_ALERT_SYMBOL = /^[A-Za-z0-9.$_-]{1,15}$/;

function _wcoreStratAlertApi_() {
  var props = PropertiesService.getScriptProperties();
  var base = String(props.getProperty("WCORE_WEB_API_URL") || "").trim().replace(/\/$/, "");
  var token = String(props.getProperty("GSHEET_API_TOKEN") || "").trim();
  if (!/^https:\/\//.test(base) || !token) return null;
  return { url: base + "/api/gsheet/notify", token: token };
}

function _wcoreStratAlertEuros_(v) {
  var n = Number(v);
  if (!isFinite(n)) return null;
  var r = Math.round(Math.abs(n));
  return r <= 10000000 ? r : null;
}

/** {sell:{symbol,eur?}, buy:{symbol,eur?}} from Q1/S1 and the P gap of the rows marked V/X, or null. */
function _wcoreStratAlertTrade_(ss, sheetName) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return null;
    var head = sh.getRange("Q1:S1").getValues()[0];
    var sell = String(head[0] || "").trim(), buy = String(head[2] || "").trim();
    if (!STRAT_ALERT_SYMBOL.test(sell) || !STRAT_ALERT_SYMBOL.test(buy)) return null;
    var out = { sell: { symbol: sell }, buy: { symbol: buy } };
    try {
      var last = sh.getLastRow();
      if (last >= 3) {
        var rows = sh.getRange(3, 16, last - 2, 3).getValues(); // P, Q, R
        for (var k = 0; k < rows.length; k++) {
          var sig = String(rows[k][2] || "").trim();
          var gap = Number(rows[k][0]);
          if (sig === "V" && out.sell.eur == null && gap > 0) { var s1 = _wcoreStratAlertEuros_(gap); if (s1 != null) out.sell.eur = s1; }
          if (sig === "X" && out.buy.eur == null && gap < 0) { var b1 = _wcoreStratAlertEuros_(gap); if (b1 != null) out.buy.eur = b1; }
        }
      }
    } catch (eAmt) {}
    return out;
  } catch (e) { return null; }
}

/**
 * Posts one event to the API. ok = accepted (sent, or already sent); abandon = permanent refusal
 * of this occurrence (422: ntfy refused it for good), so the workbook stops retrying it.
 */
function _wcoreStratAlertPost_(api, body) {
  var resp = null;
  try {
    resp = HTTP.post(api.url, body, {
      headers: { "x-gsheet-token": api.token, accept: "application/json" },
      muteHttpExceptions: true,
      timeoutMs: 8000 // passed to the wrapper as a deadline option, not a measured guarantee
    });
  } catch (e) { resp = null; }
  var code = resp && typeof resp.getResponseCode === "function" ? resp.getResponseCode() : 0;
  return { ok: code === 200, abandon: code === 422, code: code };
}

var STRAT_ALERT_OCC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Runs fn under the script lock, held only for this short state step (never during a send). */
function _wcoreStratAlertLocked_(fn) {
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (eLock) { lock = null; }
  if (lock && !lock.tryLock(2000)) return { locked: true };
  try { return { locked: false, value: fn() }; }
  finally { try { if (lock) lock.releaseLock(); } catch (eRel) {} }
}

/**
 * @return {Object} diagnostic {ran, reason, newX, sent, abandoned}
 */
function _wcoreCheckStratAlert_(ss) {
  var out = { ran: false, reason: "", newX: 0, sent: 0, abandoned: 0 };
  try {
    var api = _wcoreStratAlertApi_();
    if (!api) { out.reason = "NO_API"; return out; }
    var props = PropertiesService.getScriptProperties();
    var strat = ss && ss.getSheetByName("Strat");
    if (!strat) { out.reason = "NO_STRAT"; return out; }
    var row = strat.getRange("AY1:BE1").getValues()[0];
    out.ran = true;
    var now = {};
    for (var i = 0; i < STRAT_ALERT_CELLS.length; i++) {
      var v = String(row[STRAT_ALERT_CELLS[i].col] || "").trim().toUpperCase();
      now[STRAT_ALERT_CELLS[i].cell] = (v === "X" || v === "V") ? v : null;
    }

    // Step 1 (under lock): read the state, decide the transitions and their occurrence ids, and
    // save them as pending BEFORE any network call, so a pass that dies after a send makes the
    // next one reuse the same id (the API deduplicates on it).
    var plan = _wcoreStratAlertLocked_(function () {
      var last = null;
      try { last = JSON.parse(props.getProperty(STRAT_ALERT_STATE_KEY) || "null"); } catch (eParse) { last = null; }
      if (!last || typeof last !== "object") {
        props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(now)); // first observation: no alert
        return { init: true };
      }
      var occ = (last.occ && typeof last.occ === "object") ? last.occ : {};
      var pre = { occ: {} };
      var todo = [];
      var abandoned = 0;
      for (var j = 0; j < STRAT_ALERT_CELLS.length; j++) {
        var c = STRAT_ALERT_CELLS[j];
        var cur = now[c.cell];
        pre[c.cell] = last[c.cell] || null;
        if (cur == null) { if (occ[c.cell]) pre.occ[c.cell] = occ[c.cell]; continue; } // unreadable: keep
        if (cur === "V") { pre[c.cell] = "V"; continue; } // back to V: any pending occurrence is dropped
        if (last[c.cell] !== "V") { pre[c.cell] = cur; continue; } // already X: nothing new
        var id = /^[A-Za-z0-9_-]{8,64}$/.test(String(occ[c.cell] || "")) ? occ[c.cell] : c.cell + "-" + Date.now();
        var born = Number(String(id).split("-").pop());
        if (isFinite(born) && Date.now() - born > STRAT_ALERT_OCC_MAX_AGE_MS) { pre[c.cell] = "X"; abandoned++; continue; } // too old
        pre.occ[c.cell] = id;
        todo.push({ c: c, id: id });
      }
      try { props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(pre)); }
      catch (ePre) { return { writeFailed: true, count: todo.length }; } // nothing will be sent
      return { todo: todo, abandoned: abandoned };
    });
    if (plan.locked) { out.reason = "LOCKED"; return out; }
    if (plan.value && plan.value.init) { out.reason = "INIT"; return out; }
    if (plan.value && plan.value.writeFailed) { out.newX = plan.value.count; out.reason = "STATE_WRITE_FAILED"; return out; }
    var todo = plan.value.todo;
    out.abandoned = plan.value.abandoned;
    if (!todo.length) { out.reason = out.abandoned ? "ABANDONED" : "NO_NEW_X"; return out; }

    // Step 2 (no lock): send.
    var done = {};
    for (var t = 0; t < todo.length; t++) {
      var c2 = todo[t].c;
      out.newX++;
      var body = { event: "strat_rebalance", category: c2.category, occurrence: todo[t].id };
      var trade = _wcoreStratAlertTrade_(ss, c2.tradeSheet);
      if (trade) { body.sell = trade.sell; body.buy = trade.buy; }
      var res = _wcoreStratAlertPost_(api, body);
      if (res.ok) { out.sent++; done[c2.cell] = todo[t].id; }
      else if (res.abandon) { out.abandoned++; done[c2.cell] = todo[t].id; }
    }

    // Step 3 (under lock): mark delivered or abandoned occurrences as X; the others stay pending
    // (V + occ) and are retried next pass with the same id. A lost write only causes a retry,
    // which the API answers as a duplicate.
    _wcoreStratAlertLocked_(function () {
      var st = null;
      try { st = JSON.parse(props.getProperty(STRAT_ALERT_STATE_KEY) || "null"); } catch (eSt) { st = null; }
      if (!st || typeof st !== "object") return;
      st.occ = (st.occ && typeof st.occ === "object") ? st.occ : {};
      for (var cell in done) {
        if (st.occ[cell] === done[cell]) { st[cell] = "X"; delete st.occ[cell]; }
      }
      props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(st));
    });
    out.reason = out.sent === todo.length ? "SENT" : "PARTIAL_OR_FAILED";
    Logger.log("[STRAT_ALERT] " + out.reason + " newX=" + out.newX + " sent=" + out.sent + " abandoned=" + out.abandoned);
  } catch (e) {
    out.reason = "ERROR";
  }
  return out;
}

/**
 * "Trade fait" button of the phone alert. The API records the tap; this pass (watchdog, every
 * 10 min) takes the waiting acknowledgements (at most once each, so a second Kraken call can never
 * follow) and runs exactly what ticking the manual refresh cell does: Portefeuille Crypto!U2
 * (CEX crypto) or Portefeuille Action!T2 (CEX stocks), through BITPANDA_ON_EDIT.
 * @return {Object} diagnostic {ran, reason, taken, refreshed}
 */
var TRADE_ACK_TARGETS = {
  crypto: { sheet: "Portefeuille Crypto", cell: "U2" },
  action: { sheet: "Portefeuille Action", cell: "T2" }
};

function _wcoreCheckTradeAck_(ss) {
  var out = { ran: false, reason: "", taken: 0, refreshed: [] };
  try {
    var api = _wcoreStratAlertApi_();
    if (!api) { out.reason = "NO_API"; return out; }
    var url = api.url.replace(/\/api\/gsheet\/notify$/, "/api/gsheet/trade-ack/take");
    var resp = null;
    try {
      resp = HTTP.post(url, {}, {
        headers: { "x-gsheet-token": api.token, accept: "application/json" },
        muteHttpExceptions: true,
        timeoutMs: 8000
      });
    } catch (eHttp) { resp = null; }
    var code = resp && typeof resp.getResponseCode === "function" ? resp.getResponseCode() : 0;
    out.ran = true;
    if (code !== 200) { out.reason = code ? "HTTP_" + code : "NO_RESPONSE"; return out; }
    var cats = [];
    try { cats = JSON.parse(resp.getContentText()).categories; } catch (eParse) { cats = []; }
    if (!Array.isArray(cats) || !cats.length) { out.reason = "NONE"; return out; }
    for (var i = 0; i < cats.length; i++) {
      var target = TRADE_ACK_TARGETS[String(cats[i])];
      if (!target) continue;
      out.taken++;
      var sheet = ss && ss.getSheetByName(target.sheet);
      if (!sheet || typeof BITPANDA_ON_EDIT !== "function") continue;
      var handled = BITPANDA_ON_EDIT({ range: sheet.getRange(target.cell), value: "TRUE", triggerUid: "TRADE_ACK" });
      if (handled) out.refreshed.push(String(cats[i]));
    }
    out.reason = out.refreshed.length ? "REFRESHED" : "NOT_HANDLED";
    Logger.log("[TRADE_ACK] " + out.reason + " taken=" + out.taken + " refreshed=" + out.refreshed.join(","));
  } catch (e) {
    out.reason = "ERROR";
  }
  return out;
}

/** Removes the old ntfy topic property (the topic now lives only on the API side). */
function WCORE_NTFY_CLEAR_TOPIC() {
  PropertiesService.getScriptProperties().deleteProperty("WCORE_NTFY_TOPIC");
  return { ok: true };
}

/** Sends one real test notification through the API relay. */
function WCORE_NTFY_TEST() {
  var api = _wcoreStratAlertApi_();
  if (!api) return { ok: false, reason: "NO_API" };
  var res = _wcoreStratAlertPost_(api, { event: "test" });
  return { ok: res.ok, code: res.code };
}
