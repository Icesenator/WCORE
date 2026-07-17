// v4.15.206 - Retry HTTP 200 responses with empty or truncated JSON bodies.
// v4.15.205 - Use patched UrlFetchApp.fetch (respects quota breaker) instead of _WCORE_ORIG_FETCH bypass.
// v4.15.203 - Auto-resize chart height after filter reapply based on visible rows (S=X count).
// v4.15.202 - Reapply auto-filter on column S (Achat) after each hourly refresh.
// v4.15.201 - Retry transient WCORE API network failures (e.g. "Address unavailable") before erroring.
// v4.15.200 - Portefeuille Crypto (source WCORE API, sans SyncWith).

var CRYPTO_PORTFOLIO_VERSION = "4.15.206";

// Transient network failures from UrlFetchApp.fetch (e.g. GAS "Address
// unavailable", DNS, TCP reset, micro-quota) are thrown, not returned as an
// HTTP status. Retry those a few times before surfacing an error to B1. Real
// HTTP statuses (401/500/...) are returned by fetch and handled by the caller,
// so they are NOT retried here.
var CRYPTO_PORTFOLIO_FETCH_MAX_ATTEMPTS = 3;
var CRYPTO_PORTFOLIO_FETCH_RETRY_DELAY_MS = 5000;

function _cryptoPortfolioFetchWithRetry_(fetchFn) {
  var lastErr = null;
  for (var attempt = 1; attempt <= CRYPTO_PORTFOLIO_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return fetchFn();
    } catch (e) {
      lastErr = e;
      if (attempt < CRYPTO_PORTFOLIO_FETCH_MAX_ATTEMPTS) {
        try {
          if (typeof Logger !== "undefined" && Logger.log) {
            Logger.log("[CRYPTO_PORTFOLIO] fetch attempt " + attempt + "/" + CRYPTO_PORTFOLIO_FETCH_MAX_ATTEMPTS + " failed: " + String(e && e.message ? e.message : e) + " — retrying in " + (CRYPTO_PORTFOLIO_FETCH_RETRY_DELAY_MS / 1000) + "s");
          }
        } catch (eLog) {}
        try { Utilities.sleep(CRYPTO_PORTFOLIO_FETCH_RETRY_DELAY_MS); } catch (eSleep) {}
      }
    }
  }
  throw lastErr;
}

var CRYPTO_PORTFOLIO_CONFIG = {
  SHEET_NAME: "Portefeuille Crypto",
  ENDPOINT: "/api/gsheet/crypto/portfolio",
  FIRST_DATA_ROW: 3,
  MANAGED_LAST_COLUMN: 20, // T
  STATUS_CELL: "B1",
  REFRESH_CELL: "A1",
  MAX_ROWS: 6012,
  DETAILS_SHEET_NAME: "Portefeuille Crypto Details",
  OFF_UNIVERSE_RANK: 5002
};

var CRYPTO_PORTFOLIO_HEADERS = [
  "Symbol", "CMC Rank", "Price EUR", "Market Cap EUR", "Name", "Balance Théorique", "Total €", "Exclude", "Include", "% Stable",
  "√ MC", "% Cible théo", "% Cible stable", "% Cible", "% Réel", "Ecart", "Actions", "Signal", "Achat", "Duplicate"
];

if (typeof PORTFOLIO_SHARED_COLUMN_WIDTHS === "undefined") {
  var PORTFOLIO_SHARED_COLUMN_WIDTHS = [87, 131, 91, 131, 168, 91, 69, 78, 74, 83, 59, 75, 75, 75, 71, 60, 76, 67, 64, 88];
}

var CRYPTO_PORTFOLIO_ROW1_WIDTH = 28;

function SETUP_CRYPTO_PORTFOLIO_V2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  _cryptoPortfolioEnsureLayout_(sh);
  REPAIR_CRYPTO_PORTFOLIO_V2_FORMULAS();
  if (!sh.getRange(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL).getValue()) {
    sh.getRange(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL).setValue("READY: check A1 to refresh");
  }
  return "OK: " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME + " ready";
}

function UPDATE_CRYPTO_PORTFOLIO_V2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME + "; run SETUP_CRYPTO_PORTFOLIO_V2 first");
  var started = Date.now();
  function mark(step, extra) {
    var msg = "RUN: " + step + " " + (Date.now() - started) + "ms" + (extra ? " " + extra : "");
    try { console.log("[CRYPTO_V2_REFRESH] " + msg); } catch (eLog) {}
  }
  try {
    mark("fetch:start");
    var snapshot = _cryptoPortfolioFetchSnapshot_();
    mark("fetch:done", "rows=" + ((snapshot.rows || []).length) + " generatedAt=" + String(snapshot.generatedAt || ""));
    _cryptoPortfolioValidateSnapshot_(snapshot);
    mark("validate:done");
    var manualRows = _cryptoPortfolioReadManualRows_(sh, snapshot.rows || []);
    mark("manualRows:done", "rows=" + manualRows.length);
    var sourceRowCount = snapshot.rows ? snapshot.rows.length : 0;
    var manualRowCount = manualRows.length;
    var sourceMatrix = _cryptoPortfolioBuildSourceRows_(snapshot.rows || [], manualRows);
    mark("sourceRows:done", "rows=" + sourceMatrix.length);
    _cryptoPortfolioEnsureRows_(sh, sourceRowCount + manualRowCount);
    mark("ensureRows:done");

    if (sourceMatrix.length) {
      mark("write:start", "rows=" + sourceMatrix.length);
      _cryptoPortfolioWriteSourceRows_(ss.getId(), sourceMatrix);
      mark("write:done");
    }
    mark("clearTail:start");
    _cryptoPortfolioClearSourceTail_(ss.getId(), sourceMatrix.length);
    mark("clearTail:done");

    _cryptoPortfolioWriteControlCells_(ss.getId(), _cryptoPortfolioCurrentRunTimestamp_(), false);
    _portfolioReapplyFilter_(sh, CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, 19, 361516782, 19, 1484, 2);
    return "OK: " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME + " refreshed";
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    try { _cryptoPortfolioWriteControlCells_(ss.getId(), "ERROR: " + msg.substring(0, 400), false); } catch (eApiStatus) {
      sh.getRange(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL).setValue("ERROR: " + msg.substring(0, 400));
      sh.getRange(CRYPTO_PORTFOLIO_CONFIG.REFRESH_CELL).setValue(false);
    }
    throw err;
  }
}

function DIAG_CRYPTO_PORTFOLIO_V2_REFRESH_STEPS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  var started = Date.now();
  var steps = [];
  function mark(name, extra) {
    var ms = Date.now() - started;
    var line = name + "=" + ms + "ms" + (extra ? " " + extra : "");
    steps.push(line);
    try { sh.getRange(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL).setValue("DIAG: " + line); } catch (eCell) {}
    try { console.log("[CRYPTO_V2_DIAG] " + line); } catch (eLog) {}
  }
  mark("start");
  var snapshot = _cryptoPortfolioFetchSnapshot_();
  mark("fetch", "rows=" + ((snapshot.rows || []).length));
  _cryptoPortfolioValidateSnapshot_(snapshot);
  mark("validate");
  var manualRows = _cryptoPortfolioReadManualRows_(sh, snapshot.rows || []);
  mark("manualRows", "rows=" + manualRows.length);
  var sourceRows = _cryptoPortfolioBuildSourceRows_(snapshot.rows || [], manualRows);
  mark("sourceRows", "rows=" + sourceRows.length);
  var previousSourceRows = _cryptoPortfolioCountSourceRows_(sh);
  mark("previousSourceRows", "rows=" + previousSourceRows);
  var out = steps.join(" | ");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL).setValue("DIAG OK: " + out.substring(0, 350));
  return out;
}

function _cryptoPortfolioEnsureRows_(sh, rowCount) {
  var needed = CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + rowCount - 1;
  if (needed > CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS) {
    throw new Error("Crypto portfolio row count exceeds fixed limit " + CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS + ": " + needed);
  }
  if (sh.getMaxRows() < CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS) {
    sh.insertRowsAfter(sh.getMaxRows(), CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS - sh.getMaxRows());
  }
}

function _cryptoPortfolioEnsureLayout_(sh) {
  var neededColumns = Math.max(CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, CRYPTO_PORTFOLIO_ROW1_WIDTH);
  if (sh.getMaxColumns() < neededColumns) {
    sh.insertColumnsAfter(sh.getMaxColumns(), neededColumns - sh.getMaxColumns());
  }
  sh.setFrozenRows(2);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW), CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN).clearDataValidations();
  sh.getRange(1, 1, 1, CRYPTO_PORTFOLIO_ROW1_WIDTH).setValues([_cryptoPortfolioBuildRow1_(_cryptoPortfolioReadRow1_(sh))]);
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.REFRESH_CELL).insertCheckboxes().setValue(false);
  sh.getRange(2, 1, 1, CRYPTO_PORTFOLIO_HEADERS.length).setValues([CRYPTO_PORTFOLIO_HEADERS]);
}

function _cryptoPortfolioReadRow1_(sh) {
  try { return sh.getRange(1, 1, 1, CRYPTO_PORTFOLIO_ROW1_WIDTH).getValues()[0] || []; } catch (e) { return []; }
}

function _cryptoPortfolioBuildRow1_(existingRow1) {
  var j1 = "=IFERROR(INDEX(FILTER(B3:B6012;A3:A6012<>\"\";B3:B6012<5002;H3:H6012=0;T3:T6012<>\"X\";(SCAN(0;(A3:A6012<>\"\")*(B3:B6012<5002)*(H3:H6012=0)*(T3:T6012<>\"X\")*(I3:I6012=0);LAMBDA(acc;v;acc+v))+SUMPRODUCT((A3:A6012<>\"\")*(H3:H6012=0)*(T3:T6012<>\"X\")*(I3:I6012>0)*(J3:J6012=0)))>=F1);1);5000)";
  return [
    false,
    "",
    "Bornes :",
    "=MAX(IF(U1=TRUE;HLOOKUP(max(Strat!$2:$2)-1;Strat!$2:$35;34);HLOOKUP(max(Strat!$2:$2);Strat!$2:$35;34))/10;10)",
    "=SUMPRODUCT(D3:D;(H3:H=0)*1;(T3:T<>\"X\")*1;(I3:I>0)*1)+SUMPRODUCT(D3:D;(H3:H=0)*1;(T3:T<>\"X\")*1;(B3:B<=J1)*1)",
    "=IF(U1=TRUE;HLOOKUP(max(Strat!$2:$2)-1;Strat!$2:$32;31);HLOOKUP(max(Strat!$2:$2);Strat!$2:$32;31))",
    "=IFERROR(D1/H1;0)",
    "=SUMPRODUCT(G3:G)",
    "=ROUNDUP(SUMPRODUCT((L3:L>0)*1)-W1-Y1)",
    j1,
    "=SUMPRODUCT(K3:K;(H3:H=0)*1;(T3:T<>\"X\")*1;(B3:B<=J1)*1)",
    "=SUMPRODUCT(L3:L)",
    "=SUMPRODUCT(M3:M)",
    "",
    "=SUMPRODUCT(O3:O)/100",
    "=IFERROR(IF(AND(XLOOKUP(\"V\";R:R;P:P)*2>$D$1;XLOOKUP(\"X\";R:R;P:P)*2<-$D$1;OR(ABS(XLOOKUP(\"V\";R:R;P:P))>$D$1;ABS(XLOOKUP(\"X\";R:R;P:P))>$D$1));1;0);0)",
    "=IFERROR(XLOOKUP(\"V\";R:R;A:A);\"\")",
    ">",
    "=IFERROR(XLOOKUP(\"X\";R:R;A:A);\"\")",
    "Sécurisation :",
    "=Strat!BW1",
    "=IFERROR(XLOOKUP(J1;B3:B;K3:K)/AA1;0)",
    "=SUMPRODUCT((B3:B>J1)*1;(B3:B<=(Z1+J1))*1)",
    "=J1+W1",
    "=SUMPRODUCT((H3:H=0)*1;(B3:B>X1)*1;(L3:L>=G1/2)*1;(I3:I=0)*1)",
    "=IFERROR(V1/(G1/2);0)",
    "=(SUMPRODUCT((H3:H=0)*1;(T3:T<>\"X\")*1;(B3:B<=J1)*1;K3:K)+SUMPRODUCT((H3:H=0)*1;(T3:T<>\"X\")*1;(B3:B>J1)*1;(I3:I=1)*1;K3:K))",
    ""
  ];
}

function CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH() {
  try { HttpCallCounter.setTrigger('CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH'); } catch(e){}
  return UPDATE_CRYPTO_PORTFOLIO_V2();
}

function INSTALL_CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (eFn) {}
    if (fn === "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH").timeBased().everyHours(1).create();
  return "OK: CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH hourly trigger installed";
}

function REPAIR_CRYPTO_PORTFOLIO_V2_FORMATS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (sh.getMaxRows() < CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS) {
    sh.insertRowsAfter(sh.getMaxRows(), CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS - sh.getMaxRows());
  }
  var dataRows = Math.max(1, CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS - CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1);
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 1, dataRows, 1).setNumberFormat("@").setHorizontalAlignment("left");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 2, dataRows, 1).setNumberFormat("0").setHorizontalAlignment("center");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 3, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 4, dataRows, 1).setNumberFormat("#,##0 \"€\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 5, dataRows, 1).setNumberFormat("@").setHorizontalAlignment("left");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 6, dataRows, 1).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 7, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 8, dataRows, 2).setNumberFormat("0").setHorizontalAlignment("center");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 10, dataRows, 1).setNumberFormat("0.00\"%\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 11, dataRows, 1).setNumberFormat("0.00").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 12, dataRows, 4).setNumberFormat("0.00\"%\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 16, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 17, dataRows, 1).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
  sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 18, dataRows, 3).setNumberFormat("@").setHorizontalAlignment("center");
  sh.getRange(2, 1, 1, CRYPTO_PORTFOLIO_HEADERS.length)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#111827");
  for (var c = 0; c < CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN; c++) {
    sh.setColumnWidth(c + 1, PORTFOLIO_SHARED_COLUMN_WIDTHS[c]);
  }
  return "OK: Portefeuille Crypto formats repaired to row " + CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS;
}

function _cryptoPortfolioFetchSnapshot_() {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty("WCORE_WEB_API_URL");
  var token = props.getProperty("GSHEET_API_TOKEN");
  if (!baseUrl) throw new Error("Missing ScriptProperty WCORE_WEB_API_URL");
  if (!token) throw new Error("Missing ScriptProperty GSHEET_API_TOKEN");
  var result = _cryptoPortfolioFetchWithRetry_(function () {
    var fetchResult = UrlFetchApp.fetch(baseUrl.replace(/\/$/, "") + CRYPTO_PORTFOLIO_CONFIG.ENDPOINT + "?fresh=true", {
      method: "get",
      muteHttpExceptions: true,
      headers: { "x-gsheet-token": token, accept: "application/json" }
    });
    if (!fetchResult) throw new Error("BLOCKED:QUOTA");
    if (typeof fetchResult.getResponseCode !== "function") {
      throw new Error("WCORE crypto portfolio HTTP blocked or empty response");
    }
    var code = fetchResult.getResponseCode();
    var text = fetchResult.getContentText();
    if (code !== 200) return { code: code, text: text };
    if (!text || !String(text).trim()) {
      throw new Error("WCORE crypto portfolio incomplete JSON response: empty body");
    }
    try {
      return { code: code, snapshot: JSON.parse(text) };
    } catch (eParse) {
      throw new Error("WCORE crypto portfolio incomplete JSON response: bodyLength=" + String(text).length + "; " + String(eParse && eParse.message ? eParse.message : eParse));
    }
  });
  if (result.code !== 200) throw new Error("WCORE crypto portfolio HTTP " + result.code + ": " + String(result.text || "").substring(0, 300));
  return result.snapshot;
}

function _cryptoPortfolioFormatTimestamp_(value) {
  var ms = Date.parse(String(value || ""));
  if (!isFinite(ms)) return String(value || "");
  if (typeof Format !== "undefined" && Format && typeof Format.datetime === "function") {
    return Format.datetime(ms);
  }
  var d = new Date(ms);
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}

function _cryptoPortfolioCurrentRunTimestamp_() {
  if (typeof Format !== "undefined" && Format && typeof Format.datetime === "function") {
    return Format.datetime(Date.now());
  }
  return _cryptoPortfolioFormatTimestamp_(new Date().toISOString());
}

function _cryptoPortfolioValidateSnapshot_(snapshot) {
  if (!snapshot || snapshot.ok !== true) throw new Error("Invalid crypto portfolio snapshot: ok");
  if (!snapshot.generatedAt) throw new Error("Invalid crypto portfolio snapshot: metadata");
  if (!Array.isArray(snapshot.rows)) throw new Error("Invalid crypto portfolio snapshot: rows");
  for (var i = 0; i < snapshot.rows.length; i++) {
    var r = snapshot.rows[i];
    var key = String(r.canonicalSymbol || "").trim().toUpperCase();
    if (!key) throw new Error("Invalid crypto portfolio row " + (i + 1) + ": symbol");
    if (!isFinite(Number(r.priceEur)) || Number(r.priceEur) <= 0) throw new Error("Invalid priceEur for " + key);
    if (!isFinite(Number(r.marketCapEur)) || Number(r.marketCapEur) < 0) throw new Error("Invalid marketCapEur for " + key);
    if (!isFinite(Number(r.rank)) || Number(r.rank) <= 0) throw new Error("Invalid rank for " + key);
  }
}

function _cryptoPortfolioReadManualRows_(sh, snapshotRows) {
  var rows = [];
  var apiSymbols = {};
  for (var i = 0; i < (snapshotRows || []).length; i++) {
    var apiSymbol = String(snapshotRows[i].canonicalSymbol || snapshotRows[i].symbol || "").trim().toUpperCase();
    if (apiSymbol) apiSymbols[apiSymbol] = true;
  }
  var ss = null;
  try { ss = sh.getParent(); } catch (eParent) {}
  var details = ss ? ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.DETAILS_SHEET_NAME) : null;
  if (!details) return rows;
  var last = details.getLastRow();
  if (last < CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW) return rows;
  var values = details.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 2, last - CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1, 3).getValues();
  var seen = {};
  for (var j = 0; j < values.length; j++) {
    var forceOffUniverse = String(values[j][0] || "").trim().toUpperCase() === "X";
    var symbol = String(values[j][1] || "").trim().toUpperCase();
    if (!symbol || (!forceOffUniverse && apiSymbols[symbol]) || seen[symbol]) continue;
    var rawPrice = values[j][2];
    var priceEur = rawPrice !== "" && rawPrice !== null && rawPrice !== undefined && isFinite(Number(rawPrice)) ? Number(rawPrice) : 0;
    seen[symbol] = true;
    rows.push({
      symbol: symbol,
      rank: CRYPTO_PORTFOLIO_CONFIG.OFF_UNIVERSE_RANK,
      priceEur: priceEur,
      marketCapEur: 0,
      name: symbol
    });
  }
  rows.sort(function(a, b) { return a.symbol < b.symbol ? -1 : (a.symbol > b.symbol ? 1 : 0); });
  return rows;
}

function _cryptoPortfolioBuildMatrix_(snapshot, manualRows) {
  var rows = [];
  var dataRows = snapshot.rows || [];
  for (var i = 0; i < dataRows.length; i++) {
    rows.push(_cryptoPortfolioDataRow_(dataRows[i], CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + rows.length));
  }
  for (var j = 0; j < manualRows.length; j++) {
    rows.push(_cryptoPortfolioManualRow_(manualRows[j], CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + rows.length));
  }
  return rows;
}

function _cryptoPortfolioBuildSourceMatrix_(matrix) {
  var out = [];
  for (var i = 0; i < matrix.length; i++) out.push(matrix[i].slice(0, 5));
  return out;
}

function _cryptoPortfolioBuildSourceRows_(snapshotRows, manualRows) {
  var out = [];
  for (var i = 0; i < (snapshotRows || []).length; i++) {
    var r = snapshotRows[i];
    var symbol = String(r.canonicalSymbol || "").trim().toUpperCase();
    if (!symbol) continue;
    out.push([
      symbol,
      Number(r.rank),
      Number(r.priceEur),
      Number(r.marketCapEur),
      r.name || symbol
    ]);
  }
  for (var j = 0; j < (manualRows || []).length; j++) {
    var m = manualRows[j];
    var sheetRow = CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + out.length;
    out.push([
      String(m.symbol || "").trim().toUpperCase(),
      Number(m.rank),
      _cryptoPortfolioManualPriceFormula_(sheetRow),
      Number(m.marketCapEur),
      m.name || String(m.symbol || "").trim().toUpperCase()
    ]);
  }
  return out;
}

function _cryptoPortfolioCountSourceRows_(sh) {
  var maxRows = Math.min(sh.getMaxRows(), CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS);
  var rowCount = maxRows - CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1;
  if (rowCount <= 0) return 0;
  var values = sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 1, rowCount, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || "").trim()) return i + 1;
  }
  return 0;
}

function _cryptoPortfolioSheetRange_(a1) {
  return "'" + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME.replace(/'/g, "''") + "'!" + a1;
}

function _cryptoPortfolioWriteSourceRows_(spreadsheetId, sourceMatrix) {
  if (!sourceMatrix || !sourceMatrix.length) return;
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Crypto V2 source write");
  }
  var endRow = CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + sourceMatrix.length - 1;
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "USER_ENTERED",
    data: [{
      range: _cryptoPortfolioSheetRange_("A" + CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + ":E" + endRow),
      values: sourceMatrix
    }]
  }, spreadsheetId);
}

function _cryptoPortfolioClearSourceTail_(spreadsheetId, sourceRowCount) {
  var clearStart = CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + Number(sourceRowCount || 0);
  if (clearStart > CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS) return;
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Crypto V2 source clear");
  }
  Sheets.Spreadsheets.Values.clear({}, spreadsheetId, _cryptoPortfolioSheetRange_("A" + clearStart + ":E" + CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS));
}

function _cryptoPortfolioWriteControlCells_(spreadsheetId, statusValue, refreshValue) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Crypto V2 controls");
  }
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "RAW",
    data: [
      { range: _cryptoPortfolioSheetRange_(CRYPTO_PORTFOLIO_CONFIG.STATUS_CELL), values: [[statusValue]] },
      { range: _cryptoPortfolioSheetRange_(CRYPTO_PORTFOLIO_CONFIG.REFRESH_CELL), values: [[refreshValue]] }
    ]
  }, spreadsheetId);
}

function _cryptoPortfolioBuildFormulaMatrix_(matrix) {
  var out = [];
  for (var i = 0; i < matrix.length; i++) out.push(matrix[i].slice(5, CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN));
  return out;
}

function _cryptoPortfolioBuildFormulaMatrixForRows_(rowCount) {
  var out = [];
  for (var i = 0; i < rowCount; i++) {
    var row = _cryptoPortfolioEmptyRow_();
    _cryptoPortfolioApplyFormulasToRow_(row, CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + i);
    out.push(row.slice(5, CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN));
  }
  return out;
}

function REPAIR_CRYPTO_PORTFOLIO_V2_FORMULAS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME);
  var last = sh.getLastRow();
  if (last < CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW) return "OK: no source rows";
  var rowCount = last - CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1;
  var formulas = _cryptoPortfolioBuildFormulaMatrixForRows_(rowCount);
  if (formulas.length) {
    sh.getRange(CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 6, formulas.length, CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN - 5).setValues(formulas);
  }
  return "OK: repaired " + CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME + " formulas F:T rows=" + rowCount;
}

function _cryptoPortfolioDataRow_(r, sheetRow) {
  var row = _cryptoPortfolioEmptyRow_();
  row[0] = String(r.canonicalSymbol || "").trim().toUpperCase();
  row[1] = Number(r.rank);
  row[2] = Number(r.priceEur);
  row[3] = Number(r.marketCapEur);
  row[4] = r.name || row[0];
  _cryptoPortfolioApplyFormulasToRow_(row, sheetRow);
  return row;
}

function _cryptoPortfolioManualRow_(r, sheetRow) {
  var row = _cryptoPortfolioEmptyRow_();
  row[0] = String(r.symbol || "").trim().toUpperCase();
  row[1] = Number(r.rank);
  row[2] = _cryptoPortfolioManualPriceFormula_(sheetRow);
  row[3] = Number(r.marketCapEur);
  row[4] = r.name || row[0];
  _cryptoPortfolioApplyFormulasToRow_(row, sheetRow);
  return row;
}

function _cryptoPortfolioManualPriceFormula_(sheetRow) {
  var detailsSheetName = CRYPTO_PORTFOLIO_CONFIG.DETAILS_SHEET_NAME;
  return "=IFERROR(N(INDEX(FILTER('" + detailsSheetName + "'!D:D;UPPER('" + detailsSheetName + "'!C:C)=A" + sheetRow + ";'" + detailsSheetName + "'!A:A=5002);1));0)";
}

function _cryptoPortfolioApplyFormulasToRow_(row, sheetRow) {
  var detailsSheetName = CRYPTO_PORTFOLIO_CONFIG.DETAILS_SHEET_NAME;
  row[5] = "=IF(T" + sheetRow + "=\"X\";0;IFERROR(N" + sheetRow + "/100*$H$1/C" + sheetRow + ";0))";
  row[6] = "=IF(T" + sheetRow + "=\"X\";0;IFERROR(SUMIFS('" + detailsSheetName + "'!K:K;'" + detailsSheetName + "'!C:C;A" + sheetRow + ";'" + detailsSheetName + "'!A:A;B" + sheetRow + ")*C" + sheetRow + ";0))";
  row[7] = "=SUMPRODUCT((Rebalancing!A$7:A=A" + sheetRow + ")*1)";
  row[8] = "=IF(H" + sheetRow + "<>0;0;SUMPRODUCT((Rebalancing!B$7:B=A" + sheetRow + ")*1))";
  row[9] = "=IF(T" + sheetRow + "=\"X\";0;IFERROR(IF(AND(I" + sheetRow + "=1;IFERROR(VLOOKUP(A" + sheetRow + ";Rebalancing!B$7:C;2;FALSE);\"\")=\"X\");IF($U$1=\"X\";HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$33;32);HLOOKUP(MAX(Strat!$2:$2);Strat!$2:$33;32))+IF(AND(A" + sheetRow + "=\"EURC\";$U$1=\"X\");HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$44;43);0);0);0))";
  row[10] = "=SQRT(100*D" + sheetRow + "/$E$1)";
  row[11] = "=IF(OR(H" + sheetRow + "<>0;T" + sheetRow + "=\"X\");0;IF(M" + sheetRow + ">0;M" + sheetRow + ";IF(AND(B" + sheetRow + ">$X$1;G" + sheetRow + ">=$D$1/2);$G$1*100;IF(B" + sheetRow + "<=$J$1;100*K" + sheetRow + "/$K$1;IF(B" + sheetRow + "<=$J$1+$W$1;MAX(100*K" + sheetRow + "/$K$1*1/$W$1*($W$1+$J$1-B" + sheetRow + ");$G$1*100);0)))))";
  row[12] = "=IF(T" + sheetRow + "=\"X\";0;IFERROR(IF(VLOOKUP(A" + sheetRow + ";Rebalancing!B$7:C;2;FALSE)=\"X\";J" + sheetRow + ";0);0))";
  row[13] = "=L" + sheetRow + "/$L$1*100";
  row[14] = "=G" + sheetRow + "/$H$1*100";
  row[15] = "=G" + sheetRow + "-F" + sheetRow + "*C" + sheetRow;
  row[16] = "=IFERROR(P" + sheetRow + "/C" + sheetRow + ";0)";
  row[17] = "=IF(P" + sheetRow + "=MAXIFS($P$3:P;$S$3:S;\"X\");\"V\";IF(P" + sheetRow + "=MINIFS($P$3:P;$S$3:S;\"X\");\"X\";\"\"))";
  row[18] = "=IF(OR(H" + sheetRow + "<>0;T" + sheetRow + "=\"X\");\"\";IF(MAX(L" + sheetRow + ";O" + sheetRow + ")>=$G$1*100/2;\"X\";\"\"))";
  row[19] = "=IF(B" + sheetRow + "=5002;IF(COUNTIFS($A$3:A" + sheetRow + ";A" + sheetRow + ";$B$3:B" + sheetRow + ";5002)>1;\"X\";\"\");IF(COUNTIF($A$3:A" + sheetRow + ";A" + sheetRow + ")>1;\"X\";\"\"))";
}

function _cryptoPortfolioEmptyRow_() {
  return Array(CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN).fill("");
}
