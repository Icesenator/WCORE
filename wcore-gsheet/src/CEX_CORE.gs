// v4.16.0 — CEX_CORE: generic sync engine for all CEX connectors.
// Extracted from 35_BITPANDA_SYNC.gs to avoid coupling all CEX logic to Bitpanda.
//
// Usage (each provider becomes a ~5-line module):
//   function UPDATE_BINANCE_SPOT() { return _cexSync_({
//     name: "BINANCE", sheet: "CEX - Binance",
//     sourceOrder: ["spot", "earn-flexible", "earn-locked"],
//     fetchBuckets: function() { return _binFetchBucketsViaRelay_(); },
//     setStatus: _binSetStatus_,
//   }); }
//
// Shared utilities (CEX_ACQUIRE_LOCK, _cexRelayFetchWithRetry_, _cexManualEnqueue_)
// stay in 35_BITPANDA_SYNC.gs — defined there first.

// ── Generic CEX sync ───────────────────────────────────────────────────────

function _cexSync_(cfg) {
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK(cfg.name)) return '{"ok":false,"error":"BUSY"}';
  try {
    var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
    var buckets = _cexRelayFetchWithRetry_(cfg.fetchBuckets, cfg.name);
    var written = _cexWriteSheet_(ss, cfg.sheet, buckets, cfg.name, cfg.sourceOrder || ["spot"]);
    var status = { ok: true, ts: new Date().toISOString(), rows: written };
    if (cfg.setStatus) { try { cfg.setStatus(status); } catch (e) {} }
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    if (cfg.setStatus) { try { cfg.setStatus(statusErr); } catch (e) {} }
    Logger.log("[CEX_SYNC] " + cfg.name + " ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK(cfg.name);
  }
}

// ── Sheet writing ──────────────────────────────────────────────────────────

function _cexWriteSheet_(ss, sheetName, buckets, providerSlug, sourceOrder) {
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]];
  var dataRows = [];
  var seen = {};
  for (var si = 0; si < sourceOrder.length; si++) {
    var src = sourceOrder[si];
    var list = buckets[src] || [];
    for (var ri = 0; ri < list.length; ri++) {
      var item = list[ri];
      var sym = String(item[0] || "").trim().toUpperCase();
      var amt = Number(String(item[1] == null ? "0" : item[1]).replace(",", "."));
      if (!sym || !isFinite(amt) || amt <= 0) continue;
      var key = src + ":" + sym;
      if (seen[key] != null) { dataRows[seen[key]][1] += amt; continue; }
      seen[key] = dataRows.length;
      dataRows.push([sym, amt, src, stamp]);
    }
  }
  for (var di = 0; di < dataRows.length; di++) { values.push(dataRows[di].slice()); }
  return _cexComputeAndAppendTotal_(ss, sheetName, dataRows, providerSlug, values);
}

// ── OnEdit handler ─────────────────────────────────────────────────────────

function _cexOnEdit_(e, sheetName, label) {
  try {
    var range = e && e.range;
    if (!range) return;
    if (range.getSheet().getName() !== sheetName) return;
    if (range.getA1Notation() !== "A1") return;
    if (range.getValue() !== true) return;
    _cexManualEnqueue_(label);
  } catch (err) { Logger.log("[CEX_ONEDIT] " + label + " error: " + err); }
}
