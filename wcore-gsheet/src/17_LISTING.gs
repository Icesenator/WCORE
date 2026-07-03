/*************************************************
 * 17_LISTING.gs - Ledger Sheet Listing
 *
 * SIMPLE & STABLE - Cache via ScriptProperties
 *
 * Version : LISTING_v4.5.18
 * v4.15.104 - PER-CELL auto-link on user edit of Portefeuille Crypto Details column E (bridges watchdog-pulse gap)
 * v4.5.18 - FEAT: link Portefeuille Crypto Details column E to matching sheets via RichTextValue
 * v4.5.17 - FIX: label Recap I1 status column and clarify B1 as pulse timestamp
 * v4.5.16 - FEAT: include Startale wallet sheets in Recap Portfolio
 * v4.5.15 - FEAT: include OKX Crypto sync tab in Recap Portfolio
 * v4.5.14 - FEAT: include Coinbase Crypto sync tab in Recap Portfolio
 * v4.5.13 - FEAT: include Bybit Crypto sync tab in Recap Portfolio
 * v4.5.12 - FEAT: include CEX sync tabs (Bitpanda/Bitfinex) in Recap Portfolio
 *   - display-only rows; watchdog skips them (see _wd_isCexSheet_ in 16_REFRESH)
 * v4.5.11 - FEAT: include Space wallet sheets (Space - TON) in Recap Chain
 * v4.5.10 - RETIRE: exclude Ledger - Redstone and Ledger - ZERO Network
 * v4.5.9 - FIX: exclude retired Ledger - Mint and clear stale Recap A:J rows
 * v4.5.8 - menu Reinstaller Quota Recovery
 * v4.5.7 - FEAT: Menu WCORE (onOpen) avec "Refresh Recap Chain"
 *   - onOpen() crée un menu custom "WCORE" dans la barre du spreadsheet
 *   - Entrée "Refresh Recap Chain" appelle REFRESH_LEDGER_CACHE() en 1 clic
 *   - Évite d'ouvrir l'éditeur Apps Script pour lancer la fonction
 * v4.5.6 - FEAT: Auto-refresh on sheet add/remove via onChange trigger
 *   - LEDGER_ON_CHANGE(e) detects INSERT_GRID / REMOVE_GRID events
 *   - INSTALL_LEDGER_ONCHANGE() to install trigger once from editor
 * v4.5.5 - FIX: Recap Chain column A hyperlinks via RichTextValue
 *   - SHEET_LINK inside ARRAYFORMULA+HYPERLINK is unreliable (Google Sheets
 *     caches @customfunction results and HYPERLINK silently ignores errors)
 *   - New approach: REFRESH_LEDGER_CACHE writes hyperlinks directly to column A
 *     using RichTextValue API (no formula dependency)
 *   - Removed ARRAYFORMULA re-set from cache rebuild (replaced by RichTextValue)
 *   - SHEET_LINK function kept for backward compatibility
 * v4.5.4 - FIX: gid === 0 treated as falsy → sheet with GID 0 never got a link
 * v4.5.3 - FIX: LIST_SHEETS_LEDGER timeout breaking Recap Chain dashboard
 *   - Custom functions no longer rebuild cache (getSheets() on 137 sheets = timeout)
 *   - Cache read only in @customfunction context; rebuild via REFRESH_LEDGER_CACHE() only
 *   - Stale cache is always returned rather than #ERROR!
 *************************************************/

var LEDGER_NAMES_KEY = "LEDGER_SHEET_NAMES";
var LEDGER_MAP_KEY = "LEDGER_SHEET_MAP";
var LEDGER_TS_KEY = "LEDGER_LAST_REFRESH";

var LEDGER_TTL_MS = 6 * 60 * 60 * 1000; // 6h
var LEDGER_RETIRED_NAMES = {
 "ledger - mint": true,
 "ledger - redstone": true,
 "ledger - zero network": true
};

function _isLedgerLike_(name) {
 var n = String(name || "").toLowerCase();
 if (LEDGER_RETIRED_NAMES[n]) return false;
 return (
 (n.indexOf("ledger") >= 0 ||
  n.indexOf("layer3") >= 0 ||
  n.indexOf("seeker") >= 0 ||
  n.indexOf("ethos") >= 0 ||
  // v4.5.18: include UniSwap + Warpcast self-custody wallets (Base/Optimism/Polygon/Arbitrum/Zora)
  n.indexOf("uniswap") >= 0 ||
  n.indexOf("warpcast") >= 0 ||
  n.indexOf("binance") >= 0 ||
  n.indexOf("smart") >= 0 ||
   n.indexOf("safepal") >= 0 ||
   n.indexOf("space") >= 0 ||
   n.indexOf("startale") >= 0 ||
   // v4.15.85: include CEX sync tabs (display-only in Recap, B1 self-managed).
   n.indexOf("bitpanda") >= 0 ||
   n.indexOf("bitfinex") >= 0 ||
     n.indexOf("bybit") >= 0 ||
     n.indexOf("coinbase") >= 0 ||
     n.indexOf("kraken") >= 0 ||
     n.indexOf("okx") >= 0)
 && n.indexOf("moonwalk") < 0
 );
}

function _filterLedgerNames_(names) {
 var out = [];
 for (var i = 0; i < (names || []).length; i++) {
  var name = String(names[i] || "");
  if (name && !LEDGER_RETIRED_NAMES[name.toLowerCase()]) out.push(name);
 }
 return out;
}

/**
 * Rebuild cache si necessaire (auto, silencieux)
 * @param {boolean} force - Force le rebuild meme si cache valide
 */
function _ensureLedgerCache_(force) {
 var props = PropertiesService.getScriptProperties();
 var last = Number(props.getProperty(LEDGER_TS_KEY)) || 0;

 if (!force && last && (Date.now() - last) < LEDGER_TTL_MS) return;

 var ss = SpreadsheetApp.getActiveSpreadsheet();
 if (!ss) return;

 var sheets = ss.getSheets();
 var names = [];
 var map = {};

 for (var i = 0; i < sheets.length; i++) {
 var sh = sheets[i];
 var name = sh.getName();
 if (_isLedgerLike_(name)) {
 names.push(name);
 map[name] = sh.getSheetId();
 }
 }

 names.sort();

 props.setProperty(LEDGER_NAMES_KEY, JSON.stringify(names));
 props.setProperty(LEDGER_MAP_KEY, JSON.stringify(map));
 props.setProperty(LEDGER_TS_KEY, String(Date.now()));

  // v4.5.5: Set hyperlinks directly in Recap Chain column A via RichTextValue
  // Replaces unreliable ARRAYFORMULA+SHEET_LINK(@customfunction) approach
  _setRecapHyperlinks_(ss, names, map);
  _setDetailsChainHyperlinks_(ss, map);
}

/**
 * Set hyperlinks in Recap Chain column A using RichTextValue
 * Called after cache rebuild — no dependency on @customfunction inside formulas
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string[]} names - Sorted array of ledger sheet names
 * @param {Object} map - name → gid mapping
 */
function _setRecapHyperlinks_(ss, names, map) {
 try {
  if (!names || !names.length) return;

   var recap = ss.getSheetByName("Recap Portfolio");
  if (!recap) return;

  var baseUrl = ss.getUrl();

  var richTexts = [];
  for (var i = 0; i < names.length; i++) {
   var name = names[i];
   var gid = map[name];
   if (gid != null) {
    richTexts.push([
     SpreadsheetApp.newRichTextValue()
      .setText(name)
      .setLinkUrl(baseUrl + "#gid=" + gid)
      .build()
    ]);
   } else {
    richTexts.push([
     SpreadsheetApp.newRichTextValue().setText(name).build()
    ]);
   }
  }

  recap.getRange("D1:G1").setValues([[
   "PULSE (B1)",
   "FORCEFULL (C1)",
   "STATUS (I1)",
   "LAST SCAN (J1)"
  ]]);
  // v4.15.122: clear the leftover H1 header from v4.15.121 that mistakenly
  // created a separate INFO_TOTAL column. INFO_TOTAL lives in column B.
  try { recap.getRange("H1").clear(); } catch (eH) {}

  // Write hyperlinks and clear stale rows below
  recap.getRange(2, 1, richTexts.length, 1).setRichTextValues(richTexts);

  // v4.5.9: Clear the managed A:J block so removed sheets do not leave #REF rows.
  var lastRow = recap.getLastRow();
  var newLastRow = 1 + richTexts.length; // row 1 = header, then N data rows
  if (lastRow > newLastRow) {
   recap.getRange(newLastRow + 1, 1, lastRow - newLastRow, 10).clearContent();
  }

  Logger.log("[17_LISTING] Set " + richTexts.length + " hyperlinks in Recap Chain column A");
 } catch (e) {
  Logger.log("[17_LISTING] Error setting hyperlinks: " + e.message);
 }
}

/**
 * Set hyperlinks in Portefeuille Crypto Details column E for values that
 * exactly match an existing managed sheet name. Text is preserved as-is.
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} map - sheet name -> gid mapping
 */
function _setDetailsChainHyperlinks_(ss, map) {
 try {
  if (!ss || !map) return;
  var details = ss.getSheetByName("Portefeuille Crypto Details");
  if (!details) return;
  var lastRow = details.getLastRow();
  if (lastRow < 2) return;

  var range = details.getRange(2, 5, lastRow - 1, 1);
  var values = range.getDisplayValues();
  var baseUrl = ss.getUrl();
  var richTexts = [];

  for (var i = 0; i < values.length; i++) {
   var text = String((values[i] && values[i][0]) || "");
   var gid = map[text];
   var builder = SpreadsheetApp.newRichTextValue().setText(text);
   if (text && gid != null) builder.setLinkUrl(baseUrl + "#gid=" + gid);
   richTexts.push([builder.build()]);
  }

  range.setRichTextValues(richTexts);
  Logger.log("[17_LISTING] Set Portefeuille Crypto Details E:E hyperlinks");
 } catch (e) {
  Logger.log("[17_LISTING] Error setting Details hyperlinks: " + e.message);
 }
}

// v4.15.104: per-cell auto-link on user edit of Portefeuille Crypto Details column E.
// Bridges the gap between _setDetailsChainHyperlinks_ (which only runs on watchdog pulses,
// every 5-30 min) and new rows added by the CEX or ledger watchdogs in between.
// Called from WCORE_ON_EDIT in 16_REFRESH.gs.
function _bpDetailsAutoLink_(e) {
 try {
  if (!e || !e.range) return;
  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet || sheet.getName() !== "Portefeuille Crypto Details") return;
  if (range.getColumn() !== 5) return; // column E only
  var row = range.getRow();
  if (row < 2) return; // skip header
  var text = String(range.getValue() || "");
  if (!text) return;

  // Look up the sheet ID for this name in the active spreadsheet
  var ss = sheet.getParent();
  var target = ss.getSheetByName(text);
  var gid = target ? target.getSheetId() : null;

  // Build the RichTextValue (with or without link)
  var baseUrl = ss.getUrl();
  var builder = SpreadsheetApp.newRichTextValue().setText(text);
  if (gid != null) builder.setLinkUrl(baseUrl + "#gid=" + gid);
  range.setRichTextValue(builder.build());
 } catch (err) {
  try { Logger.log("[bpDetailsAutoLink] " + (err && err.message ? err.message : err)); } catch (eLog) {}
 }
}

/**
 * Liste les feuilles Ledger
 *
 * @param {any} trigger - Parametre optionnel pour forcer le recalcul (ex: NOW() ou TRUE)
 * @returns {Array} Liste des noms de feuilles Ledger
 * @customfunction
 */
function LIST_SHEETS_LEDGER(trigger) {
 try {
 var props = PropertiesService.getScriptProperties();
 var json = props.getProperty(LEDGER_NAMES_KEY);

 // v4.5.3: Only rebuild if cache is completely absent (first-time setup)
 // Never rebuild on TTL expiry — that's REFRESH_LEDGER_CACHE()'s job
 if (!json) {
 _ensureLedgerCache_(true);
 json = props.getProperty(LEDGER_NAMES_KEY);
 if (!json) return [["No cache - run REFRESH_LEDGER_CACHE()"]];
 }

 var names = _filterLedgerNames_(JSON.parse(json));
 var result = [];
 for (var i = 0; i < names.length; i++) {
 result.push([names[i]]);
 }
 return result;
 } catch (e) {
 return [[""]];
 }
}

/**
 * Retourne le lien vers une feuille par son nom
 * 
 * @param {string|Array} chainName - Nom de la feuille ou plage de noms
 * @param {any} trigger - Parametre optionnel pour forcer le recalcul
 * @returns {string|Array} URL(s) vers la/les feuille(s)
 * @customfunction
 */
function SHEET_LINK(chainName, trigger) {
 try {
 // v4.5.3: No rebuild in @customfunction — read cache only
 var props = PropertiesService.getScriptProperties();
 var mapJson = props.getProperty(LEDGER_MAP_KEY);
 if (!mapJson) return "";

 var map = JSON.parse(mapJson);
 if (LEDGER_RETIRED_NAMES[String(chainName || "").toLowerCase()]) return "";
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 if (!ss) return "";
 var baseUrl = ss.getUrl();

 if (Array.isArray(chainName)) {
 var results = [];
 for (var i = 0; i < chainName.length; i++) {
 var r = chainName[i];
 var v = (r && r.length) ? r[0] : "";
 if (!v) {
 results.push([""]);
 } else {
 if (LEDGER_RETIRED_NAMES[String(v).toLowerCase()]) {
 results.push([""]);
 continue;
 }
 var gid = map[v];
 results.push(gid != null ? [baseUrl + "#gid=" + gid] : [""]);
 }
 }
 return results;
 }

 var gid = map[String(chainName)];
 return gid != null ? baseUrl + "#gid=" + gid : "";

 } catch (e) {
 return "";
 }
}

/**
 * Force le refresh du cache des feuilles Ledger
 * Utile pour appeler manuellement depuis le menu ou un script
 */
function REFRESH_LEDGER_CACHE() {
 _ensureLedgerCache_(true);
 _ensureLedgerOnChangeTrigger_();
 return "Cache refreshed at " + new Date().toISOString();
}

/**
 * Auto-install onChange trigger if missing (called from REFRESH_LEDGER_CACHE)
 * Silent — logs result but never throws
 */
function _ensureLedgerOnChangeTrigger_() {
 try {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
   if (triggers[i].getHandlerFunction() === "LEDGER_ON_CHANGE") return;
  }
  ScriptApp.newTrigger("LEDGER_ON_CHANGE")
   .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
   .onChange()
   .create();
  Logger.log("[17_LISTING] Auto-installed onChange trigger for LEDGER_ON_CHANGE");
 } catch (e) {
  Logger.log("[17_LISTING] Could not auto-install trigger: " + e.message);
 }
}

/**
 * Installable onChange trigger — detects sheet add/remove
 * and refreshes ledger cache + Recap Chain hyperlinks automatically.
 *
 * Install once via: INSTALL_LEDGER_ONCHANGE()
 */
function LEDGER_ON_CHANGE(e) {
 try {
  if (!e) return;
  var type = e.changeType;
  if (type === "INSERT_GRID" || type === "REMOVE_GRID") {
   _ensureLedgerCache_(true);
  }
 } catch (ex) {
  Logger.log("[17_LISTING] onChange error: " + ex.message);
 }
}

/**
 * Installe le trigger onChange pour LEDGER_ON_CHANGE.
 * A executer une seule fois depuis l'editeur Apps Script.
 * Verifie qu'il n'existe pas deja avant de creer.
 */
function INSTALL_LEDGER_ONCHANGE() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
   if (triggers[i].getHandlerFunction() === "LEDGER_ON_CHANGE") {
    return "Trigger already installed";
   }
  }
  ScriptApp.newTrigger("LEDGER_ON_CHANGE")
   .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
   .onChange()
   .create();
  return "onChange trigger installed for LEDGER_ON_CHANGE";
}

// ============================================================
// v4.15.121 — Recap Portfolio column B (CEX INFO_TOTAL)
// Populates column B with the value of the TOTAL row of each
// CEX sheet (CEX - Binance, CEX - Bitpanda Crypto, etc.). Called
// from _setRecapHyperlinks_ so the column stays in sync whenever
// the ledger cache is rebuilt.
// On-chain wallets already have column B populated by their I1
// formula; CEX rows are the only ones we fill here.
// ============================================================
function _setRecapCexInfoTotal_(ss, ledgerNames) {
  try {
    if (!ss || !ledgerNames || !ledgerNames.length) return;
    var recap = ss.getSheetByName("Recap Portfolio");
    if (!recap) return;

    for (var i = 0; i < ledgerNames.length; i++) {
      var name = String(ledgerNames[i] || "");
      // Only handle CEX sheets (skip on-chain ledger rows — those
      // already have their INFO_TOTAL populated by the I1 formula).
      if (name.toLowerCase().indexOf("cex - ") !== 0) continue;

      var sh = ss.getSheetByName(name);
      if (!sh) continue;
      var lastRow = sh.getLastRow();
      if (lastRow < 2) continue;

      var firstCol = String(sh.getRange(lastRow, 1, 1, 1).getValue() || "").trim();
      if (firstCol.toUpperCase() === "TOTAL") {
        var value = sh.getRange(lastRow, 2, 1, 1).getValue();
        recap.getRange(2 + i, 2, 1, 1).setValue(value);  // column B
      }
    }
  } catch (e) {
    Logger.log("[17_LISTING] _setRecapCexInfoTotal_ error: " + (e && e.message ? e.message : e));
  }
}
