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

var STRAT_ALERT_LINES_KEY = "WCORE_STRAT_ALERT_LINES";
var STRAT_ALERT_LINES_TTL_MS = 48 * 60 * 60 * 1000;
var STRAT_ALERT_LINES_KEEP = 12;
var STRAT_ALERT_LINES_BUDGET_MS = 150000;
// Same shape as the API accepts for a line name (the Recap line = the portfolio tab name).
var STRAT_ALERT_LINE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()&+-]{0,59}$/;

/**
 * Euro value of each requested symbol in every portfolio tab listed in the Recap, read from the detail
 * tabs: {held: {SYMBOL: [{name, eur}, ...]}, tabs: number of tabs actually read,
 * complete: false when the budget ran out, a listed tab was missing or a read failed}. Two tab shapes exist (exchange tabs: cryptocoin_symbol / value_eur,
 * wallet tabs: token_ticker / value_eur); a tab with neither header pair is ignored. Stops reading after
 * budgetMs and returns what it has.
 */
function _wcoreStratAlertHoldings_(ss, symbols, budgetMs) {
  var out = {};
  var tabs = 0;
  var complete = true;
  var canon = {};
  for (var s0 = 0; s0 < symbols.length; s0++) { out[symbols[s0]] = []; canon[_wcoreStratAlertCanonSymbol_(symbols[s0])] = symbols[s0]; }
  var recap = ss && ss.getSheetByName("Recap Portfolio");
  if (!recap) return { held: out, tabs: 0, complete: false };
  var last = recap.getLastRow();
  if (last < 2) return { held: out, tabs: 0, complete: false };
  var names = recap.getRange(2, 1, last - 1, 1).getValues();
  var deadline = Date.now() + budgetMs;
  var seen = {};
  for (var i = 0; i < names.length; i++) {
    if (Date.now() > deadline) { complete = false; break; }
    var name = String(names[i][0] || "").trim();
    if (!name || seen[name] || !STRAT_ALERT_LINE_NAME.test(name)) continue;
    seen[name] = true;
    try {
      var sh = ss.getSheetByName(name);
      if (!sh) { complete = false; continue; }
      var rows = sh.getLastRow(), cols = Math.min(sh.getLastColumn(), 12);
      if (rows < 3 || cols < 2) continue; // an empty tab holds nothing
      var vals = sh.getRange(2, 1, rows - 1, cols).getValues();
      var head = vals[0], si = -1, vi = -1;
      for (var c = 0; c < head.length; c++) {
        var h = String(head[c] || "");
        if (si < 0 && /^(cryptocoin_symbol|token_ticker|symbol|ticker)$/i.test(h)) si = c;
        if (vi < 0 && /^(value_eur|total_eur)$/i.test(h)) vi = c;
      }
      if (si < 0 || vi < 0) continue;
      tabs++;
      var sums = {};
      for (var r = 1; r < vals.length; r++) {
        var rawSym = String(vals[r][si] || "").trim();
        // The exact symbol wins; otherwise, in the tab of the broker that writes the suffix, its own form
        // (Kraken xStocks "MUx", Bitpanda "AAPL-LEG"), then the Berkshire aliases. Never in another tab:
        // "ETHx" in a crypto tab, or in a mixed tab that merely has "Stocks" in its name, is another token.
        var sym = out[rawSym.toUpperCase()] ? rawSym.toUpperCase() : _wcoreStratAlertMatchSymbol_(rawSym, name, canon);
        var v = Number(vals[r][vi]);
        if (sym && isFinite(v) && out[sym]) sums[sym] = (sums[sym] || 0) + v;
      }
      for (var key in sums) if (sums[key] > 0) out[key].push({ name: name, eur: sums[key] });
    } catch (eTab) { complete = false; }
  }
  return { held: out, tabs: tabs, complete: complete };
}

/** Berkshire B shares are written BRK.B, BRK-B or BRKB; every other symbol is only upper-cased. */
function _wcoreStratAlertCanonSymbol_(raw) {
  var s = String(raw || "").trim().toUpperCase();
  return /^BRK[-.]?B$/.test(s) ? "BRK.B" : s;
}

/**
 * Requested strategy symbol (a key of `canon`) behind a tab symbol that does not match it exactly, or "".
 * Kraken tokenised stocks end with a lowercase "x" ("MUx", "ANTx", "BRK.Bx"; the uppercase X of "SPCX"
 * belongs to the ticker) and only in a "Kraken ... Stocks" tab; Bitpanda legacy stocks end with "-LEG" and
 * only in a "Bitpanda ... Stocks" tab. 2026-11-25: without this, the notification claimed that no line held
 * MU or ANT while the Kraken tab held both.
 */
function _wcoreStratAlertMatchSymbol_(raw, tabName, canon) {
  var s = String(raw || "").trim();
  var direct = canon[_wcoreStratAlertCanonSymbol_(s)]; // Berkshire alias written another way
  if (direct) return direct;
  var tab = String(tabName).replace(/^CEX\s*-\s*/i, "");
  if (/^Kraken\b.*\bStocks?\b/i.test(tab) && /^[A-Z0-9][A-Z0-9.]*x$/.test(s)) s = s.slice(0, -1);
  else if (/^Bitpanda\b.*\bStocks?\b/i.test(tab) && /-LEG$/i.test(s)) s = s.replace(/-LEG$/i, "");
  else return "";
  return canon[_wcoreStratAlertCanonSymbol_(s)] || "";
}

function _wcoreStratAlertLinesStore_() {
  var raw = null;
  try { raw = JSON.parse(PropertiesService.getScriptProperties().getProperty(STRAT_ALERT_LINES_KEY) || "null"); } catch (e) { raw = null; }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/**
 * Recap lines proposed for one alert: {sell: [names], buy: [names], enough, ts}. Computed once per
 * occurrence and kept in the script properties, so a retry sends the same lines and the "Trade fait"
 * acknowledgement refreshes exactly what was proposed. Returns null when the alert has no symbols.
 */
function _wcoreStratAlertLinesFor_(ss, id, trade) {
  if (!trade || !trade.sell || !trade.buy) return null;
  var store = _wcoreStratAlertLinesStore_();
  if (store[id] && Array.isArray(store[id].sell) && Array.isArray(store[id].buy)) return store[id];
  var sellSym = String(trade.sell.symbol).toUpperCase(), buySym = String(trade.buy.symbol).toUpperCase();
  var read = _wcoreStratAlertHoldings_(ss, sellSym === buySym ? [sellSym] : [sellSym, buySym], STRAT_ALERT_LINES_BUDGET_MS);
  // Nothing readable, or an incomplete read (budget, missing tab, failed read): no claim at all, never a
  // false "no line holds it" and never a top three that missed a larger holder.
  if (!read.tabs || !read.complete) return null;
  var held = read.held;
  var top = function (sym) {
    return (held[sym] || []).slice().sort(function (a, b) { return b.eur - a.eur; }).slice(0, 3);
  };
  var sell = top(sellSym), buy = top(buySym);
  var sides = [trade.sell.eur, trade.buy.eur].filter(function (v) { return v != null && isFinite(v); });
  var amount = sides.length ? Math.min.apply(null, sides) : null;
  var entry = {
    sell: sell.map(function (x) { return x.name; }),
    buy: buy.map(function (x) { return x.name; }),
    // Value of the first (largest) sell line, kept so "enough" can be recomputed against the amount of each
    // send: a retry recomputes the amounts, the flag must follow them.
    firstEur: sell.length ? sell[0].eur : 0,
    enough: sell.length > 0 && amount != null && sell[0].eur >= amount,
    // Set only once the notification carrying these lines was really delivered: until then (or if that
    // mark is lost) an acknowledgement does not use them, so nothing unannounced is ever refreshed.
    announced: false,
    ts: Date.now()
  };
  var now = Date.now(), keep = [];
  for (var k in store) if (store[k] && now - Number(store[k].ts) < STRAT_ALERT_LINES_TTL_MS) keep.push(k);
  keep.sort(function (a, b) { return Number(store[b].ts) - Number(store[a].ts); });
  var next = {};
  for (var n = 0; n < keep.length && n < STRAT_ALERT_LINES_KEEP - 1; n++) next[keep[n]] = store[keep[n]];
  next[id] = entry;
  // Not saved = not proposed: the acknowledgement could not find these lines again, and a retry could
  // propose different ones.
  try { PropertiesService.getScriptProperties().setProperty(STRAT_ALERT_LINES_KEY, JSON.stringify(next)); } catch (eSave) { return null; }
  return entry;
}

/**
 * "Enough" for one send: the first sell line covers the one amount the notification shows (the smaller
 * side of the rebalancing, as known at this send).
 */
function _wcoreStratAlertEnough_(entry, trade) {
  var sides = [trade && trade.sell ? trade.sell.eur : null, trade && trade.buy ? trade.buy.eur : null]
    .filter(function (v) { return v != null && isFinite(v); });
  if (!sides.length || !entry || !entry.sell || !entry.sell.length) return false;
  return Number(entry.firstEur) >= Math.min.apply(null, sides);
}

/** Marks the lines of one occurrence as announced (the notification that carried them was delivered). */
function _wcoreStratAlertLinesAnnounce_(id) {
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var store = _wcoreStratAlertLinesStore_();
      if (!store[id]) return false;
      store[id].announced = true;
      PropertiesService.getScriptProperties().setProperty(STRAT_ALERT_LINES_KEY, JSON.stringify(store));
      return true;
    } catch (e) {}
  }
  return false;
}

/**
 * Manual preview (no notification, nothing saved): the Recap lines that would be proposed for a pair of
 * symbols, with the number of tabs read and the time it took. Run by hand from the editor.
 */
function WCORE_STRAT_ALERT_LINES_PREVIEW(sellSymbol, buySymbol) {
  var sell = String(sellSymbol || "").toUpperCase(), buy = String(buySymbol || "").toUpperCase();
  if (!/^[A-Z0-9.$_-]{1,15}$/.test(sell) || !/^[A-Z0-9.$_-]{1,15}$/.test(buy)) return { ok: false, reason: "BAD_SYMBOL" };
  var ss = typeof _wcoreGetSpreadsheet_ === "function" ? _wcoreGetSpreadsheet_() : null;
  if (!ss) return { ok: false, reason: "NO_SPREADSHEET" };
  var t0 = Date.now();
  var read = _wcoreStratAlertHoldings_(ss, sell === buy ? [sell] : [sell, buy], STRAT_ALERT_LINES_BUDGET_MS);
  var top = function (sym) {
    return (read.held[sym] || []).slice().sort(function (x, y) { return y.eur - x.eur; }).slice(0, 3).map(function (v) { return v.name; });
  };
  return { ok: true, tabs: read.tabs, complete: read.complete, ms: Date.now() - t0, sell: top(sell), buy: top(buy) };
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
  // sent = this very call delivered a new notification (the API answers 200 with sent:false for a
  // duplicate: the notification that exists is the earlier one, with whatever text it had).
  var sent = false;
  try { sent = code === 200 && JSON.parse(resp.getContentText()).sent === true; } catch (eSent) { sent = false; }
  return { ok: code === 200, abandon: code === 422, code: code, sent: sent };
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
      try {
        var lines = _wcoreStratAlertLinesFor_(ss, todo[t].id, trade);
        if (lines) { body.sellLines = lines.sell; body.sellEnough = _wcoreStratAlertEnough_(lines, trade); body.buyLines = lines.buy; }
      } catch (eLines) {} // the alert goes out without lines rather than not at all
      var res = _wcoreStratAlertPost_(api, body);
      if (!res.ok && res.code === 400 && body.sellLines !== undefined) {
        // An API published before the lines existed refuses the body: the alert goes out without them, and
        // "Trade fait" then keeps the category batch (the saved lines stay "not announced", so unused).
        delete body.sellLines; delete body.sellEnough; delete body.buyLines;
        res = _wcoreStratAlertPost_(api, body);
      }
      // Announced only by a genuine delivery of the body that carried the lines, never by a duplicate answer.
      if (res.sent && body.sellLines !== undefined) _wcoreStratAlertLinesAnnounce_(todo[t].id);
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
 * @return {Object} diagnostic {ran, reason, taken, refreshed, skipped}
 */
var TRADE_ACK_TARGETS = {
  crypto: { sheet: "Portefeuille Crypto", cell: "U2", statusCell: "V2" },
  action: { sheet: "Portefeuille Action", cell: "T2", statusCell: "U2" }
};

/** True when a manual CEX job is running, or the queue still holds a job reporting to that status cell. */
/** Window during which an acknowledgement does not add a second Kraken Balance call. */
var TRADE_ACK_KRAKEN_REUSE_MS = 5 * 60 * 1000;

/**
 * Removes the Kraken jobs from the batch of an acknowledgement when Kraken answered less than
 * TRADE_ACK_KRAKEN_REUSE_MS ago (a second Balance call that close is what gets the key locked out) or is
 * in a post-lockout pause (a job would only fail and be retried at the worst moment). The other exchanges
 * are refreshed as usual; the Kraken tabs keep their last values and timestamp.
 */
function _wcoreTradeAckKrakenBlocked_() {
  var recent = false, paused = false;
  try {
    var prop = typeof KRAKEN_SYNC_CONFIG !== "undefined" ? KRAKEN_SYNC_CONFIG.SHARED_OK_PROP : "";
    var last = prop ? Number(PropertiesService.getScriptProperties().getProperty(prop) || 0) : 0;
    recent = last > 0 && Date.now() >= last && Date.now() - last < TRADE_ACK_KRAKEN_REUSE_MS;
  } catch (eRecent) {}
  try { paused = typeof _krakenLockoutUntilMs_ === "function" && !!_krakenLockoutUntilMs_(); } catch (ePause) {}
  return recent || paused;
}

function _wcoreTradeAckDropKraken_(jobs) {
  if (!_wcoreTradeAckKrakenBlocked_()) return jobs;
  return jobs.filter(function (j) { return !j || (j.kind !== "KRAKEN" && j.kind !== "KRAKEN_STOCKS"); });
}

/**
 * Refreshes only the Recap lines proposed in the notification, each through the same path as ticking the
 * A1 box of its tab (WCORE_ON_EDIT with an installable-trigger style event): exchange tabs queue their
 * own manual job (identical queued jobs are coalesced), wallet tabs get their B1 pulse. Kraken tabs are
 * skipped right after a Kraken call or during a pause. Returns {refreshed: [names], skipped: [names]}.
 */
function _wcoreTradeAckRefreshLines_(ss, names) {
  var res = { refreshed: [], skipped: [] };
  if (typeof WCORE_ON_EDIT !== "function") return res;
  var krakenBlocked = null;
  for (var i = 0; i < names.length; i++) {
    var name = String(names[i] || "");
    if (!STRAT_ALERT_LINE_NAME.test(name)) continue;
    var sheet = ss && ss.getSheetByName(name);
    if (!sheet) { res.skipped.push(name); continue; }
    if (/^CEX - Kraken/i.test(name)) {
      if (krakenBlocked === null) krakenBlocked = _wcoreTradeAckKrakenBlocked_();
      if (krakenBlocked) { res.skipped.push(name); continue; }
    }
    try {
      WCORE_ON_EDIT({ range: sheet.getRange("A1"), value: "TRUE", triggerUid: "TRADE_ACK_LINE" });
      res.refreshed.push(name);
    } catch (eLine) { res.skipped.push(name); }
  }
  return res;
}

function _wcoreTradeAckBusy_(queue, statusSheetName, statusCell) {
  try {
    var props = PropertiesService.getScriptProperties();
    // The worker records the cell of the job it runs (CEX_MANUAL_RUNNING = "sheet!cell|until"),
    // under the same queue lock as its claim, for at most 6 min (the trigger hard limit). This guard
    // runs under that lock: the job is either still in the queue or recorded here, never in between.
    var runMap = null;
    try { runMap = JSON.parse(props.getProperty("CEX_MANUAL_RUNNING") || "null"); } catch (eRun) { runMap = null; }
    var entries = runMap && typeof runMap === "object" ? runMap[statusSheetName + "!" + statusCell] : null;
    if (Array.isArray(entries)) {
      for (var r = 0; r < entries.length; r++) { if (entries[r] && Number(entries[r].u) > Date.now()) return true; }
    }
    if (!Array.isArray(queue)) return false;
    for (var i = 0; i < queue.length; i++) {
      var j = queue[i] || {};
      if (j.statusSheetName === statusSheetName && j.statusCell === statusCell) return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Cheap pre-check outside the lock (saves a needless enqueue attempt). The authoritative decision
 * is _wcoreTradeAckBusy_ evaluated by _cexEnqueueManualJobs_ under the queue lock.
 */
function _wcoreTradeAckQueueHas_(statusSheetName, statusCell) {
  var queue = [];
  try { queue = JSON.parse(PropertiesService.getScriptProperties().getProperty("CEX_MANUAL_JOB_QUEUE") || "[]"); } catch (e) { queue = []; }
  return _wcoreTradeAckBusy_(queue, statusSheetName, statusCell);
}

function _wcoreCheckTradeAck_(ss) {
  var out = { ran: false, reason: "", taken: 0, refreshed: [], skipped: [] };
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
    var cats = [], acks = null;
    try {
      var parsed = JSON.parse(resp.getContentText());
      cats = parsed.categories;
      acks = Array.isArray(parsed.acks) ? parsed.acks : null;
    } catch (eParse) { cats = []; }
    if (!Array.isArray(cats) || !cats.length) { out.reason = "NONE"; return out; }
    out.lines = [];
    out.linesSkipped = [];
    if (acks) {
      // An acknowledgement whose notification proposed Recap lines refreshes exactly those lines; one
      // without (a test, an alert with no holder, an older notification) keeps the category batch.
      var store = _wcoreStratAlertLinesStore_();
      var lineNames = [], leftover = {};
      for (var a = 0; a < acks.length; a++) {
        var ack = acks[a] || {};
        var entry = ack.occurrence ? store[ack.occurrence] : null;
        var proposed = entry && entry.announced === true && Array.isArray(entry.sell) && Array.isArray(entry.buy) ? entry.sell.concat(entry.buy) : [];
        if (proposed.length) {
          out.taken++;
          for (var p = 0; p < proposed.length; p++) if (lineNames.indexOf(proposed[p]) < 0) lineNames.push(proposed[p]);
        } else if (ack.category === "crypto" || ack.category === "action") {
          leftover[ack.category] = true;
        }
      }
      if (lineNames.length) {
        var lr = _wcoreTradeAckRefreshLines_(ss, lineNames);
        out.lines = lr.refreshed;
        out.linesSkipped = lr.skipped;
      }
      cats = Object.keys(leftover);
    }
    for (var i = 0; i < cats.length; i++) {
      var target = TRADE_ACK_TARGETS[String(cats[i])];
      if (!target) continue;
      out.taken++;
      var sheet = ss && ss.getSheetByName(target.sheet);
      if (!sheet || typeof BITPANDA_ON_EDIT !== "function") continue;
      // A manual tick (or an earlier acknowledgement) is already queued and not finished: its status
      // cell still reads QUEUED. Do not add a second batch of CEX jobs (second Kraken call).
      var status = "";
      try { status = String(sheet.getRange(target.statusCell).getValue() || ""); } catch (eStatus) { status = ""; }
      // The status turns to "<job> OK" as soon as the first job ends while the others are still in
      // the queue, so the queue itself is read too.
      if (/^\s*QUEUED/i.test(status) || _wcoreTradeAckQueueHas_(target.sheet, target.statusCell)) {
        out.skipped.push(String(cats[i]));
        continue;
      }
      var ev = { range: sheet.getRange(target.cell), value: "TRUE", triggerUid: "TRADE_ACK", tradeAck: { skipped: false } };
      var handled = BITPANDA_ON_EDIT(ev);
      if (ev.tradeAck.skipped) out.skipped.push(String(cats[i]));
      else if (handled) out.refreshed.push(String(cats[i]));
    }
    out.reason = out.refreshed.length ? "REFRESHED"
      : (out.lines.length ? "LINES_REFRESHED"
        : (out.skipped.length ? "ALREADY_QUEUED" : (out.linesSkipped.length ? "LINES_SKIPPED" : "NOT_HANDLED")));
    Logger.log("[TRADE_ACK] " + out.reason + " taken=" + out.taken + " refreshed=" + out.refreshed.join(",") + " lines=" + out.lines.length);
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

/**
 * Real end-to-end test of the "Trade fait" button: sends ONE rebalancing notification (with the
 * button) through the API relay, category "crypto" by default. Tapping the button makes the next
 * watchdog pass run the real CEX refresh (Portefeuille Crypto!U2, or Portefeuille Action!T2 for
 * "action"). Run it by hand from the Apps Script editor; no trigger calls it.
 */
function WCORE_TRADE_ACK_TEST(category) {
  // Manual only: the editor passes nothing, a trigger passes an event object, which is refused.
  if (category !== undefined && category !== "crypto" && category !== "action") return { ok: false, reason: "NOT_MANUAL" };
  var cat = category === "action" ? "action" : "crypto";
  var api = _wcoreStratAlertApi_();
  if (!api) return { ok: false, reason: "NO_API" };
  // Unique per call even within one millisecond (the API deduplicates on the occurrence).
  var occurrence = "TEST-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
  var res = _wcoreStratAlertPost_(api, { event: "strat_rebalance", category: cat, occurrence: occurrence });
  return { ok: res.ok, code: res.code, category: cat };
}
