/************************************************************
 * 30_SCAN_PRICING.gs - Scan des gaps de pricing
 *
 * Version: v4.13.6
 *
 * Scanne tous les onglets "Ledger - *" du spreadsheet actif
 * et detecte les tokens avec balance > 0 mais sans prix.
 *
 * Fonctions publiques:
 * - WCORE_SCAN_PRICING_GAPS()  : Rapport complet
 * - WCORE_SCAN_ERRORS()        : Erreurs detectees (#N/A, #NAME?, etc.)
 ************************************************************/

// ============================================================
// SCAN PRICING GAPS
// ============================================================

/**
 * Scanne tous les onglets Ledger pour trouver les tokens sans prix.
 * Retourne un tableau 2D pour Google Sheets.
 *
 * @returns {Array} Tableau 2D [chain, ticker, name, contract, balance, issue]
 * @customfunction
 */
function WCORE_SCAN_PRICING_GAPS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  var results = [
    ["chain", "ticker", "name", "contract", "balance", "issue"]
  ];

  var stats = { chains: 0, tokens: 0, gaps: 0, errors: 0, degraded: 0 };

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();

    // Seulement les onglets "Ledger - *"
    if (name.indexOf("Ledger - ") !== 0) continue;
    stats.chains++;

    var chainLabel = name.replace("Ledger - ", "");

    try {
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      // Trouver les colonnes par headers (row 0)
      var headers = data[0];
      var colMap = _scanFindColumns(headers);
      if (colMap.balance < 0) continue; // pas de colonne balance

      // Scanner chaque ligne
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var ticker = colMap.ticker >= 0 ? String(row[colMap.ticker] || "") : "";
        var tokenName = colMap.name >= 0 ? String(row[colMap.name] || "") : "";
        var contract = colMap.contract >= 0 ? String(row[colMap.contract] || "") : "";
        var balRaw = colMap.balance >= 0 ? row[colMap.balance] : "";
        var priceRaw = colMap.price >= 0 ? row[colMap.price] : "";
        var valueRaw = colMap.value >= 0 ? row[colMap.value] : "";

        // Ignorer les lignes META / INFO
        if (ticker === "META" || String(ticker).indexOf("INFO_") === 0) continue;
        if (ticker === "chain_name" || ticker === "") continue;

        // Detecter erreurs dans les cellules
        var cellError = _scanDetectError(balRaw) || _scanDetectError(priceRaw) || _scanDetectError(valueRaw);
        if (cellError) {
          stats.errors++;
          results.push([chainLabel, ticker, tokenName, contract, String(balRaw), cellError]);
          continue;
        }

        // Detecter degraded
        var degraded = _scanDetectDegraded(String(balRaw)) || _scanDetectDegraded(String(priceRaw));
        if (degraded) {
          stats.degraded++;
          results.push([chainLabel, ticker, tokenName, contract, String(balRaw), degraded]);
          continue;
        }

        // Parser balance
        var balance = _scanParseNum(balRaw);
        if (balance <= 0) continue; // pas de balance, rien a signaler

        stats.tokens++;

        // Verifier prix
        var price = _scanParseNum(priceRaw);
        if (price <= 0) {
          stats.gaps++;
          results.push([chainLabel, ticker, tokenName, contract, balance, "NO_PRICE"]);
        }
      }
    } catch (e) {
      results.push([chainLabel, "ERROR", e.message, "", "", "SHEET_ERROR"]);
    }
  }

  // Ajouter resume en fin
  results.push(["", "", "", "", "", ""]);
  results.push(["SUMMARY", "chains_scanned", stats.chains, "", "", ""]);
  results.push(["SUMMARY", "tokens_with_balance", stats.tokens, "", "", ""]);
  results.push(["SUMMARY", "missing_price", stats.gaps, "", "", ""]);
  results.push(["SUMMARY", "cell_errors", stats.errors, "", "", ""]);
  results.push(["SUMMARY", "degraded", stats.degraded, "", "", ""]);

  return results;
}

// ============================================================
// SCAN ERRORS ONLY (lighter version)
// ============================================================

/**
 * Scanne les onglets Ledger pour les erreurs (#N/A, #NAME?, #REF!, QUOTA, DEGRADED).
 * Plus leger que WCORE_SCAN_PRICING_GAPS.
 *
 * @returns {Array} Tableau 2D [chain, ticker, cell_value, error_type]
 * @customfunction
 */
function WCORE_SCAN_ERRORS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  var results = [
    ["chain", "ticker", "cell_value", "error_type"]
  ];

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    if (name.indexOf("Ledger - ") !== 0) continue;

    var chainLabel = name.replace("Ledger - ", "");

    try {
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      var headers = data[0];
      var colMap = _scanFindColumns(headers);

      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var ticker = colMap.ticker >= 0 ? String(row[colMap.ticker] || "") : "";
        if (ticker === "META" || String(ticker).indexOf("INFO_") === 0) continue;
        if (ticker === "chain_name" || ticker === "") continue;

        // Scanner toutes les colonnes pour erreurs
        for (var c = 0; c < row.length; c++) {
          var val = row[c];
          var err = _scanDetectError(val);
          if (err) {
            results.push([chainLabel, ticker, String(val), err]);
            break; // une erreur par ligne suffit
          }
          var deg = _scanDetectDegraded(String(val));
          if (deg) {
            results.push([chainLabel, ticker, String(val), deg]);
            break;
          }
        }
      }
    } catch (e) {
      results.push([chainLabel, "ERROR", e.message, "SHEET_ERROR"]);
    }
  }

  return results;
}

// ============================================================
// HELPERS INTERNES
// ============================================================

/**
 * Trouve les index des colonnes par nom de header.
 */
function _scanFindColumns(headers) {
  var map = { ticker: -1, name: -1, contract: -1, balance: -1, price: -1, value: -1 };
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toLowerCase().trim();
    if (h === "token_ticker" || h === "ticker") map.ticker = i;
    else if (h === "token_name" || h === "name") map.name = i;
    else if (h === "contract_address" || h === "contract") map.contract = i;
    else if (h === "balance") map.balance = i;
    else if (h === "price_eur" || h === "price") map.price = i;
    else if (h === "value_eur" || h === "value") map.value = i;
  }
  return map;
}

/**
 * Detecte les erreurs Google Sheets (#N/A, #NAME?, #REF!, #ERROR!, #VALUE!).
 * Retourne le type d'erreur ou null.
 */
function _scanDetectError(val) {
  if (val === null || val === undefined) return null;
  var s = String(val);
  if (s === "#N/A" || s === "#NAME?" || s === "#REF!" || s === "#ERROR!" || s === "#VALUE!") {
    return s;
  }
  // GAS represente certaines erreurs comme des objets
  if (typeof val === "object" && val !== null && val.toString) {
    var str = val.toString();
    if (str.indexOf("#") === 0) return str;
  }
  return null;
}

/**
 * Detecte les marqueurs degraded/quota dans une valeur.
 * Retourne le type ou null.
 */
function _scanDetectDegraded(s) {
  if (!s) return null;
  if (s.indexOf("[DEGRADED]") >= 0) return "DEGRADED";
  if (s.indexOf("[QUOTA]") >= 0) return "QUOTA_BLOCKED";
  if (s.indexOf("[BLOCKED") >= 0) return "BLOCKED";
  if (s.indexOf("[CIRCUIT_BREAKER]") >= 0) return "CIRCUIT_BREAKER";
  if (s.indexOf("[ERROR") >= 0) return "ERROR_TAG";
  return null;
}

/**
 * Parse un nombre de facon tolerante.
 */
function _scanParseNum(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  var s = String(val).replace(/,/g, "").replace(/\s/g, "").trim();
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
