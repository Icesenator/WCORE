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
  return out;
}
