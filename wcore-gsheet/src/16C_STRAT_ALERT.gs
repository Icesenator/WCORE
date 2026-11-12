/**
 * 16C_STRAT_ALERT.gs - v4.17.2
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

/** Posts one event to the API; ok when the API accepted it (sent or already sent). */
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
  return { ok: code === 200, code: code };
}

/**
 * @return {Object} diagnostic {ran, reason, newX, sent}
 */
function _wcoreCheckStratAlert_(ss) {
  var out = { ran: false, reason: "", newX: 0, sent: 0 };
  var lock = null;
  try {
    var api = _wcoreStratAlertApi_();
    if (!api) { out.reason = "NO_API"; return out; }
    // Overlapping watchdog runs: one check at a time (state read then written).
    try { lock = LockService.getScriptLock(); } catch (eLock) { lock = null; }
    if (lock && !lock.tryLock(2000)) { out.reason = "LOCKED"; lock = null; return out; }
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
    var last = null;
    try { last = JSON.parse(props.getProperty(STRAT_ALERT_STATE_KEY) || "null"); } catch (eParse) { last = null; }
    if (!last || typeof last !== "object") {
      props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(now)); // first observation: no alert
      out.reason = "INIT";
      return out;
    }

    // Occurrence id per V->X transition, kept until delivered and reused on every retry: the API
    // deduplicates on it (never on the text, whose amounts move with prices).
    var occ = (last.occ && typeof last.occ === "object") ? last.occ : {};
    var next = { occ: {} };
    var failed = 0;
    for (var j = 0; j < STRAT_ALERT_CELLS.length; j++) {
      var c = STRAT_ALERT_CELLS[j];
      var cur = now[c.cell];
      next[c.cell] = cur == null ? (last[c.cell] || null) : cur; // unreadable cell: keep the old state
      if (cur == null && occ[c.cell]) next.occ[c.cell] = occ[c.cell];
      if (!(cur === "X" && last[c.cell] === "V")) continue;
      out.newX++;
      var id = /^[A-Za-z0-9_-]{8,64}$/.test(String(occ[c.cell] || "")) ? occ[c.cell] : c.cell + "-" + Date.now();
      var body = { event: "strat_rebalance", category: c.category, occurrence: id };
      var trade = _wcoreStratAlertTrade_(ss, c.tradeSheet);
      if (trade) { body.sell = trade.sell; body.buy = trade.buy; }
      var res = _wcoreStratAlertPost_(api, body);
      if (res.ok) { out.sent++; } else { failed++; next[c.cell] = "V"; next.occ[c.cell] = id; } // retried next pass, same id
    }
    props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(next));
    out.reason = !out.newX ? "NO_NEW_X" : (failed ? "PARTIAL_OR_FAILED" : "SENT");
    if (out.newX) Logger.log("[STRAT_ALERT] " + out.reason + " newX=" + out.newX + " sent=" + out.sent);
  } catch (e) {
    out.reason = "ERROR";
  } finally {
    try { if (lock) lock.releaseLock(); } catch (eRel) {}
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
