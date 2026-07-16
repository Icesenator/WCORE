// v4.15.167 - Remove _WCORE_ORIG_FETCH bypass; use patched UrlFetchApp.fetch (respects quota breaker).
// v4.15.164 - Fix chart row count (A non-empty + S=X) + BW1 onEdit syncs both portfolios.
// v4.15.163 - Switch BW1 checkbox master + U1=TRUE in formulas (chart height fix: 24px/row + 100px pad + offsetX).
// v4.15.162 - Auto-resize chart height after filter reapply based on visible rows (S=X count).
// v4.15.161 - Reapply auto-filter on column S (Achat) after each hourly refresh.
// v4.15.160 - Retry transient WCORE API network failures (e.g. "Address unavailable") before erroring.
// v4.15.159 - Repair Action formats with filters suspended so hidden rows are formatted too.

var STOCK_PORTFOLIO_VERSION = "4.15.167";

// Transient network failures from UrlFetchApp.fetch (e.g. GAS "Address
// unavailable", DNS, TCP reset, micro-quota) are thrown, not returned as an
// HTTP status. Retry those a few times before surfacing an error to B1. Real
// HTTP statuses (401/500/...) are returned by fetch and handled by the caller,
// so they are NOT retried here.
var STOCK_PORTFOLIO_FETCH_MAX_ATTEMPTS = 3;
var STOCK_PORTFOLIO_FETCH_RETRY_DELAY_MS = 5000;

function _stockPortfolioFetchWithRetry_(fetchFn) {
  var lastErr = null;
  for (var attempt = 1; attempt <= STOCK_PORTFOLIO_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return fetchFn();
    } catch (e) {
      lastErr = e;
      if (attempt < STOCK_PORTFOLIO_FETCH_MAX_ATTEMPTS) {
        try {
          if (typeof Logger !== "undefined" && Logger.log) {
            Logger.log("[STOCK_PORTFOLIO] fetch attempt " + attempt + "/" + STOCK_PORTFOLIO_FETCH_MAX_ATTEMPTS + " failed: " + String(e && e.message ? e.message : e) + " — retrying in " + (STOCK_PORTFOLIO_FETCH_RETRY_DELAY_MS / 1000) + "s");
          }
        } catch (eLog) {}
        try { Utilities.sleep(STOCK_PORTFOLIO_FETCH_RETRY_DELAY_MS); } catch (eSleep) {}
      }
    }
  }
  throw lastErr;
}

var STOCK_PORTFOLIO_CONFIG = {
  SHEET_NAME: "Portefeuille Action",
  ENDPOINT: "/api/gsheet/stocks/portfolio",
  FIRST_DATA_ROW: 3,
  MANAGED_LAST_COLUMN: 19, // S
  STATUS_CELL: "B1",
  REFRESH_CELL: "A1",
  MAX_ROWS: 6000
};

var STOCK_PORTFOLIO_HEADERS = [
  "Symbol", "CMC Rank", "Price EUR", "Market Cap EUR", "Name", "Balance Théorique", "Total €", "Exclude", "Include", "% Stable",
  "√ MC", "% Cible théo", "% Cible stable", "% Cible", "% Réel", "Ecart", "Actions", "Signal", "Achat", ""
];

var PORTFOLIO_SHARED_COLUMN_WIDTHS = [87, 131, 91, 131, 168, 91, 69, 78, 74, 83, 59, 75, 75, 75, 71, 60, 76, 67, 64, 88];

var STOCK_PORTFOLIO_ROW1_WIDTH = 28;

function SETUP_STOCK_PORTFOLIO() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  _stockPortfolioEnsureLayout_(sh);
  REPAIR_STOCK_PORTFOLIO_FORMULAS();
  if (!sh.getRange(STOCK_PORTFOLIO_CONFIG.STATUS_CELL).getValue()) {
    sh.getRange(STOCK_PORTFOLIO_CONFIG.STATUS_CELL).setValue("READY: check A1 to refresh");
  }
  return "OK: " + STOCK_PORTFOLIO_CONFIG.SHEET_NAME + " ready";
}

function UPDATE_STOCK_PORTFOLIO() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + STOCK_PORTFOLIO_CONFIG.SHEET_NAME + "; run SETUP_STOCK_PORTFOLIO first");
  try {
    var snapshot = _stockPortfolioFetchSnapshot_();
    _stockPortfolioValidateSnapshot_(snapshot);
    var includeState = _stockPortfolioReadIncludeState_(sh);
    var matrix = _stockPortfolioBuildMatrix_(snapshot, includeState);
    var sourceMatrix = _stockPortfolioBuildSourceMatrix_(matrix);
    _stockPortfolioEnsureRows_(sh, matrix.length);
    if (sourceMatrix.length) _stockPortfolioWriteSourceRows_(ss.getId(), sourceMatrix);
    _stockPortfolioClearSourceTail_(ss.getId(), sourceMatrix.length);
    _stockPortfolioWriteControlCells_(ss.getId(), _stockPortfolioCurrentRunTimestamp_(), false);
    _portfolioReapplyFilter_(sh, STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, 19, 499972377, 18, 1489, 64);
    return "OK: Portefeuille Action refreshed";
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    try { _stockPortfolioWriteControlCells_(ss.getId(), "ERROR: " + msg.substring(0, 400), false); } catch (eApiStatus) {
      sh.getRange(STOCK_PORTFOLIO_CONFIG.STATUS_CELL).setValue("ERROR: " + msg.substring(0, 400));
      sh.getRange(STOCK_PORTFOLIO_CONFIG.REFRESH_CELL).setValue(false);
    }
    throw err;
  }
}

function _stockPortfolioEnsureRows_(sh, rowCount) {
  var needed = STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + rowCount - 1;
  needed = Math.max(needed, STOCK_PORTFOLIO_CONFIG.MAX_ROWS);
  if (sh.getMaxRows() < needed) sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows());
}

function _stockPortfolioSheetRange_(a1) {
  return "'" + STOCK_PORTFOLIO_CONFIG.SHEET_NAME.replace(/'/g, "''") + "'!" + a1;
}

function _stockPortfolioWriteSourceRows_(spreadsheetId, sourceMatrix) {
  if (!sourceMatrix || !sourceMatrix.length) return;
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Action source write");
  }
  var endRow = STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + sourceMatrix.length - 1;
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "USER_ENTERED",
    data: [{
      range: _stockPortfolioSheetRange_("A" + STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + ":E" + endRow),
      values: sourceMatrix
    }]
  }, spreadsheetId);
}

function _stockPortfolioClearSourceTail_(spreadsheetId, sourceRowCount) {
  var clearStart = STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + Number(sourceRowCount || 0);
  if (clearStart > STOCK_PORTFOLIO_CONFIG.MAX_ROWS) return;
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Action source clear");
  }
  Sheets.Spreadsheets.Values.clear({}, spreadsheetId, _stockPortfolioSheetRange_("A" + clearStart + ":E" + STOCK_PORTFOLIO_CONFIG.MAX_ROWS));
}

function _stockPortfolioWriteControlCells_(spreadsheetId, statusValue, refreshValue) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error("Advanced Sheets service unavailable for Action controls");
  }
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "RAW",
    data: [
      { range: _stockPortfolioSheetRange_(STOCK_PORTFOLIO_CONFIG.STATUS_CELL), values: [[statusValue]] },
      { range: _stockPortfolioSheetRange_(STOCK_PORTFOLIO_CONFIG.REFRESH_CELL), values: [[refreshValue]] }
    ]
  }, spreadsheetId);
}

function _stockPortfolioEnsureLayout_(sh) {
  var neededColumns = Math.max(STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, STOCK_PORTFOLIO_ROW1_WIDTH);
  if (sh.getMaxColumns() < neededColumns) {
    sh.insertColumnsAfter(sh.getMaxColumns(), neededColumns - sh.getMaxColumns());
  }
  sh.setFrozenRows(2);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW), STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN).clearDataValidations();
  sh.getRange(1, 1, 1, STOCK_PORTFOLIO_ROW1_WIDTH).setValues([_stockPortfolioBuildRow1_(_stockPortfolioReadRow1_(sh))]);
  sh.getRange(STOCK_PORTFOLIO_CONFIG.REFRESH_CELL).insertCheckboxes().setValue(false);
  sh.getRange(2, 1, 1, STOCK_PORTFOLIO_HEADERS.length).setValues([STOCK_PORTFOLIO_HEADERS]);
}

function _stockPortfolioReadRow1_(sh) {
  try { return sh.getRange(1, 1, 1, STOCK_PORTFOLIO_ROW1_WIDTH).getValues()[0] || []; } catch (e) { return []; }
}

function _stockPortfolioBuildRow1_(existingRow1) {
  var j1 = "=IFERROR(INDEX(FILTER(B3:B6000;A3:A6000<>\"\";B3:B6000>0;H3:H6000=0;(SCAN(0;(A3:A6000<>\"\")*(B3:B6000>0)*(H3:H6000=0)*(I3:I6000=0);LAMBDA(acc;v;acc+v))+SUMPRODUCT((A3:A6000<>\"\")*(H3:H6000=0)*(I3:I6000>0)*(J3:J6000=0)))>=F1);1);300)";
  return [
    false,
    "",
    "Bornes :",
    "=MAX(IF(U1=TRUE;HLOOKUP(max(Strat!$2:$2)-1;Strat!$2:$82;81);HLOOKUP(max(Strat!$2:$2);Strat!$2:$82;81))/10;10)",
    "=SUMPRODUCT(D3:D;(H3:H=0)*1;(I3:I>0)*1)+SUMPRODUCT(D3:D;(H3:H=0)*1;(B3:B<=J1)*1)",
    "=IF(U1=TRUE;HLOOKUP(max(Strat!$2:$2)-1;Strat!$2:$79;78);HLOOKUP(max(Strat!$2:$2);Strat!$2:$79;78))",
    "=IFERROR(D1/H1;0)",
    "=SUMPRODUCT(G3:G)",
    "=ROUNDUP(SUMPRODUCT((L3:L>0)*1)-W1-Y1)",
    j1,
    "=SUMPRODUCT(K3:K;(H3:H=0)*1;(B3:B<=J1)*1)",
    "=sumproduct(L3:L)",
    "=sum(M3:M)",
    "",
    "=sum(O3:O)/100",
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
    "=(SUMPRODUCT((H3:H=0)*1;(B3:B<=J1)*1;K3:K)+SUMPRODUCT((H3:H=0)*1;(B3:B>J1)*1;(I3:I=1)*1;K3:K))",
    ""
  ];
}

function STOCK_PORTFOLIO_HOURLY_REFRESH() {
  try { HttpCallCounter.setTrigger('STOCK_PORTFOLIO_HOURLY_REFRESH'); } catch(e){}
  return UPDATE_STOCK_PORTFOLIO();
}

function INSTALL_STOCK_PORTFOLIO_HOURLY_REFRESH() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (eFn) {}
    if (fn === "STOCK_PORTFOLIO_HOURLY_REFRESH") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("STOCK_PORTFOLIO_HOURLY_REFRESH").timeBased().everyHours(1).create();
  return "OK: STOCK_PORTFOLIO_HOURLY_REFRESH hourly trigger installed";
}

function _portfolioReapplyFilter_(sh, managedLastCol, filterColPos, chartId, chartCol, chartWidth, chartOffsetX) {
  var filter = null;
  try { filter = sh.getFilter(); } catch (e) { filter = null; }
  if (filter) {
    try { filter.remove(); } catch (eRemove) {}
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 3) lastRow = 3;
  try {
    var range = sh.getRange(2, 1, lastRow - 1, managedLastCol);
    var newFilter = range.createFilter();
    var emptyCriteria = SpreadsheetApp.newFilterCriteria().setHiddenValues([""]).build();
    newFilter.setColumnFilterCriteria(filterColPos, emptyCriteria);
  } catch (eCreate) {}

  if (!chartId) return;

  try {
    var aValsCol = sh.getRange(3, 1, lastRow - 2, 1).getValues();
    var sVals = sh.getRange(3, filterColPos, lastRow - 2, 1).getValues();
    var visibleRows = 0;
    for (var vr = 0; vr < sVals.length; vr++) {
      var aCell = String(aValsCol[vr] && aValsCol[vr][0] || "").trim();
      if (aCell !== "" && String(sVals[vr][0] || "").trim() === "X") visibleRows++;
    }
    if (visibleRows < 1) visibleRows = 1;
    var rowPx = 21;
    var padPx = 0;
    var newHeight = Math.max(150, visibleRows * rowPx + padPx);

    var payload = JSON.stringify({
      requests: [{
        updateEmbeddedObjectPosition: {
          objectId: chartId,
          newPosition: { overlayPosition: { anchorCell: { sheetId: sh.getSheetId(), rowIndex: 2, columnIndex: chartCol }, offsetXPixels: chartOffsetX || 0, widthPixels: chartWidth, heightPixels: newHeight } },
          fields: "*"
        }
      }]
    });
    try {
      var rawResp = UrlFetchApp.fetch("https://sheets.googleapis.com/v4/spreadsheets/" + BITPANDA_SYNC_CONFIG.SPREADSHEET_ID + ":batchUpdate", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        payload: payload,
        muteHttpExceptions: true
      });
      try { console.log("[PORTFOLIO] chart " + chartId + " resize HTTP " + (rawResp ? rawResp.getResponseCode() : "null") + " height=" + newHeight + " visibleRows=" + visibleRows); } catch (eLog) {}
    } catch (eFetch) {
      try { console.log("[PORTFOLIO] chart " + chartId + " fetch FAILED: " + (eFetch && eFetch.message || eFetch)); } catch (eLog) {}
    }
  } catch (eChart) {
    try { console.log("[PORTFOLIO] chart " + chartId + " resize FAILED: " + (eChart && eChart.message || eChart)); } catch (eLog) {}
  }
}

function DIAG_PORTFOLIO_CHART_RESIZE() {
  _portfolioSyncBothViews_();
  return "OK: filter+chart sync triggered. Check console logs.";
}

/**
 * Synchronise les filtres et graphiques des deux portfolios.
 * Appele depuis onEdit (Strat!BW1). Lightweight: pas de refresh HTTP.
 */
function _portfolioSyncBothViews_() {
  var ss = _wcoreGetSpreadsheet_();
  if (!ss) return;
  var shStock = ss.getSheetByName("Portefeuille Action");
  if (shStock) _portfolioReapplyFilter_(shStock, STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, 19, 499972377, 18, 1489, 64);
  var shCrypto = ss.getSheetByName("Portefeuille Crypto");
  if (shCrypto) _portfolioReapplyFilter_(shCrypto, 20, 19, 361516782, 19, 1484, 2);
}

function _stockPortfolioWithFilterSuspended_(sh, fn) {
  var saved = null;
  var filter = null;
  try { filter = sh.getFilter && sh.getFilter(); } catch (eGetFilter) { filter = null; }
  if (filter) {
    var range = filter.getRange();
    saved = {
      row: range.getRow(),
      column: range.getColumn(),
      numRows: range.getNumRows(),
      numColumns: range.getNumColumns(),
      criteria: []
    };
    for (var c = 1; c <= saved.numColumns; c++) {
      try { saved.criteria[c] = filter.getColumnFilterCriteria(c); } catch (eCriteria) { saved.criteria[c] = null; }
    }
    filter.remove();
  }
  try {
    return fn();
  } finally {
    if (saved) {
      var range = sh.getRange(saved.row, saved.column, saved.numRows, saved.numColumns);
      var restored = range.createFilter();
      for (var rc = 1; rc <= saved.numColumns; rc++) {
        if (saved.criteria[rc]) restored.setColumnFilterCriteria(rc, saved.criteria[rc]);
      }
    }
  }
}

function _stockPortfolioExtendConditionalFormats_(sh, lastRow) {
  var rules = sh.getConditionalFormatRules();
  var changed = false;
  for (var i = 0; i < rules.length; i++) {
    var ranges = rules[i].getRanges();
    var nextRanges = [];
    var ruleChanged = false;
    for (var r = 0; r < ranges.length; r++) {
      var rg = ranges[r];
      var next = rg;
      try {
        if (rg.getSheet().getSheetId() === sh.getSheetId() && rg.getLastRow() < lastRow && rg.getLastRow() >= 1000) {
          next = sh.getRange(rg.getRow(), rg.getColumn(), lastRow - rg.getRow() + 1, rg.getNumColumns());
          ruleChanged = true;
        }
      } catch (eRange) {}
      nextRanges.push(next);
    }
    if (ruleChanged) {
      rules[i] = rules[i].copy().setRanges(nextRanges).build();
      changed = true;
    }
  }
  if (changed) sh.setConditionalFormatRules(rules);
}

function REPAIR_STOCK_PORTFOLIO_FORMATS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  var lastRow = Math.max(sh.getMaxRows(), 6000);
  if (sh.getMaxRows() < lastRow) sh.insertRowsAfter(sh.getMaxRows(), lastRow - sh.getMaxRows());
  var dataRows = Math.max(1, lastRow - STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1);
  _stockPortfolioWithFilterSuspended_(sh, function () {
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 1, dataRows, 1).setNumberFormat("@").setHorizontalAlignment("left");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 2, dataRows, 1).setNumberFormat("0").setHorizontalAlignment("center");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 3, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 4, dataRows, 1).setNumberFormat("#,##0 \"€\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 5, dataRows, 1).setNumberFormat("@").setHorizontalAlignment("left");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 6, dataRows, 1).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 7, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 8, dataRows, 2).setNumberFormat("0").setHorizontalAlignment("center");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 10, dataRows, 1).setNumberFormat("0.00\"%\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 11, dataRows, 1).setNumberFormat("0.00").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 12, dataRows, 4).setNumberFormat("0.00\"%\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 16, dataRows, 1).setNumberFormat("#,##0.00 \"€\"").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 17, dataRows, 1).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 18, dataRows, 2).setNumberFormat("@").setHorizontalAlignment("center");
    sh.getRange(2, 1, 1, STOCK_PORTFOLIO_HEADERS.length)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true)
      .setFontWeight("bold")
      .setFontColor("#ffffff")
      .setBackground("#111827");
    _stockPortfolioExtendConditionalFormats_(sh, lastRow);
  });
  for (var c = 0; c < STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN; c++) {
    sh.setColumnWidth(c + 1, PORTFOLIO_SHARED_COLUMN_WIDTHS[c]);
  }
  return "OK: Portefeuille Action formats repaired to row " + lastRow;
}

function _stockPortfolioFetchSnapshot_() {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty("WCORE_WEB_API_URL");
  var token = props.getProperty("GSHEET_API_TOKEN");
  if (!baseUrl) throw new Error("Missing ScriptProperty WCORE_WEB_API_URL");
  if (!token) throw new Error("Missing ScriptProperty GSHEET_API_TOKEN");
  var resp = _stockPortfolioFetchWithRetry_(function () {
    var fetchResult = UrlFetchApp.fetch(baseUrl.replace(/\/$/, "") + STOCK_PORTFOLIO_CONFIG.ENDPOINT + "?fresh=true", {
      method: "get",
      muteHttpExceptions: true,
      headers: { "x-gsheet-token": token, accept: "application/json" }
    });
    if (!fetchResult) throw new Error("BLOCKED:QUOTA");
    return fetchResult;
  });
  if (!resp || typeof resp.getResponseCode !== "function") {
    throw new Error("WCORE stock portfolio HTTP blocked or empty response");
  }
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) throw new Error("WCORE stock portfolio HTTP " + code + ": " + text.substring(0, 300));
  return JSON.parse(text);
}

function _stockPortfolioFormatTimestamp_(value) {
  var ms = Date.parse(String(value || ""));
  if (!isFinite(ms)) return String(value || "");
  if (typeof Format !== "undefined" && Format && typeof Format.datetime === "function") {
    return Format.datetime(ms);
  }
  var d = new Date(ms);
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}

function _stockPortfolioCurrentRunTimestamp_() {
  if (typeof Format !== "undefined" && Format && typeof Format.datetime === "function") {
    return Format.datetime(Date.now());
  }
  return _stockPortfolioFormatTimestamp_(new Date().toISOString());
}

function _stockPortfolioValidateSnapshot_(snapshot) {
  if (!snapshot || snapshot.ok !== true) throw new Error("Invalid stock portfolio snapshot: ok");
  if (!snapshot.generatedAt || !snapshot.ownerAddress) throw new Error("Invalid stock portfolio snapshot: metadata");
  if (!isFinite(Number(snapshot.dynamicLimit)) || Number(snapshot.dynamicLimit) < 300) throw new Error("Invalid stock portfolio snapshot: dynamicLimit");
  if (!Array.isArray(snapshot.rows)) throw new Error("Invalid stock portfolio snapshot: rows");
  var seen = {};
  for (var i = 0; i < snapshot.rows.length; i++) {
    var r = snapshot.rows[i];
    var key = String(r.canonicalTicker || "").trim();
    if (!key) throw new Error("Invalid stock portfolio row " + (i + 1) + ": ticker");
    if (seen[key]) throw new Error("Duplicate stock portfolio row: " + key);
    seen[key] = true;
    if (r.priceEur !== null && (!isFinite(Number(r.priceEur)) || Number(r.priceEur) <= 0)) throw new Error("Invalid priceEur for " + key);
    if (r.heldQuantity !== null && (!isFinite(Number(r.heldQuantity)) || Number(r.heldQuantity) < 0)) throw new Error("Invalid heldQuantity for " + key);
  }
}

function _stockPortfolioReadIncludeState_(sh) {
  var state = {};
  var last = sh.getLastRow();
  if (last < STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW) return state;
  // Read up to column I (9th column = Include) so the user checkbox state persists
  // across refreshes. Column index 8 = Include (A:E source, F-G computed, H Exclude, I Include).
  var values = sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 1, last - STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1, 9).getValues();
  for (var i = 0; i < values.length; i++) {
    var ticker = String(values[i][0] || "").trim();
    if (ticker) state[ticker] = values[i][8] === true;
  }
  return state;
}

function _stockPortfolioBuildMatrix_(snapshot, includeState) {
  var rows = [];
  rows.push(_stockPortfolioCashRow_());
  var rankedAliases = _stockPortfolioRankedAliasSet_(snapshot.rows || []);
  for (var i = 0; i < snapshot.rows.length; i++) {
    if (_stockPortfolioShouldSkipDuplicateAlias_(snapshot.rows[i], rankedAliases)) continue;
    rows.push(_stockPortfolioDataRow_(snapshot.rows[i], rows.length + STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, includeState));
  }
  return rows;
}

function _stockPortfolioRankedAliasSet_(snapshotRows) {
  var aliases = {};
  for (var i = 0; i < snapshotRows.length; i++) {
    var r = snapshotRows[i] || {};
    if (r.rank === null || r.rank === undefined || r.rank === "") continue;
    var ticker = String(r.canonicalTicker || "").trim().toUpperCase();
    if (ticker === "TSM") aliases["TPE:2330"] = true;
    if (ticker === "NVO") aliases["CPH:NOVO-B"] = true;
    if (ticker === "SAP") aliases["ETR:SAP"] = true;
    if (ticker === "ASML") aliases["AMS:ASML"] = true;
  }
  return aliases;
}

function _stockPortfolioShouldSkipDuplicateAlias_(row, rankedAliases) {
  if (!row || row.rank !== null && row.rank !== undefined && row.rank !== "") return false;
  var ticker = String(row.canonicalTicker || "").trim().toUpperCase();
  return !!rankedAliases[ticker];
}

function _stockPortfolioBuildSourceMatrix_(matrix) {
  var out = [];
  for (var i = 0; i < matrix.length; i++) out.push(matrix[i].slice(0, 5));
  return out;
}

function _stockPortfolioBuildFormulaMatrix_(matrix) {
  var out = [];
  for (var i = 0; i < matrix.length; i++) out.push(matrix[i].slice(5, STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN));
  return out;
}

function _stockPortfolioBuildFormulaMatrixForRows_(rowCount) {
  var out = [];
  for (var i = 0; i < rowCount; i++) {
    var row = _stockPortfolioEmptyRow_();
    if (i === 0) row[0] = "EUR";
    _stockPortfolioApplyFormulasToRow_(row, STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + i);
    out.push(row.slice(5, STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN));
  }
  return out;
}

function REPAIR_STOCK_PORTFOLIO_FORMULAS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  var last = sh.getLastRow();
  if (last < STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW) return "OK: no source rows";
  var rowCount = last - STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1;
  var formulas = _stockPortfolioBuildFormulaMatrixForRows_(rowCount);
  if (formulas.length) {
    sh.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 6, formulas.length, STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN - 5).setValues(formulas);
  }
  return "OK: repaired Portefeuille Action formulas F:S rows=" + rowCount;
}

function _stockPortfolioCashRow_() {
  var row = _stockPortfolioEmptyRow_();
  row[0] = "EUR";
  row[1] = 0;
  row[2] = 1;
  row[3] = 0;
  row[4] = "Euro cash";
  _stockPortfolioApplyFormulasToRow_(row, STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW);
  return row;
}

function _stockPortfolioDataRow_(r, sheetRow, includeState) {
  var row = _stockPortfolioEmptyRow_();
  var ticker = String(r.canonicalTicker || "");
  row[0] = ticker;
  row[1] = r.rank == null ? "" : Number(r.rank);
  row[2] = r.priceEur == null ? "" : Number(r.priceEur);
  row[3] = r.marketCapEur == null ? 0 : Number(r.marketCapEur);
  row[4] = r.company || ticker;
  _stockPortfolioApplyFormulasToRow_(row, sheetRow);
  return row;
}

function _stockPortfolioApplyFormulasToRow_(row, sheetRow) {
  var isCashRow = String(row[0] || "") === "EUR";
  row[5] = "=IFERROR(N" + sheetRow + "/100*$H$1/C" + sheetRow + ";0)";
  // Spot: WCORE priceEur is already the Bitpanda-unit price (Samsung = per SSU unit,
  // i.e. 25 ordinary shares), so the legacy x25 multiplier must NOT be reapplied.
  row[6] = isCashRow
    ? _stockPortfolioEurSpotFormula_(sheetRow)
    : "=(IFERROR(VLOOKUP(A" + sheetRow + ";'CEX - Bitpanda Stocks'!A:B;2;FALSE);IFERROR(VLOOKUP(REGEXREPLACE(A" + sheetRow + ";\"^.*:\";\"\");'CEX - Bitpanda Stocks'!A:B;2;FALSE);IFERROR(VLOOKUP(SWITCH(A" + sheetRow + ";\"GOOG\";\"GOOGL\";\"META\";\"FB\";\"NYSE:BRK.B\";\"BRKB\";\"KRX:005930\";\"SSU\";\"KRX:000660\";\"HYXS\";\"EPA:MC\";\"MC\";\"EPA:OR\";\"OR\";\"NVO\";\"NOVO\";\"CPH:NOVO-B\";\"NOVO\";\"SWX:NESN\";\"NESN\";\"SWX:RO\";\"ROG\";\"TYO:7203\";\"TM\";\"\");'CEX - Bitpanda Stocks'!A:B;2;FALSE);IFERROR(VLOOKUP(SWITCH(A" + sheetRow + ";\"KRX:005930\";\"SMSN\";\"005930\";\"SMSN\";\"\");'CEX - Bitpanda Stocks'!A:B;2;FALSE);0)))))*C" + sheetRow;
  // Exclude: mirror of Portefeuille Crypto!O on the "Stratégie Action" Exclude column.
  row[7] = "=SUMPRODUCT((Rebalancing!F$7:F=A" + sheetRow + ")*1)";
  // Include: gated by Exclude (same pattern as Portefeuille Crypto!P).
  row[8] = "=IF(H" + sheetRow + "<>0;0;SUMPRODUCT((Rebalancing!G$7:G=A" + sheetRow + ")*1))";
  row[9] = "=IFERROR(IF(AND(OR(VLOOKUP(A" + sheetRow + ";Rebalancing!G:H;2;FALSE)=\"X\";VLOOKUP(A" + sheetRow + ";Rebalancing!G:H;2;FALSE)=\"Y\");HLOOKUP(MAX(Strat!$2:$2);Strat!$2:$84;83)>0);IF($U$1=\"X\";HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$80;79);HLOOKUP(MAX(Strat!$2:$2);Strat!$2:$80;79))+IF(AND(A" + sheetRow + "=\"EUR\";$U$1=\"X\");HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$90;89);0);0);0)";
  row[10] = "=SQRT(100*D" + sheetRow + "/$E$1)";
  row[11] = "=IF(H" + sheetRow + "<>0;0;IF(M" + sheetRow + ">0;M" + sheetRow + ";IF(AND(B" + sheetRow + ">$X$1;G" + sheetRow + ">=$D$1/2);$G$1*100;IF(B" + sheetRow + "<=$J$1;100*K" + sheetRow + "/$K$1;IF(B" + sheetRow + "<=$J$1+$W$1;MAX(100*K" + sheetRow + "/$K$1*1/$W$1*($W$1+$J$1-B" + sheetRow + ");$G$1*100);0)))))";
  row[12] = "=IFERROR(IF(VLOOKUP(A" + sheetRow + ";Rebalancing!G:H;2;FALSE)=\"Y\";MAX(J" + sheetRow + ";L" + sheetRow + ");IF(VLOOKUP(A" + sheetRow + ";Rebalancing!G:H;2;FALSE)=\"X\";J" + sheetRow + ";0));0)";
  row[13] = "=L" + sheetRow + "/$L$1*100";
  row[14] = "=G" + sheetRow + "/$H$1*100";
  row[15] = "=G" + sheetRow + "-F" + sheetRow + "*C" + sheetRow;
  row[16] = "=IFERROR(P" + sheetRow + "/C" + sheetRow + ";0)";
  row[17] = "=IF(P" + sheetRow + "=MAXIFS($P$3:P;$S$3:S;\"X\");\"V\";IF(P" + sheetRow + "=MINIFS($P$3:P;$S$3:S;\"X\");\"X\";\"\"))";
  row[18] = "=IF(H" + sheetRow + "<>0;\"\";IF(MAX(L" + sheetRow + ";O" + sheetRow + ")>=$G$1*100/2;\"X\";\"\"))";
}

// Action Rebalancing!F3 equivalent for the EUR cash row: Bitpanda EUR/BCPEUR cash across the
// 4 CEX - Bitpanda sheets, minus EURC held in Portefeuille Crypto Details, minus the Budget
// reserve (U1 = securisation flag; row-1 controls are shifted right by A1/B1 refresh cells).
function _stockPortfolioEurSpotFormula_(sheetRow) {
  var priceRef = "C" + sheetRow;
  var sheets = ["CEX - Bitpanda Crypto", "CEX - Bitpanda Commodity", "CEX - Bitpanda Fiat", "CEX - Bitpanda Stocks"];
  var parts = [];
  ["BCPEUR", "EUR"].forEach(function (symbol) {
    sheets.forEach(function (sheetName) {
      var lookup = "VLOOKUP(\"" + symbol + "\";'" + sheetName + "'!A:B;2;FALSE)";
      parts.push("IF(ISNA(" + lookup + ");0;" + lookup + "*" + priceRef + ")");
    });
  });
  return "=" + parts.join("+") +
    "-SUMPRODUCT(('Portefeuille Crypto Details'!E:E=\"CEX - Bitpanda\")*1;('Portefeuille Crypto Details'!C:C=\"EURC\")*1;'Portefeuille Crypto Details'!L:L)" +
    "-IF(U1=\"X\";HLOOKUP(MAX(Budget!$1:$1)-1;Budget!$1:$133;133);HLOOKUP(MAX(Budget!$1:$1);Budget!$1:$133;133))";
}

function _stockPortfolioEmptyRow_() {
  return Array(STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN).fill("");
}

function COMPARE_STOCK_PORTFOLIO_SHADOW() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + STOCK_PORTFOLIO_CONFIG.SHEET_NAME);
  var summary = _stockPortfolioCompareLegacy_(ss, sh);
  sh.getRange("L1").setValue(summary);
  return summary;
}

function _stockPortfolioCompareLegacy_(ss, portfolioSheet) {
  var legacy = ss.getSheetByName("Action Rebalancing");
  if (!legacy) return "COMPARE: missing Action Rebalancing";
  var pLast = portfolioSheet.getLastRow();
  var lLast = legacy.getLastRow();
  if (pLast < STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW || lLast < 3) return "COMPARE: no data";
  var pValues = portfolioSheet.getRange(STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW, 1, pLast - STOCK_PORTFOLIO_CONFIG.FIRST_DATA_ROW + 1, 16).getValues();
  var lValues = legacy.getRange(3, 1, lLast - 2, 16).getValues();
  var legacyByTicker = {};
  for (var i = 0; i < lValues.length; i++) {
    var lt = String(lValues[i][0] || "").trim();
    if (lt) legacyByTicker[lt] = lValues[i];
  }
  var common = 0;
  var missingLegacy = 0;
  var priceMismatches = 0;
  var heldMismatches = 0;
  var actionMismatches = 0;
  for (var p = 0; p < pValues.length; p++) {
    var pt = String(pValues[p][0] || "").trim();
    if (!pt || pt === "EUR") continue;
    var lv = legacyByTicker[pt];
    if (!lv) { missingLegacy++; continue; }
    common++;
    if (_stockPortfolioRelDiff_(pValues[p][3], lv[3]) > 0.01) priceMismatches++;
    if (_stockPortfolioAbsDiff_(pValues[p][5], lv[5]) > 1) heldMismatches++;
    if (String(pValues[p][15] || "") !== String(lv[15] || "")) actionMismatches++;
  }
  return "COMPARE: common=" + common + " missingLegacy=" + missingLegacy + " price>1%=" + priceMismatches + " held>1EUR=" + heldMismatches + " actionDiff=" + actionMismatches;
}

function _stockPortfolioAbsDiff_(a, b) {
  var na = Number(a || 0);
  var nb = Number(b || 0);
  if (!isFinite(na) || !isFinite(nb)) return 0;
  return Math.abs(na - nb);
}

function _stockPortfolioRelDiff_(a, b) {
  var na = Number(a || 0);
  var nb = Number(b || 0);
  if (!isFinite(na) || !isFinite(nb)) return 0;
  var max = Math.max(Math.abs(na), Math.abs(nb));
  return max > 0 ? Math.abs(na - nb) / max : 0;
}
