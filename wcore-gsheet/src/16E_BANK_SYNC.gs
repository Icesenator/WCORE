/**
 * Bank balances for "S\u00e9curisation!G5:G8", read from Enable Banking by the workbook itself (button "Virement fait").
 *
 * Port of the local reading rules (current accounts read, savings accounts ESTIMATED from the movements: the
 * API exposes no savings balance). Read-only on the bank side; the only write is the four cells G5:G8 of
 * "Securisation", all together, and only in securing mode (Strat!BW1 = TRUE).
 *
 * Guards: one attempt per bank and per run (a 429 or any non-200 stops everything, nothing is written),
 * a daily budget of reads per bank, a pause after a 429, a savings estimate that is only written when the day of
 * the last entered balance is found again in the bank history. No amount, key or identifier is logged or returned.
 *
 * Private data (the holder's name as it appears on transfers) is NOT in this file: it is a user property filled
 * by the owner with WCORE_EB_INSTALL_CE (this repository is public).
 */
var EB_PROP_CE_UID = "EB_CE_ACCOUNT_UID";
var EB_PROP_SELF = "EB_SELF_PATTERN";
var EB_PROP_READS = "EB_READS_LOG";
var EB_PROP_PAUSE = "EB_PAUSE_UNTIL";
var EB_HISTORY_DAYS = 92;
var EB_MAX_PAGES = 50;
var EB_READS_PER_DAY = 2;
var EB_PAUSE_AFTER_429_MS = 6 * 3600 * 1000;
var EB_SECU_SHEET = "S\u00e9curisation";
var EB_MONTHS = "(Janvier|Fevrier|Février|Mars|Avril|Mai|Juin|Juillet|Aout|Août|Septembre|Octobre|Novembre|Decembre|Décembre)";
var EB_TO_LIVRET = new RegExp("^VIR (Virement avec Fortuneo Livre|Livret " + EB_MONTHS + "|" + EB_MONTHS + "\\b)", "i");
var EB_FROM_LIVRET = /^VIR (Virement avec Fortuneo Compt|Retrait Livret)/i;

function _wcoreEbLab_(t) {
  var r = t && t.remittance_information;
  return [].concat(r || []).join(" ").replace(/\s+/g, " ").trim();
}

function _wcoreEbCents_(v) { return Math.round(Number(v) * 100); }

/** Same rule as the local reader: the first balance of the answer. null when absent. */
function _wcoreEbBalanceOf_(json) {
  var b = json && (json.balances && json.balances.balances ? json.balances.balances : json.balances);
  var x = [].concat(b || [])[0];
  var n = x && x.balance_amount ? Number(x.balance_amount.amount) : NaN;
  return isFinite(n) ? n : null;
}

/** Transfers between the two current accounts: same amount, opposite direction, other bank, within 4 days (1 to 1). */
function _wcoreEbCrossBank_(txs, selfRe) {
  var set = [];
  var has = function (x) { return set.indexOf(x) >= 0; };
  var day = function (t) { return Date.parse(t.booking_date); };
  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    if (has(t)) continue;
    var l = _wcoreEbLab_(t);
    if (!(selfRe.test(l) || EB_TO_LIVRET.test(l) || EB_FROM_LIVRET.test(l))) continue;
    for (var j = 0; j < txs.length; j++) {
      var u = txs[j];
      if (u === t || has(u) || u._bank === t._bank) continue;
      if (_wcoreEbCents_(u.transaction_amount.amount) === _wcoreEbCents_(t.transaction_amount.amount)
        && u.credit_debit_indicator !== t.credit_debit_indicator
        && Math.abs(day(u) - day(t)) <= 4 * 864e5) { set.push(t, u); break; }
    }
  }
  return set;
}

/** {livret, sens} (+1 toward the savings account, -1 withdrawal) or null. */
function _wcoreEbLivretMove_(t, cross, selfRe) {
  if (cross.indexOf(t) >= 0) return null;
  var l = _wcoreEbLab_(t);
  var deb = t.credit_debit_indicator === "DBIT";
  if (t._bank === "fortuneo") {
    if (deb && EB_TO_LIVRET.test(l)) return { livret: "Livret+", sens: 1 };
    if (!deb && EB_FROM_LIVRET.test(l)) return { livret: "Livret+", sens: -1 };
    return null;
  }
  if (t._bank === "caisse-epargne" && selfRe.test(l)) return { livret: "Livret A", sens: deb ? 1 : -1 };
  return null;
}

/** End-of-day balances going back from the current balance, latest day first. */
function _wcoreEbEndOfDay_(txs, current) {
  var bal = current, eod = [], seen = {}, days = [];
  txs.forEach(function (t) { if (!seen[t.booking_date]) { seen[t.booking_date] = 1; days.push(t.booking_date); } });
  days.sort().reverse();
  days.forEach(function (d) {
    eod.push({ day: d, bal: Math.round(bal * 100) / 100 });
    txs.forEach(function (t) {
      if (t.booking_date === d) bal -= Number(t.transaction_amount.amount) * (t.credit_debit_indicator === "DBIT" ? -1 : 1);
    });
  });
  return eod;
}

/**
 * Savings estimate of one bank: start from the last entered savings value at the day when the current account
 * balance was the entered one, then apply the movements after that day. ok=false (nothing to write) when that day
 * is not found in the history. Annual interest is not included.
 */
function _wcoreEbEstimateLivret_(bank, txs, cross, selfRe, current, savedBalance, savedLivret) {
  var mine = txs.filter(function (t) { return t._bank === bank; });
  var wanted = bank === "fortuneo" ? "Livret+" : "Livret A";
  var eod = _wcoreEbEndOfDay_(mine, current);
  var results = [];
  eod.forEach(function (e) {
    if (_wcoreEbCents_(e.bal) !== _wcoreEbCents_(savedBalance)) return;
    var from = new Date(Date.parse(e.day) + 864e5).toISOString().slice(0, 10);
    var liv = Number(savedLivret);
    mine.filter(function (t) { return t.booking_date >= from; }).forEach(function (t) {
      var m = _wcoreEbLivretMove_(t, cross, selfRe);
      if (m && m.livret === wanted) liv += m.sens * Number(t.transaction_amount.amount);
    });
    results.push(_wcoreEbCents_(liv));
  });
  if (!results.length) return { ok: false, reason: "SAVED_DAY_NOT_FOUND" };
  // A balance that recurs on several days must lead to the same estimate, otherwise the entered day is ambiguous.
  for (var k = 1; k < results.length; k++) if (results[k] !== results[0]) return { ok: false, reason: "SAVED_DAY_AMBIGUOUS" };
  return { ok: true, livret: results[0] / 100 };
}

// ---------------------------------------------------------------- reads budget (one attempt per bank)

function _wcoreEbReadLog_() {
  try { return JSON.parse(_wcoreEbProps_().getProperty(EB_PROP_READS) || "{}") || {}; } catch (e) { return {}; }
}

function _wcoreEbRecentReads_(bank, now) {
  return (_wcoreEbReadLog_()[bank] || []).filter(function (ts) { return now - ts < 24 * 3600 * 1000; });
}

/** True when a read of the bank is allowed now: no pause after a 429 and the daily budget not used. Writes nothing. */
function _wcoreEbCanRead_(bank, now) {
  var pause = {};
  try { pause = JSON.parse(_wcoreEbProps_().getProperty(EB_PROP_PAUSE) || "{}") || {}; } catch (e) { pause = {}; }
  return !(Number(pause[bank]) > now) && _wcoreEbRecentReads_(bank, now).length < EB_READS_PER_DAY;
}

/** Reserves one read for the bank (counted BEFORE the call, failed or not). false = budget used or pause active. */
function _wcoreEbReserveRead_(bank, now) {
  if (!_wcoreEbCanRead_(bank, now)) return false;
  var log = _wcoreEbReadLog_();
  var recent = _wcoreEbRecentReads_(bank, now);
  recent.push(now);
  log[bank] = recent;
  _wcoreEbProps_().setProperty(EB_PROP_READS, JSON.stringify(log));
  return true;
}

function _wcoreEbPauseBank_(bank, now) {
  var props = _wcoreEbProps_();
  var pause = {};
  try { pause = JSON.parse(props.getProperty(EB_PROP_PAUSE) || "{}") || {}; } catch (e) { pause = {}; }
  pause[bank] = now + EB_PAUSE_AFTER_429_MS;
  props.setProperty(EB_PROP_PAUSE, JSON.stringify(pause));
}

/**
 * Reads one account: balance, then the movements of the last EB_HISTORY_DAYS days. Any non-200 answer stops
 * the read (no retry, no partial result). Returns {code, balance, txs}; code 200 only when everything came back.
 */
function _wcoreEbReadAccount_(bank, uid, now) {
  if (!_wcoreEbReserveRead_(bank, now)) return { code: -1 };
  var base = "/accounts/" + encodeURIComponent(uid);
  var b = _wcoreEbGet_(base + "/balances");
  if (b.code !== 200) { if (b.code === 429) _wcoreEbPauseBank_(bank, now); return { code: b.code }; }
  var balance = _wcoreEbBalanceOf_(b.json);
  if (balance === null) return { code: -2 };
  var from = new Date(now - EB_HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
  var txs = [], ck = null, pages = 0, seenKeys = {};
  do {
    var r = _wcoreEbGet_(base + "/transactions?date_from=" + from + (ck ? "&continuation_key=" + encodeURIComponent(ck) : ""));
    if (r.code !== 200 || !r.json) { if (r.code === 429) _wcoreEbPauseBank_(bank, now); return { code: r.code || -3 }; }
    (r.json.transactions || []).forEach(function (t) { if (t.booking_date) { t._bank = bank; txs.push(t); } });
    ck = r.json.continuation_key || null;
    if (ck) { if (seenKeys[ck]) return { code: -5 }; seenKeys[ck] = 1; }
    pages++;
  } while (ck && pages < EB_MAX_PAGES);
  if (ck) return { code: -4 };
  return { code: 200, balance: balance, txs: txs };
}

function _wcoreEbNum_(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  var n = Number(String(v === null || v === undefined ? "" : v).replace(/\s/g, "").replace(",", "."));
  return String(v === null || v === undefined ? "" : v).trim() === "" || !isFinite(n) ? null : n;
}

/**
 * Reads Fortuneo and the Caisse d'Epargne, estimates both savings accounts, and (write = true) rewrites
 * Sécurisation!G5:G8 together: G5 = CE balance, G6 = Fortuneo balance, G7 = Livret A, G8 = Livret+.
 * Nothing is written unless every step succeeded and the sheet is in securing mode and unchanged since the read.
 * Returns diagnostics only (reason codes), never an amount.
 */
function _wcoreEbRefreshSecurisation_(write) {
  var lock = null, got = false;
  try {
    lock = LockService.getScriptLock();
    got = lock.tryLock(5000);
    if (!got) return { ran: false, wrote: false, reason: "LOCK_BUSY" };
    return _wcoreEbRefreshLocked_(write);
  } catch (eUnexpected) {
    // The raw exception could carry bank data into the logs: only a reason code leaves this function.
    return { ran: false, wrote: false, reason: "UNEXPECTED" };
  } finally {
    if (got) { try { lock.releaseLock(); } catch (eRelease) {} }
  }
}

function _wcoreEbRefreshLocked_(write) {
  var out = { ran: false, wrote: false, reason: "" };
  var props = _wcoreEbProps_();
  var foUid = props.getProperty(EB_PROP_UID), ceUid = props.getProperty(EB_PROP_CE_UID), selfSrc = props.getProperty(EB_PROP_SELF);
  if (!foUid || !ceUid || !selfSrc || !props.getProperty(EB_PROP_KEY)) { out.reason = "NOT_CONFIGURED"; return out; }
  var selfRe;
  try { selfRe = new RegExp(selfSrc, "i"); } catch (eRe) { out.reason = "BAD_SELF_PATTERN"; return out; }
  var ss = SpreadsheetApp.openById(WCORE_SPREADSHEET_ID);
  var strat = ss.getSheetByName("Strat"), secu = ss.getSheetByName(EB_SECU_SHEET);
  if (!strat || !secu) { out.reason = "SHEET_MISSING"; return out; }
  if (write && strat.getRange("BW1").getValue() !== true) { out.reason = "NOT_SECURING_MODE"; return out; }
  var anchor = secu.getRange("G5:G8").getValues().map(function (r) { return _wcoreEbNum_(r[0]); });
  if (anchor.some(function (v) { return v === null; })) { out.reason = "ANCHOR_NOT_NUMERIC"; return out; }
  var now = Date.now();
  // Both banks must be readable BEFORE the first call: no read is spent when the second one would be refused.
  if (!_wcoreEbCanRead_("fortuneo", now)) { out.reason = "FORTUNEO_BUDGET_OR_PAUSE"; return out; }
  if (!_wcoreEbCanRead_("caisse-epargne", now)) { out.reason = "CE_BUDGET_OR_PAUSE"; return out; }
  out.ran = true;
  var fo = _wcoreEbReadAccount_("fortuneo", foUid, now);
  if (fo.code !== 200) { out.reason = "FORTUNEO_" + fo.code; return out; }
  var ce = _wcoreEbReadAccount_("caisse-epargne", ceUid, now);
  if (ce.code !== 200) { out.reason = "CE_" + ce.code; return out; }
  var txs = fo.txs.concat(ce.txs);
  var cross = _wcoreEbCrossBank_(txs, selfRe);
  var lp = _wcoreEbEstimateLivret_("fortuneo", txs, cross, selfRe, fo.balance, anchor[1], anchor[3]);
  if (!lp.ok) { out.reason = "LIVRET_PLUS_" + lp.reason; return out; }
  var la = _wcoreEbEstimateLivret_("caisse-epargne", txs, cross, selfRe, ce.balance, anchor[0], anchor[2]);
  if (!la.ok) { out.reason = "LIVRET_A_" + la.reason; return out; }
  var values = [[ce.balance], [fo.balance], [la.livret], [lp.livret]];
  out.values = values; // never returned by a public entry point
  if (!write) { out.reason = "DRY_RUN_OK"; return out; }
  var again = secu.getRange("G5:G8").getValues().map(function (r) { return _wcoreEbNum_(r[0]); });
  for (var i = 0; i < 4; i++) { if (again[i] !== anchor[i]) { out.reason = "SHEET_CHANGED_DURING_READ"; return out; } }
  if (strat.getRange("BW1").getValue() !== true) { out.reason = "NOT_SECURING_MODE"; return out; }
  secu.getRange("G5:G8").setValues(values);
  SpreadsheetApp.flush(); // visible to the next run before the lock is released
  out.wrote = true;
  out.reason = "WRITTEN";
  return out;
}

/**
 * Owner, from the editor: full read WITHOUT writing. The four values it WOULD write (G5 to G8) are shown only in
 * the owner's own dialog, for a check against the local reader; the function returns the reason code only and
 * nothing is logged.
 */
function WCORE_EB_DRYRUN() {
  var r = _wcoreEbRefreshSecurisation_(false);
  var msg = "Arret : " + r.reason;
  if (r.reason === "DRY_RUN_OK" && r.values) {
    msg = "Lecture a blanc reussie, rien ecrit. Valeurs qui seraient ecrites (G5 a G8) : "
      + r.values.map(function (v) { return v[0].toFixed(2); }).join(" ; ");
  }
  try { SpreadsheetApp.getUi().alert("Relecture a blanc", msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* no UI: nothing is logged */ }
  return { reason: r.reason };
}

/**
 * Owner, from the editor: second installation step for the Caisse d'Epargne account and the holder's name as it
 * appears on transfers (a regular expression, e.g. "NOM PRENOM|PRENOM NOM"). Nothing is logged or shown back.
 */
function WCORE_EB_INSTALL_CE() {
  var ui = SpreadsheetApp.getUi();
  var uid = _wcoreEbAsk_(ui, "Caisse d'Epargne 1/2", "Identifiant du compte Caisse d'Epargne (session) :");
  if (uid === null) return;
  var who = _wcoreEbAsk_(ui, "Caisse d'Epargne 2/2", "Nom tel qu'il apparait sur tes virements (motif, ex. NOM PRENOM|PRENOM NOM) :");
  if (who === null) return;
  uid = String(uid).trim();
  who = String(who).trim();
  var ok = !!uid && !!who;
  try { if (ok) new RegExp(who, "i"); } catch (e) { ok = false; }
  if (ok) {
    var o = {};
    o[EB_PROP_CE_UID] = uid;
    o[EB_PROP_SELF] = who;
    _wcoreEbProps_().setProperties(o);
  }
  ui.alert("Caisse d'Epargne", ok ? "Installe." : "Refuse : INVALID", ui.ButtonSet.OK);
}
