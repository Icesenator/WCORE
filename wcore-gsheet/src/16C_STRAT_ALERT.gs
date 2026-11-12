/**
 * 16C_STRAT_ALERT.gs - v4.17.0
 *
 * Phone alert (ntfy) when a Strat control cell turns to X, called by WATCHDOG_FROM_RECAP
 * (every 10 min). Replaces the mails of the removed notification extension (decision of
 * 2026-11-11) without spending a Claude session per check.
 *
 * Cells: AY1 = crypto rebalancing, BE1 = stock rebalancing (Florian, 12/11: only the
 * rebalancings go to the phone; tab errors and stale updates go to the WCORE session through
 * its scheduled check). A notification is sent only when a cell goes from V to X
 * (a cell already at X on the first observation does not notify). A failed send keeps the
 * previous state, so the next pass tries again.
 *
 * Script properties (never in the repository, never logged):
 *   WCORE_NTFY_TOPIC  : the ntfy topic; absent = feature off.
 * The message names the trade to do and its amounts: symbols from Q1/S1 of the portfolio tab
 * and the gap (column P, real minus target, in euros) of the rows marked V and X in column R.
 * Explicit decisions of Florian on 2026-11-12 (« oui, avec le trade », then the amounts), who
 * accepts that anyone knowing the topic can read it (exception to the common ProjetIA rule).
 * State: WCORE_STRAT_ALERT_LAST = {"AY1":"V","BE1":"X",...}.
 */

var STRAT_ALERT_CELLS = [
  { cell: "AY1", col: 0, label: "rééquilibrage Crypto à faire", tradeSheet: "Portefeuille Crypto" },
  { cell: "BE1", col: 6, label: "rééquilibrage Action à faire", tradeSheet: "Portefeuille Action" }
];
var STRAT_ALERT_STATE_KEY = "WCORE_STRAT_ALERT_LAST";
var STRAT_ALERT_NTFY_BASE = "https://ntfy.sh/";

/** Euros, rounded, French style ("1 234 €"); "" when not a finite number. */
function _wcoreStratAlertEuros_(v) {
  var n = Number(v);
  if (!isFinite(n)) return "";
  var r = String(Math.round(Math.abs(n)));
  return r.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
}

/**
 * Trade to do: Q1 (row above its target, marked V in column R) and S1 (row below, marked X),
 * with their gap in euros from column P. Falls back to the symbols alone, then to nothing.
 */
function _wcoreStratAlertTrade_(ss, sheetName) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return "";
    var head = sh.getRange("Q1:S1").getValues()[0];
    var sell = String(head[0] || "").trim(), buy = String(head[2] || "").trim();
    if (!/^[A-Za-z0-9.$_-]{1,15}$/.test(sell) || !/^[A-Za-z0-9.$_-]{1,15}$/.test(buy)) return "";
    var sellAmt = "", buyAmt = "";
    try {
      var last = sh.getLastRow();
      if (last >= 3) {
        var rows = sh.getRange(3, 16, last - 2, 3).getValues(); // P, Q, R
        for (var k = 0; k < rows.length; k++) {
          var sig = String(rows[k][2] || "").trim();
          if (sig === "V" && !sellAmt && Number(rows[k][0]) > 0) sellAmt = _wcoreStratAlertEuros_(rows[k][0]);
          if (sig === "X" && !buyAmt && Number(rows[k][0]) < 0) buyAmt = _wcoreStratAlertEuros_(rows[k][0]);
        }
      }
    } catch (eAmt) { sellAmt = ""; buyAmt = ""; }
    return " : alléger " + sell + (sellAmt ? " de " + sellAmt : "") + ", renforcer " + buy + (buyAmt ? " de " + buyAmt : "");
  } catch (e) { return ""; }
}

/**
 * @return {Object} diagnostic {ran, reason, newX, sent}
 */
function _wcoreCheckStratAlert_(ss) {
  var out = { ran: false, reason: "", newX: 0, sent: false };
  try {
    var props = PropertiesService.getScriptProperties();
    var topic = props.getProperty("WCORE_NTFY_TOPIC");
    if (!topic || !/^[A-Za-z0-9_-]{8,64}$/.test(topic)) { out.reason = "NO_TOPIC"; return out; }
    var strat = ss && ss.getSheetByName("Strat");
    if (!strat) { out.reason = "NO_STRAT"; return out; }
    var row = strat.getRange("AY1:BQ1").getValues()[0];
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

    var parts = [];
    var next = {};
    for (var j = 0; j < STRAT_ALERT_CELLS.length; j++) {
      var c = STRAT_ALERT_CELLS[j];
      var cur = now[c.cell];
      next[c.cell] = cur == null ? (last[c.cell] || null) : cur; // unreadable cell: keep the old state
      if (cur === "X" && last[c.cell] === "V") {
        parts.push(c.label + (c.tradeSheet ? _wcoreStratAlertTrade_(ss, c.tradeSheet) : ""));
      }
    }
    out.newX = parts.length;
    if (!parts.length) {
      props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(next));
      out.reason = "NO_NEW_X";
      return out;
    }

    var text = "WCORE : " + parts.join(" ; ") + ".";
    var resp = null;
    try {
      resp = HTTP.post(STRAT_ALERT_NTFY_BASE + topic, text, {
        headers: { Title: "WCORE", Priority: "high", Tags: "warning" },
        muteHttpExceptions: true,
        timeoutMs: 5000 // passed to the wrapper as a deadline option, not a measured guarantee
      });
    } catch (eHttp) { resp = null; }
    var code = resp && typeof resp.getResponseCode === "function" ? resp.getResponseCode() : 0;
    if (code >= 200 && code < 300) {
      props.setProperty(STRAT_ALERT_STATE_KEY, JSON.stringify(next));
      out.sent = true;
      out.reason = "SENT";
    } else {
      out.reason = resp ? "HTTP_" + code : "HTTP_REFUSED"; // state unchanged: retried next pass
    }
    Logger.log("[STRAT_ALERT] " + out.reason + " newX=" + out.newX);
  } catch (e) {
    out.reason = "ERROR";
  }
  return out;
}
