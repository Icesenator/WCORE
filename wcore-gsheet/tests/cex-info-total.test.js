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

// --- 2. Helper uses PriceManager.computePriceEur -----------------------
assert.ok(
  /_cexComputeAndAppendTotal_[\s\S]{0,400}PriceManager\.computePriceEur/.test(BITPANDA_SRC),
  "helper must call PriceManager.computePriceEur(symbol) to value each row"
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
const bpBuckets = [
  ["CRYPTO", "Crypto"],
  ["FIAT", "Fiat"],
  ["STOCKS", "Stocks"],
  ["COMMODITY", "Commodity"],
];
for (const [tag, label] of bpBuckets) {
  const sheetName = `CEX - Bitpanda ${label}`;
  const re = new RegExp(`_cexComputeAndAppendTotal_\\([^)]*["']${sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
  assert.ok(
    re.test(BITPANDA_SRC),
    `Bitpanda ${tag} path must call the TOTAL helper for sheet "${sheetName}"`
  );
}

// --- 6. Recap Portfolio gains an INFO_TOTAL column header --------------
assert.ok(
  /recap\.getRange\("H1"[\s\S]{0,30}INFO_TOTAL/.test(LISTING_SRC) ||
  /H1[\s\S]{0,200}INFO_TOTAL/.test(LISTING_SRC) ||
  /INFO_TOTAL[\s\S]{0,200}H1/.test(LISTING_SRC),
  '17_LISTING.gs must set Recap Portfolio H1 to "INFO_TOTAL"'
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

// --- 8. Quota tripped behavior: helper must write [BLOCKED:QUOTA] marker
assert.ok(
  /_cexComputeAndAppendTotal_[\s\S]{0,1500}BLOCKED:QUOTA/.test(BITPANDA_SRC),
  "helper must write [BLOCKED:QUOTA] stamp when the pricing cascade throws a quota error"
);

console.log("cex-info-total: 8/8 guard assertions passed");
