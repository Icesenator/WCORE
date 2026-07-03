// cex-info-total.test.js
// Tests for _cexComputeAndAppendTotal_ (lives in 35_BITPANDA_SYNC.gs)
// and the Recap Portfolio H column wiring (lives in 17_LISTING.gs).

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const BITPANDA_SRC = fs.readFileSync(path.join(ROOT, "src/35_BITPANDA_SYNC.gs"), "utf8");
const LISTING_SRC = fs.readFileSync(path.join(ROOT, "src/17_LISTING.gs"), "utf8");

// --- 1. Helper exists and lives in 35_BITPANDA_SYNC.gs -----------------
assert.ok(
  /function\s+_cexComputeAndAppendTotal_\s*\(\s*sheetName\s*,\s*balances\s*,\s*provider\s*\)/.test(BITPANDA_SRC),
  "_cexComputeAndAppendTotal_(sheetName, balances, provider) must be defined in 35_BITPANDA_SYNC.gs"
);

// --- 2. Helper uses PriceSources.llamaPriceUsd for gecko-id lookups -------
assert.ok(
  /_cexComputeAndAppendTotal_[\s\S]{0,5000}PriceSources\.llamaPriceUsd/.test(BITPANDA_SRC),
  "helper must call PriceSources.llamaPriceUsd for symbol pricing"
);

// --- 3. Helper strips prior TOTAL row before writing --------------------
assert.ok(
  /_cexComputeAndAppendTotal_[\s\S]{0,800}getLastRow[\s\S]{0,200}TOTAL/.test(BITPANDA_SRC) ||
  /_cexComputeAndAppendTotal_[\s\S]{0,800}TOTAL[\s\S]{0,400}getLastRow/.test(BITPANDA_SRC),
  "helper must scan for and remove a prior TOTAL row before appending (idempotence)"
);

// --- 4. All 6 non-Bitpanda CEX sync files call the helper ---------------
const cexSyncFiles = [
  "36_BINANCE_SYNC.gs",
  "37_BITFINEX_SYNC.gs",
  "38_BYBIT_SYNC.gs",
  "39_COINBASE_SYNC.gs",
  "40_OKX_SYNC.gs",
  "41_KRAKEN_SYNC.gs",
];
for (const f of cexSyncFiles) {
  const src = fs.readFileSync(path.join(ROOT, "src", f), "utf8");
  assert.ok(
    src.includes("_cexComputeAndAppendTotal_("),
    `${f} must call _cexComputeAndAppendTotal_ at the end of its write path`
  );
}

// --- 5. Bitpanda sync calls the helper from all 4 buckets --------------
// Bitpanda uses a generic _bpWriteRows_(ss, sheetName, rows, sourceLabel) helper
// that internally calls _cexComputeAndAppendTotal_ at the end. We check that
// _bpWriteRows_ is invoked with each of the 4 Bitpanda bucket keys (CRYPTO, FIAT,
// STOCKS, COMMODITY) which resolve via BITPANDA_SYNC_CONFIG.SHEETS.
const bpBuckets = ["CRYPTO", "FIAT", "STOCKS", "COMMODITY"];
for (const tag of bpBuckets) {
  const re = new RegExp(`_bpWriteRows_\\([^)]*BITPANDA_SYNC_CONFIG\\.SHEETS\\.${tag}`);
  assert.ok(
    re.test(BITPANDA_SRC),
    `Bitpanda ${tag} path must call _bpWriteRows_ with BITPANDA_SYNC_CONFIG.SHEETS.${tag}`
  );
}
// Also verify that _bpWriteRows_ internally calls the helper.
assert.ok(
  /function\s+_bpWriteRows_[\s\S]{0,2000}_cexComputeAndAppendTotal_/.test(BITPANDA_SRC),
  "_bpWriteRows_ must call _cexComputeAndAppendTotal_ internally"
);

// --- 6. Recap Portfolio column B (INFO_TOTAL) is populated for CEX rows ---
// _setRecapCexInfoTotal_ writes to column B of "Recap Portfolio"
assert.ok(
  /recap\.getRange\(\s*2\s*\+\s*\w+\s*,\s*2\s*,/.test(LISTING_SRC) ||
  /recap\.getRange\([^)]*,\s*2\s*,/.test(LISTING_SRC),
  '_setRecapCexInfoTotal_ must write to column B (2) of Recap Portfolio'
);

// --- 7. _setRecapCexInfoTotal_ exists and is called from _setRecapHyperlinks_
assert.ok(
  /function\s+_setRecapCexInfoTotal_\s*\(/.test(LISTING_SRC),
  "_setRecapCexInfoTotal_ must be defined in 17_LISTING.gs"
);
assert.ok(
  /_setRecapHyperlinks_[\s\S]{0,400}_setRecapCexInfoTotal_/.test(LISTING_SRC) ||
  /_setRecapCexInfoTotal_[\s\S]{0,400}_setRecapHyperlinks_/.test(LISTING_SRC),
  "_setRecapCexInfoTotal_ must be called from _setRecapHyperlinks_"
);

// --- 8. Helper has PriceManager reference removed; uses CEX_SYMBOL_GECKO_IDS now.
assert.ok(
  /CEX_SYMBOL_GECKO_IDS/.test(BITPANDA_SRC),
  "helper must reference CEX_SYMBOL_GECKO_IDS (symbol -> gecko id map)"
);

console.log("cex-info-total: 8/8 guard assertions passed");
