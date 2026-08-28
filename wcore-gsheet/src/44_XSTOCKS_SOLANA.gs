// v4.16.75 - FIX: EURC net depuis Portefeuille Action G; tri TOP croissant; NOVOÔåÆNVO; headers sur une ligne.
// v4.16.73 - FEAT: ligne EURC fiat (CEX - Bitpanda Fiat) dans Action Details +
// hyperliens colonne E restaur├®s d├¿s la fin du refresh (best effort).
// v4.16.72 - FIX: Details C align├® sur les symboles canoniques de Portefeuille
// Action (alias Bitpanda mappings.ts), F garde le ticker brut source.
// v4.16.70 - FIX: lock-free Details refresh core; nested callers reuse the holder's document lock.
// v4.16.69 - FEAT: Portefeuille Action Details pipeline (Bitpanda Stocks +
// Ledger - Solana Action consolidated without merging source rows; AAPLx
// identity comes from cache metadata xstockSymbol, never derived from AAPL).
var XSTOCKS_SOLANA_EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";

function _xstocksIsInfoRow_(row) {
 return !row || row[0] === "META" || String(row[1] || "").indexOf("INFO") === 0;
}

function _xstocksMetadata_(row) {
 var meta = row && row[7];
 if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
 var underlyingSymbol = typeof meta.underlyingSymbol === "string" ? meta.underlyingSymbol.trim() : "";
 var rawBalance = meta.rawBalance;
 var multiplier = meta.multiplier;
 var receivedAdjustedBalance = meta.adjustedBalance;
 if (!underlyingSymbol || typeof rawBalance !== "number" || !Number.isFinite(rawBalance) || typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier <= 0 || typeof receivedAdjustedBalance !== "number" || !Number.isFinite(receivedAdjustedBalance)) return null;
 var adjustedBalance = rawBalance * multiplier;
 if (!Number.isFinite(adjustedBalance)) return null;
  return {
   xstockSymbol: typeof meta.xstockSymbol === "string" ? meta.xstockSymbol.trim() : "",
   underlyingSymbol: underlyingSymbol,
   rawBalance: rawBalance,
   multiplier: multiplier,
   adjustedBalance: adjustedBalance
  };
}

function _xstocksProjectCryptoRows_(rows) {
 var out = [];
 var total = 0;
 rows = Array.isArray(rows) ? rows : [];
 for (var i = 0; i < rows.length; i++) {
  var row = rows[i];
  if (!row) continue;
  var isHeader = i === 0;
  var isInfo = _xstocksIsInfoRow_(row);
  var mint = String(row[3] || "");
  if (!isHeader && !isInfo && (mint === XSTOCKS_SOLANA_EURC_MINT || _xstocksMetadata_(row))) continue;
  var copy = row.slice(0, 7);
  if (!isHeader && !isInfo) {
   copy[0] = "Ledger - Solana Crypto";
   var value = Number(copy[6]);
   if (isFinite(value)) total += value;
  }
  out.push(copy);
 }
 for (var j = 0; j < out.length; j++) {
  if (out[j] && out[j][1] === "INFO_TOTAL") out[j][6] = total;
 }
 return out;
}

function _xstocksProjectActionRows_(rows) {
  var out = [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur", "raw_balance", "multiplier"]];
  rows = Array.isArray(rows) ? rows : [];
  for (var i = 1; i < rows.length; i++) {
   var row = rows[i];
   if (!row) continue;
   var key = String(row[1] || "");
   var message = String(row[2] || "");
   if (key === "ERROR" || key === "INFO_ERROR" || key === "INFO_QUOTA" || ((key === "INFO" || key === "INFO_ROT") && /ERROR|NO_CACHE|DEGRADED|FALLBACK|UNAVAILABLE|MISSING|WAITING|STALE|BLOCKED|QUOTA/i.test(message))) {
    var diagnostic = row.slice(0, 7);
    diagnostic[0] = "Ledger - Solana Action";
    if (key === "INFO_QUOTA") {
     diagnostic[4] = "";
     diagnostic[5] = "";
    }
    diagnostic[6] = "";
    diagnostic[7] = "";
    diagnostic[8] = "";
    out.push(diagnostic);
    continue;
   }
   if (_xstocksIsInfoRow_(row)) continue;
   var mint = String(row[3] || "");
   if (mint === XSTOCKS_SOLANA_EURC_MINT) {
    var balance = Number(row[4]);
    if (!isFinite(balance)) balance = 0;
    out.push(["Ledger - Solana Action", "EURC", "EURC", mint, balance, 1, balance, balance, 1]);
    continue;
   }
   var meta = _xstocksMetadata_(row);
   if (!meta) continue;
   out.push(["Ledger - Solana Action", meta.underlyingSymbol.toUpperCase(), row[2] || meta.underlyingSymbol.toUpperCase(), mint, meta.adjustedBalance, "", "", meta.rawBalance, meta.multiplier]);
  }
  return out;
}

function _xstocksProjectActionMeta_(rows) {
 var out = [["raw_balance", "multiplier"]];
 rows = Array.isArray(rows) ? rows : [];
 for (var i = 1; i < rows.length; i++) {
  var row = rows[i];
  if (!row || _xstocksIsInfoRow_(row)) continue;
  var mint = String(row[3] || "");
  if (mint === XSTOCKS_SOLANA_EURC_MINT) {
   var balance = Number(row[4]);
   out.push([isFinite(balance) ? balance : 0, 1]);
   continue;
  }
  var meta = _xstocksMetadata_(row);
  if (meta) out.push([meta.rawBalance, meta.multiplier]);
 }
 return out;
}

function _xstocksSafeWalletArgument_(formula) {
 formula = String(formula || "");
  var match = formula.match(/^\s*=\s*(CACHED_WALLET_ASSETS_SOLANA(?:_CRYPTO|_ACTION)?|SOLANA_REFRESH_STATUS)\s*\(/i);
 if (!match) return null;
 var open = match[0].lastIndexOf("(");
 var depth = 0;
 var singleQuoted = false;
 var doubleQuoted = false;
 var firstEnd = -1;
 for (var i = open + 1; i < formula.length; i++) {
  var ch = formula.charAt(i);
  var next = formula.charAt(i + 1);
  if (singleQuoted) {
   if (ch === "'" && next === "'") {
    i++;
   } else if (ch === "'") {
    singleQuoted = false;
   }
   continue;
  }
  if (doubleQuoted) {
   if (ch === '"' && next === '"') {
    i++;
   } else if (ch === '"') {
    doubleQuoted = false;
   }
   continue;
  }
  if (ch === "'") {
   singleQuoted = true;
   continue;
  }
  if (ch === '"') {
   doubleQuoted = true;
   continue;
  }
  if (ch === "(") {
   depth++;
   continue;
  }
  if (ch === ")") {
   if (depth > 0) {
    depth--;
    continue;
   }
   if (String(formula.substring(i + 1) || "").trim()) return null;
   var end = firstEnd >= 0 ? firstEnd : i;
   var argument = formula.substring(open + 1, end).trim();
   return argument || null;
  }
  if ((ch === ";" || ch === ",") && depth === 0 && firstEnd < 0) firstEnd = i;
 }
 return null;
}

function _xstocksActionVerifFormula_(formula) {
 return String(formula || "")
   .replace(/Portefeuille Crypto Details/g, "Portefeuille Action Details")
   .replace(/Ledger - Solana Crypto/g, "Ledger - Solana Action")
   .replace(/Ledger - Solana(?! (?:Crypto|Action))/g, "Ledger - Solana Action")
   .replace(/!E:E=A\d+/g, "!E:E=\"Ledger - Solana Action\"");
}

function _xstocksRemoveStrayStatsFormulas_(sheet) {
 if (!sheet || !sheet.getDataRange) return;
 var range = sheet.getDataRange();
 if (!range || !range.getFormulas) return;
 var formulas = range.getFormulas();
 for (var row = 0; row < formulas.length; row++) {
  for (var col = 0; col < formulas[row].length; col++) {
   if (!/^=\s*SOLANA_STATS(?:_ACTION)?\s*\(/i.test(String(formulas[row][col] || ""))) continue;
   sheet.getRange(row + 1, col + 1).clearContent();
  }
 }
}

function _xstocksPrepareActionSheet_(sheet) {
 if (!sheet || typeof sheet.getRange !== "function" || typeof sheet.getMaxRows !== "function" || typeof sheet.getMaxColumns !== "function") throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: existing Action sheet is incompatible");
 var rows = sheet.getMaxRows();
 var columns = sheet.getMaxColumns();
 if (rows < 1000 && typeof sheet.insertRowsAfter !== "function") throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: existing Action sheet cannot be expanded to 1000 rows");
 if (columns < 12 && typeof sheet.insertColumnsAfter !== "function") throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: existing Action sheet cannot be expanded to 12 columns");
 var probe = sheet.getRange("A1");
 if (!probe || typeof probe.clearContent !== "function") throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: existing Action sheet cannot clear managed output");
 if (rows < 1000) sheet.insertRowsAfter(rows, 1000 - rows);
 if (columns < 12) sheet.insertColumnsAfter(columns, 12 - columns);
  var managed = ["A2:I1000", "J3:J1000", "K2:L1000"];
 for (var i = 0; i < managed.length; i++) {
  var range = sheet.getRange(managed[i]);
  if (!range || typeof range.clearContent !== "function") throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: existing Action sheet cannot clear managed output " + managed[i]);
 }
}

function SETUP_XSTOCKS_SOLANA_SHEETS() {
 var lock = LockService.getDocumentLock();
 var locked = false;
 try {
  locked = lock.tryLock(10000);
  if (!locked) throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: document lock busy");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: active spreadsheet unavailable");
  var crypto = ss.getSheetByName("Ledger - Solana Crypto") || ss.getSheetByName("Ledger - Solana");
  if (!crypto) throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: Ledger - Solana source sheet not found");
  var address = _xstocksSafeWalletArgument_(crypto.getRange("A2").getFormula()) || _xstocksSafeWalletArgument_(crypto.getRange("I1").getFormula());
  if (!address) throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: safe Solana wallet formula not found in A2 or I1");
  var verif = _xstocksActionVerifFormula_(crypto.getRange("H3").getFormula());
  if (!verif || verif.indexOf("Portefeuille Action Details") < 0) throw new Error("SETUP_XSTOCKS_SOLANA_SHEETS: compatible verification formula not found in Crypto H3");
  var action = ss.getSheetByName("Ledger - Solana Action");
  if (action) _xstocksPrepareActionSheet_(action);
  if (crypto.getName() !== "Ledger - Solana Crypto") crypto.setName("Ledger - Solana Crypto");
  crypto.getRange("A2").setFormula("=CACHED_WALLET_ASSETS_SOLANA_CRYPTO(" + address + ";J1)");
  if (!action) {
   action = crypto.copyTo(ss).setName("Ledger - Solana Action");
   _xstocksPrepareActionSheet_(action);
  }
  action.getRange("A2:I1000").clearContent();
  action.getRange("J3:J1000").clearContent();
  action.getRange("K2:L1000").clearContent();
  _xstocksRemoveStrayStatsFormulas_(action);
  action.getRange("A2").setFormula("=CACHED_WALLET_ASSETS_SOLANA_ACTION(" + address + ";'Ledger - Solana Crypto'!J1)");
  action.getRange("J2").setValue("V├®rif");
  action.getRange("J3").setFormula(verif);
  action.getRange("I1").setFormula("=SOLANA_REFRESH_STATUS_ACTION(" + address + ";'Ledger - Solana Crypto'!I1)");
  action.getRange("J1").setFormula("='Ledger - Solana Crypto'!J1");
  action.getRange("K2").setFormula("=SOLANA_STATS_ACTION(" + address + ";'Ledger - Solana Crypto'!J1)");
  action.getRange("E:G").setNumberFormat("0.########");
  action.getRange("H:I").setNumberFormat("0.########");
  return { crypto: crypto.getName(), action: action.getName() };
 } finally {
  if (locked) {
   try { lock.releaseLock(); } catch (eRelease) {}
  }
 }
}

var STOCK_PORTFOLIO_DETAILS_CONFIG = {
 SHEET_NAME: "Portefeuille Action Details",
 PORTFOLIO_SHEET_NAME: "Portefeuille Action",
 BITPANDA_SHEET_NAME: "CEX - Bitpanda Stocks",
 EURC_FIAT_SHEET_NAME: "CEX - Bitpanda Fiat",
 ACTION_LEDGER_SHEET_NAME: "Ledger - Solana Action",
 FIRST_DATA_ROW: 2,
 SOURCE_FIRST_DATA_ROW: 3,
 MANAGED_LAST_COLUMN: 12, // L
 MAX_ROWS: 1000
};

var STOCK_PORTFOLIO_DETAILS_HEADERS = ["Top", "Exe", "Symbol", "Price (Ôé¼)", "Position :", "Ticker", "Contract Adress", "Libre", "Flex", "Lock", "Total", "Valorisation"];

function _xstocksCollectSolanaActionTitles_(rows) {
 var out = new Array();
 rows = Array.isArray(rows) ? rows : [];
 for (var i = 1; i < rows.length; i++) {
  var row = rows[i];
  if (!row || _xstocksIsInfoRow_(row)) continue;
  var mint = String(row[3] || "");
  var ticker = String(row[1] || "").trim().toUpperCase();
  if (mint === XSTOCKS_SOLANA_EURC_MINT || ticker === "EURC" || ticker === "") continue;
  var meta = _xstocksMetadata_(row);
  if (!meta) continue;
  var xstockSymbol = String(meta.xstockSymbol || "").trim();
  var underlyingSymbol = String(meta.underlyingSymbol || "").trim().toUpperCase();
  var adjustedBalance = Number(meta.adjustedBalance);
  if (!underlyingSymbol || !isFinite(adjustedBalance) || adjustedBalance <= 0) continue;
  var sourceTicker = xstockSymbol || "";
  out.push(new Array(underlyingSymbol, sourceTicker, mint, adjustedBalance));
 }
 return out;
}

function _xstocksStockDetailsRow_(sheetRow, symbol, source, sourceTicker, mint, quantity) {
  var portfolioRef = "'" + STOCK_PORTFOLIO_DETAILS_CONFIG.PORTFOLIO_SHEET_NAME + "'!";
  var libre = quantity;
  var flex = 0;
  var locked = 0;
  if (source === STOCK_PORTFOLIO_DETAILS_CONFIG.BITPANDA_SHEET_NAME) {
   var bpRef = "'" + source.replace(/'/g, "''") + "'!";
   libre = "=IFERROR(SUMIFS(" + bpRef + "B:B;" + bpRef + "A:A;F" + sheetRow + ");0)";
  } else if (source === STOCK_PORTFOLIO_DETAILS_CONFIG.EURC_FIAT_SHEET_NAME) {
   // v4.16.76: formule Euro cash adaptee de Portefeuille Action vers Details.
   // Le prix C<row> de PA devient D<row> ici; U1 reste le flag PA explicite.
   var eurPrice = "D" + sheetRow;
   var eurParts = [];
   var eurSheets = ["CEX - Bitpanda Crypto", "CEX - Bitpanda Commodity", "CEX - Bitpanda Fiat", "CEX - Bitpanda Stocks"];
   var eurSymbols = ["BCPEUR", "EUR"];
   for (var es = 0; es < eurSymbols.length; es++) {
    for (var ef = 0; ef < eurSheets.length; ef++) {
     var eurLookup = "VLOOKUP(\"" + eurSymbols[es] + "\";'" + eurSheets[ef] + "'!A:B;2;FALSE)";
     eurParts.push("IF(ISNA(" + eurLookup + ");0;" + eurLookup + "*" + eurPrice + ")");
    }
   }
   libre = "=" + eurParts.join("+") +
    "-SUMPRODUCT(('Portefeuille Crypto Details'!E:E=\"CEX - Bitpanda Crypto\")*1;('Portefeuille Crypto Details'!C:C=\"EURC\")*1;'Portefeuille Crypto Details'!L:L)" +
    "-IF('Portefeuille Action'!$U$1=TRUE;HLOOKUP(MAX(Budget!$1:$1)-1;Budget!$1:$133;133);HLOOKUP(MAX(Budget!$1:$1);Budget!$1:$133;133))";
  } else if (source === STOCK_PORTFOLIO_DETAILS_CONFIG.ACTION_LEDGER_SHEET_NAME) {
   var sourceA = "INDIRECT(\"'\"&$E" + sheetRow + "&\"'!A1:A1000\")";
   var sourceC = "INDIRECT(\"'\"&$E" + sheetRow + "&\"'!C1:C1000\")";
   var sourceD = "INDIRECT(\"'\"&$E" + sheetRow + "&\"'!D1:D1000\")";
   var sourceE = "INDIRECT(\"'\"&$E" + sheetRow + "&\"'!E1:E1000\")";
   var guard = "=IF(OR($E" + sheetRow + "=\"\";$G" + sheetRow + "=\"\");\"\";IFERROR(SUMPRODUCT((" + sourceA + "=$E" + sheetRow + ")*1;(" + sourceD + "=$G" + sheetRow + ")*1;";
   libre = guard + "(IFERROR(REGEXMATCH(" + sourceC + ";\"\\[(Flex|Lock)\\]\");FALSE)=FALSE)*1;" + sourceE + ");0))";
   flex = guard + "IFERROR(REGEXMATCH(" + sourceC + ";\"\\[Flex\\]\");FALSE)*1;" + sourceE + ");0))";
   locked = guard + "IFERROR(REGEXMATCH(" + sourceC + ";\"\\[Lock\\]\");FALSE)*1;" + sourceE + ");0))";
  }
  return new Array(
   "=IFERROR(XLOOKUP(C" + sheetRow + ";" + portfolioRef + "A:A;" + portfolioRef + "B:B);\"\")",
   "",
   symbol,
   "=IFERROR(XLOOKUP(C" + sheetRow + ";" + portfolioRef + "A:A;" + portfolioRef + "C:C);\"\")",
   source,
   sourceTicker,
   mint,
   libre,
   flex,
   locked,
   "=SUM(H" + sheetRow + ":J" + sheetRow + ")",
   "=IFERROR(K" + sheetRow + "*D" + sheetRow + ";0)"
  );
}

function _xstocksBitpandaCanonicalAliases_() {
  return {
   "AMD-US": "AMD",
   "JPM-US": "JPM",
   "LLYC-US": "LLY",
   "WMT-US": "WMT",
   "BRK": "BRKB",
   "BRKB": "BRKB",
   "BRK.B": "BRKB",
   "BRK-B": "BRKB",
   "GOOGL": "GOOG",
   "FB": "META",
   "MRKUS": "MRK",
   "RDSA": "SHEL",
   "TSFA": "TPE:2330",
   "TCTZF": "TCEHY",
"NOVO": "NVO",
"NOVO-B": "NVO",
   "BROA": "AVGO",
   "TM": "TYO:7203",
   "SSU": "SMSN",
   "SMSN": "SMSN",
    "HYXS": "SKHY",
   "ADS": "ETR:ADS",
   "AIR": "EPA:AIR",
   "ALV": "ETR:ALV",
   "BAS": "ETR:BAS",
   "BAYN": "ETR:BAYN",
   "BMW": "ETR:BMW",
   "CBK": "ETR:CBK",
   "DBK": "ETR:DBK",
   "DTE": "ETR:DTE",
   "ENR": "ETR:ENR",
   "HEN3": "ETR:HEN3",
   "IFX": "ETR:IFX",
   "RHM": "ETR:RHM",
   "SAP": "ETR:SAP",
   "SIE": "ETR:SIE",
   "VOW3": "ETR:VOW3",
   "ASML": "AMS:ASML",
   "MC": "EPA:MC",
   "OR": "EPA:OR",
   "RMS": "EPA:RMS",
   "SAN": "BME:SAN",
   "TTE": "EPA:TTE",
   "IBE": "BME:IBE",
   "NESN": "SWX:NESN",
   "NOVN": "NVS",
   "ROG": "SWX:RO",
   "SHEL": "SHEL",
   "EUNL": "ETR:EUNL",
   "IS3N": "ETR:IS3N",
   "QDVE": "ETR:QDVE",
   "SXR8": "ETR:SXR8",
   "VUSA": "ETR:VUSA",
   "VWCE": "ETR:VWCE",
   "VWRL": "AMS:VWRL"
  };
}

function _xstocksResolveCanonicalSymbol_(rawTicker, portfolioSymbols) {
 var raw = String(rawTicker || "").trim().toUpperCase();
 // v4.16.74: le produit Bitpanda equity_security est suffixe "-LEG"
 // (GOOGL-LEG) et partages le meme symbole canonique que le legacy.
 if (raw.length > 4 && raw.slice(-4) === "-LEG") raw = raw.slice(0, -4);
 var aliasMap = _xstocksBitpandaCanonicalAliases_();
  var mapped = Object.prototype.hasOwnProperty.call(aliasMap, raw) ? aliasMap[raw] : "";
  if (!raw) return raw;
  if (Array.isArray(portfolioSymbols) && portfolioSymbols.length) {
   var present = {};
   for (var i = 0; i < portfolioSymbols.length; i++) {
    var entry = String(portfolioSymbols[i] || "").trim().toUpperCase();
    if (entry) present[entry] = true;
   }
   if (mapped && present[mapped]) return mapped;
   if (present[raw]) return raw;
   return mapped || raw;
  }
  return mapped || raw;
}

function _xstocksBuildActionDetailsRows_(firstDataRow, bitpandaValues, solanaTitleRows, portfolioSymbols, eurcFiatQuantity, rankBySymbol) {
 var items = new Array();
 var values = Array.isArray(bitpandaValues) ? bitpandaValues : [];
 for (var i = 0; i < values.length; i++) {
  var valueRow = values[i];
  if (!valueRow) continue;
  var symbol = String(valueRow[0] || "").trim().toUpperCase();
  if (!symbol || symbol === "." || symbol === "TOTAL" || symbol === "ERROR" || symbol.indexOf("INFO") === 0) continue;
  var quantity = Number(valueRow[1]);
  if (!isFinite(quantity) || quantity <= 0) continue;
  items.push({ symbol: _xstocksResolveCanonicalSymbol_(symbol, portfolioSymbols), source: STOCK_PORTFOLIO_DETAILS_CONFIG.BITPANDA_SHEET_NAME, ticker: symbol, mint: "", quantity: quantity, order: items.length });
 }
 var fiatQuantity = Number(eurcFiatQuantity);
 if (isFinite(fiatQuantity) && fiatQuantity > 0) {
  items.push({ symbol: "EUR", source: STOCK_PORTFOLIO_DETAILS_CONFIG.EURC_FIAT_SHEET_NAME, ticker: "EURC", mint: "", quantity: fiatQuantity, order: items.length });
 }
 var titles = Array.isArray(solanaTitleRows) ? solanaTitleRows : [];
 for (var j = 0; j < titles.length; j++) {
  var title = titles[j];
  if (!title) continue;
  items.push({ symbol: _xstocksResolveCanonicalSymbol_(String(title[0] || "").toUpperCase(), portfolioSymbols), source: STOCK_PORTFOLIO_DETAILS_CONFIG.ACTION_LEDGER_SHEET_NAME, ticker: String(title[1] || ""), mint: String(title[2] || ""), quantity: title[3], order: items.length });
 }
 var ranks = rankBySymbol && typeof rankBySymbol === "object" ? rankBySymbol : null;
 if (ranks) {
  items.sort(function (a, b) {
   var ar = Object.prototype.hasOwnProperty.call(ranks, a.symbol) ? Number(ranks[a.symbol]) : Number.POSITIVE_INFINITY;
   var br = Object.prototype.hasOwnProperty.call(ranks, b.symbol) ? Number(ranks[b.symbol]) : Number.POSITIVE_INFINITY;
   if (ar !== br) return ar - br;
   if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
   return a.order - b.order;
  });
 }
var rows = new Array();
var nextRow = Number(firstDataRow) || STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW;
 for (var k = 0; k < items.length; k++) {
  var item = items[k];
  rows.push(_xstocksStockDetailsRow_(nextRow, item.symbol, item.source, item.ticker, item.mint, item.quantity));
  nextRow++;
 }
 return rows;
}

function _stockPortfolioDetailsSheetRange_(a1) {
 return "'" + STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME.replace(/'/g, "''") + "'!" + a1;
}

function _stockPortfolioDetailsTimestamp_() {
 try {
  if (typeof Format !== "undefined" && Format && typeof Format.datetime === "function") return Format.datetime(Date.now());
 } catch (eFormat) {}
 return new Date().toISOString();
}

function _stockPortfolioDetailsEnsureLayout_(sh) {
 if (sh.getMaxColumns() < STOCK_PORTFOLIO_DETAILS_CONFIG.MANAGED_LAST_COLUMN) {
  sh.insertColumnsAfter(sh.getMaxColumns(), STOCK_PORTFOLIO_DETAILS_CONFIG.MANAGED_LAST_COLUMN - sh.getMaxColumns());
 }
 if (sh.getMaxRows() < STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS) {
  sh.insertRowsAfter(sh.getMaxRows(), STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS - sh.getMaxRows());
 }
 sh.setFrozenRows(1);
 sh.setFrozenColumns(1);
 sh.getRange(1, 1, Math.max(sh.getMaxRows(), STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW), STOCK_PORTFOLIO_DETAILS_CONFIG.MANAGED_LAST_COLUMN).clearDataValidations();
 sh.getRange(1, 1, 1, STOCK_PORTFOLIO_DETAILS_HEADERS.length)
  .setValues([STOCK_PORTFOLIO_DETAILS_HEADERS])
  .setHorizontalAlignment("center")
  .setVerticalAlignment("middle")
  .setWrap(true)
  .setFontWeight("bold")
  .setFontColor("#ffffff")
  .setBackground("#111827");
 var dataRows = Math.max(1, STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS - STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW + 1);
 sh.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW, 3, dataRows, 1).setNumberFormat("@").setHorizontalAlignment("left");
 sh.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW, 4, dataRows, 1).setNumberFormat("#,##0.00 \"Ôé¼\"").setHorizontalAlignment("right");
 sh.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW, 8, dataRows, 4).setNumberFormat("0.########").setHorizontalAlignment("right");
 sh.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW, 12, dataRows, 1).setNumberFormat("#,##0.00 \"Ôé¼\"").setHorizontalAlignment("right");
if (typeof PORTFOLIO_SHARED_COLUMN_WIDTHS !== "undefined" && PORTFOLIO_SHARED_COLUMN_WIDTHS) {
 for (var c = 0; c < STOCK_PORTFOLIO_DETAILS_CONFIG.MANAGED_LAST_COLUMN && c < PORTFOLIO_SHARED_COLUMN_WIDTHS.length; c++) {
  sh.setColumnWidth(c + 1, PORTFOLIO_SHARED_COLUMN_WIDTHS[c]);
 }
}
// v4.16.77: la ligne 1 d'en-tetes tient sur UNE seule ligne visuelle ÔÇö
// elargit toute colonne plus etroite que son libelle et desactive le wrap.
for (var hd = 0; hd < STOCK_PORTFOLIO_DETAILS_HEADERS.length && hd < sh.getMaxColumns(); hd++) {
 var headerPx = Math.round(String(STOCK_PORTFOLIO_DETAILS_HEADERS[hd] || "").length * 8 + 28);
 if (typeof sh.getColumnWidth === "function" && sh.getColumnWidth(hd + 1) < headerPx) {
  sh.setColumnWidth(hd + 1, headerPx);
 }
}
sh.getRange(1, 1, 1, STOCK_PORTFOLIO_DETAILS_HEADERS.length).setWrap(false);
try { sh.setRowHeight(1, 30); } catch (eRowH) {}
}

function SETUP_STOCK_PORTFOLIO_DETAILS() {
 var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
 var sh = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME);
 if (!sh) sh = ss.insertSheet(STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME);
 _stockPortfolioDetailsEnsureLayout_(sh);
 return "OK: " + STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME + " ready";
}

function REFRESH_STOCK_PORTFOLIO_DETAILS() {
 var lock = LockService.getDocumentLock();
 if (!lock.tryLock(1000)) return "BUSY: another portfolio refresh is running";
 try {
  return _refreshStockPortfolioDetailsCore_();
 } catch (err) {
  throw err;
 } finally {
  lock.releaseLock();
 }
}

// Lock-free core: UPDATE_STOCK_PORTFOLIO calls it while already holding the document
// lock, so it must never acquire or release the lock itself (no nested tryLock cycle).
function _refreshStockPortfolioDetailsCore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME);
  if (!sh) throw new Error("Missing sheet " + STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME + "; run SETUP_STOCK_PORTFOLIO_DETAILS first");
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
   throw new Error("Advanced Sheets service unavailable for stock details write");
  }
  var missing = [];
  var bitpandaValues = null;
  var walletRows = null;
   var bitpandaSheet = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.BITPANDA_SHEET_NAME);
   if (bitpandaSheet) {
    var availableRows = Number(bitpandaSheet.getMaxRows()) || 0;
    var dataRowCount = availableRows - STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW + 1;
    if (dataRowCount > 0) {
     bitpandaValues = bitpandaSheet.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW, 1, dataRowCount, 2).getValues();
    } else {
     bitpandaValues = [];
    }
  } else {
    missing.push(STOCK_PORTFOLIO_DETAILS_CONFIG.BITPANDA_SHEET_NAME);
   }
  var eurcFiatQuantity = null;
  try {
   var fiatSheet = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.EURC_FIAT_SHEET_NAME);
   if (fiatSheet) {
    var fiatAvailableRows = Number(fiatSheet.getMaxRows()) || 0;
    var fiatRowCount = fiatAvailableRows - STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW + 1;
    var fiatValues = fiatRowCount > 0 ? fiatSheet.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW, 1, fiatRowCount, 2).getValues() : [];
    for (var f = 0; f < fiatValues.length; f++) {
     if (String((fiatValues[f] && fiatValues[f][0]) || "").trim().toUpperCase() !== "EUR") continue;
     var fiatQuantity = Number(fiatValues[f][1]);
     if (isFinite(fiatQuantity) && fiatQuantity > 0) eurcFiatQuantity = fiatQuantity;
     break;
    }
   }
  } catch (eFiat) {
   try { Logger.log("[XSTOCKS_DETAILS] EURC fiat read failed: " + (eFiat && eFiat.message ? eFiat.message : String(eFiat))); } catch (eLogFiat) {}
  }
  var ledgerSheet = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.ACTION_LEDGER_SHEET_NAME);
  var address = null;
  if (ledgerSheet) {
   address = _xstocksSafeWalletArgument_(ledgerSheet.getRange("A2").getFormula()) || _xstocksSafeWalletArgument_(ledgerSheet.getRange("I1").getFormula());
   if (address && typeof _SOLANA !== "undefined" && _SOLANA && typeof _SOLANA.getCachedWalletAssets === "function") {
    walletRows = _SOLANA.getCachedWalletAssets(address);
   } else {
    missing.push(STOCK_PORTFOLIO_DETAILS_CONFIG.ACTION_LEDGER_SHEET_NAME + " cache");
   }
  } else {
   missing.push(STOCK_PORTFOLIO_DETAILS_CONFIG.ACTION_LEDGER_SHEET_NAME);
  }
  if (missing.length) {
   try { Logger.log("[XSTOCKS_DETAILS] missing sources: " + missing.join(", ")); } catch (eLog) {}
  }
  if (!bitpandaValues && !walletRows) {
   return "WAITING: no source available for " + STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME;
  }
var portfolioSymbols = [];
var rankBySymbol = {};
try {
 var portfolioSheet = ss.getSheetByName(STOCK_PORTFOLIO_DETAILS_CONFIG.PORTFOLIO_SHEET_NAME);
 if (portfolioSheet && typeof portfolioSheet.getMaxRows === "function" && typeof portfolioSheet.getRange === "function") {
  var portfolioLastRow = Math.min(Number(portfolioSheet.getMaxRows()) || 0, STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS);
  var portfolioRowCount = portfolioLastRow - STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW + 1;
  if (portfolioRowCount > 0) {
   // v4.16.75: colonne B lue aussi (CMC rank) pour trier Details par Top croissant.
   var portfolioValues = portfolioSheet.getRange(STOCK_PORTFOLIO_DETAILS_CONFIG.SOURCE_FIRST_DATA_ROW, 1, portfolioRowCount, 2).getValues();
   for (var p = 0; p < portfolioValues.length; p++) {
    var portfolioEntry = String(portfolioValues[p][0] || "").trim().toUpperCase();
    if (!portfolioEntry) continue;
    portfolioSymbols.push(portfolioEntry);
    var entryRank = Number(portfolioValues[p][1]);
    if (isFinite(entryRank) && entryRank >= 0 && !Object.prototype.hasOwnProperty.call(rankBySymbol, portfolioEntry)) {
     rankBySymbol[portfolioEntry] = entryRank;
    }
   }
  }
 }
} catch (ePortfolio) {}
var rows = _xstocksBuildActionDetailsRows_(STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW, bitpandaValues || [], _xstocksCollectSolanaActionTitles_(walletRows), portfolioSymbols, eurcFiatQuantity, rankBySymbol);
  _stockPortfolioDetailsEnsureLayout_(sh);
  var spreadsheetId = ss.getId();
  var batchData = [];
  if (rows.length) {
   var endRow = STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW + rows.length - 1;
   batchData.push({ range: _stockPortfolioDetailsSheetRange_("A" + STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW + ":L" + endRow), values: rows });
  }
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: "USER_ENTERED", data: batchData }, spreadsheetId);
  try {
   if (typeof _setDetailsChainHyperlinks_ === "function") {
    var linkMap = {};
    var linkSheets = typeof ss.getSheets === "function" ? ss.getSheets() : [];
    for (var l = 0; l < linkSheets.length; l++) {
     var linkSheet = linkSheets[l];
     if (!linkSheet || typeof linkSheet.getName !== "function" || typeof linkSheet.getSheetId !== "function") continue;
     linkMap[linkSheet.getName()] = linkSheet.getSheetId();
    }
    _setDetailsChainHyperlinks_(ss, linkMap);
   }
  } catch (eLinks) {
   try { Logger.log("[XSTOCKS_DETAILS] Details chain hyperlinks restore failed: " + (eLinks && eLinks.message ? eLinks.message : String(eLinks))); } catch (eLogLinks) {}
  }
  var clearStart = STOCK_PORTFOLIO_DETAILS_CONFIG.FIRST_DATA_ROW + rows.length;
  if (clearStart <= STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS) {
   Sheets.Spreadsheets.Values.clear({}, spreadsheetId, _stockPortfolioDetailsSheetRange_("A" + clearStart + ":L" + STOCK_PORTFOLIO_DETAILS_CONFIG.MAX_ROWS));
  }
  return "OK: " + STOCK_PORTFOLIO_DETAILS_CONFIG.SHEET_NAME + " refreshed" + (missing.length ? " (missing: " + missing.join(", ") + ")" : "");
}
