// v4.16.76 - FEAT: projections Crypto/Action generiques basees registre RWA.
// Calque 44_XSTOCKS_SOLANA: diagnostics preserves, INFO_TOTAL recalcule, A:G/A:I.
function _rwaIsDiagnosticRow_(row) {
  var key = String(row[1] || "");
  var message = String(row[2] || "");
  return key === "ERROR" || key === "INFO_ERROR" || key === "INFO_QUOTA" || ((key === "INFO" || key === "INFO_ROT") && /ERROR|NO_CACHE|DEGRADED|FALLBACK|UNAVAILABLE|MISSING|WAITING|STALE|BLOCKED|QUOTA/i.test(message));
}

function _rwaLookupRow_(chainKey, row) {
  var address = String(row[3] || "").trim();
  if (!address) return null;
  try { return RwaRegistry_lookup(chainKey, address); } catch (eRegistry) { return null; }
}

function _rwaRecomputeTotal_(out) {
  var total = 0;
  // UNKNOWN != 0 : un INFO_TOTAL source vide, ou un solde natif non nul sans
  // valeur, rend le total de la vue inconnu (meme contrat que le moteur source).
  var unknown = false;
  for (var k = 1; k < out.length; k++) {
    if (out[k] && out[k][1] === "INFO_TOTAL" && (out[k][6] === "" || out[k][6] === null || out[k][6] === undefined)) unknown = true;
  }
  for (var i = 1; i < out.length; i++) {
    if (!out[i] || out[i][0] === "META" || String(out[i][1] || "").indexOf("INFO") === 0) continue;
    var cell = out[i][6];
    var empty = cell === "" || cell === null || cell === undefined || typeof cell === "boolean";
    if (empty) {
      var bal = Number(out[i][4]);
      if (String(out[i][3]) === "native" && out[i][4] !== "" && isFinite(bal) && bal !== 0) unknown = true;
      continue;
    }
    var v = Number(cell);
    if (isFinite(v)) total += v;
  }
  if (unknown) total = "";
  for (var j = 0; j < out.length; j++) {
    if (out[j] && out[j][1] === "INFO_TOTAL") out[j][6] = total;
  }
  return out;
}

function _rwaProjectCryptoRows_(chainKey, cryptoSheetName, rows) {
  rows = Array.isArray(rows) ? rows : [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    var isHeader = i === 0;
    var isInfo = !isHeader && (row[0] === "META" || String(row[1] || "").indexOf("INFO") === 0);
    if (!isHeader && !isInfo && _rwaLookupRow_(chainKey, row)) continue;
    var copy = row.slice(0, 7);
    if (!isHeader && !isInfo) copy[0] = cryptoSheetName;
    out.push(copy);
  }
  return _rwaRecomputeTotal_(out);
}

// v4.16.99 - INFO_TOTAL computed by the projection of every "Ledger - * Action" view
// (P1-DATA-ACTION-VIEW-STATIC-TOTAL). The Recap reads G of the first INFO_TOTAL row of column B;
// it used to find a static row typed on 2026-08-27 with G = 0, so any tokenised asset appearing
// in a view would have been reported as 0 EUR. The projection now ends with its own INFO_TOTAL:
//  - sum of value_eur when every asset row carries a value, 0 when the view holds no asset;
//  - "" (UNKNOWN) when an asset has no value (the view does not price it) or when a diagnostic
//    row says the source scan is unavailable or degraded. An unknown NATIVE price alone does
//    not touch tokenised assets and keeps the total known.
// A diagnostic row decides the total only when it really says the source is unavailable or
// degraded: the web scan replays "INFO_ROT ...; degraded=false" on every healthy cache, and an
// ERROR that starts with NATIVE_PRICE_UNKNOWN only concerns the native price.
function _rwaDiagnosticInvalidatesTotal_(row) {
  var key = String(row[1] || "");
  var message = String(row[2] || "");
  if (key === "ERROR" && /^NATIVE_PRICE_UNKNOWN/i.test(message)) return false;
  if (key === "ERROR" || key === "INFO_ERROR" || key === "INFO_QUOTA") return true;
  if (key === "INFO" || key === "INFO_ROT") {
    return /ERROR|NO_CACHE|DEGRADED|FALLBACK|UNAVAILABLE|MISSING|WAITING|STALE|BLOCKED|QUOTA/i.test(message.replace(/degraded\s*=\s*false/ig, ""));
  }
  return false;
}

function _rwaAppendActionTotal_(out, actionSheetName) {
  var total = 0;
  var unknown = false;
  for (var i = 1; i < out.length; i++) {
    var row = out[i];
    if (!row) continue;
    if (_rwaIsDiagnosticRow_(row)) {
      if (_rwaDiagnosticInvalidatesTotal_(row)) unknown = true;
      continue;
    }
    if (String(row[1] || "").indexOf("INFO") === 0) continue;
    var cell = row[6];
    if (cell === "" || cell === null || cell === undefined || typeof cell === "boolean") { unknown = true; continue; }
    var v = Number(cell);
    if (!isFinite(v)) { unknown = true; continue; }
    total += v;
  }
  out.push([actionSheetName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", unknown ? "" : total, "", ""]);
  return out;
}

function _rwaProjectActionRows_(chainKey, actionSheetName, rows) {
  var out = [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur", "raw_balance", "multiplier"]];
  rows = Array.isArray(rows) ? rows : [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    if (_rwaIsDiagnosticRow_(row)) {
      var diagnostic = row.slice(0, 7);
      diagnostic[0] = actionSheetName;
      if (String(row[1]) === "INFO_QUOTA") { diagnostic[4] = ""; diagnostic[5] = ""; }
      diagnostic[6] = ""; diagnostic[7] = ""; diagnostic[8] = "";
      out.push(diagnostic);
      continue;
    }
    if (row[0] === "META" || String(row[1] || "").indexOf("INFO") === 0) continue;
    var entry = _rwaLookupRow_(chainKey, row);
    if (!entry) continue;
    var rawCell = row[4];
    if (rawCell === null || rawCell === undefined || (typeof rawCell === "string" && rawCell.trim() === "")) continue;
    if (typeof rawCell === "boolean") continue;
    var raw = Number(rawCell);
    if (!isFinite(raw)) continue;
    var multiplier = Number(entry.m);
    if (!isFinite(multiplier) || multiplier <= 0) multiplier = 1;
    var adjusted = raw * multiplier;
    if (!isFinite(adjusted)) continue;
    var underlying = String(entry.u || "").toUpperCase();
    out.push([actionSheetName, underlying, String(entry.n || underlying), String(row[3]).trim(), adjusted, "", "", raw, multiplier]);
  }
  return _rwaAppendActionTotal_(out, actionSheetName);
}
