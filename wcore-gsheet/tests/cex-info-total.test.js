// cex-info-total.test.js
// Tests for _cexComputeAndAppendTotal_ (lives in 35_BITPANDA_SYNC.gs)
// and the Recap Portfolio H column wiring (lives in 17_LISTING.gs).

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const BITPANDA_SRC = fs.readFileSync(path.join(ROOT, "src/35_BITPANDA_SYNC.gs"), "utf8");
const LISTING_SRC = fs.readFileSync(path.join(ROOT, "src/17_LISTING.gs"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const CEX_TOTAL_BODY = extractFunction(BITPANDA_SRC, "_cexComputeAndAppendTotal_");
const CEX_REPAIR_BODY = extractFunction(BITPANDA_SRC, "REPAIR_CEX_SHEETS_STRUCTURE");

// --- 1. Helper exists and lives in 35_BITPANDA_SYNC.gs -----------------
assert.ok(
  /function\s+_cexComputeAndAppendTotal_\s*\(\s*ss\s*,\s*sheetName\s*,\s*balances\s*,\s*provider(?:\s*,\s*opt_values)?\s*\)/.test(BITPANDA_SRC),
  "_cexComputeAndAppendTotal_(ss, sheetName, balances, provider[, opt_values]) must be defined in 35_BITPANDA_SYNC.gs"
);

// --- 2. Helper uses PriceSources.llamaPriceUsd for gecko-id lookups -------
assert.ok(
  /_cexComputeAndAppendTotal_[\s\S]{0,5000}PriceSources\.llamaPriceUsd/.test(BITPANDA_SRC),
  "helper must call PriceSources.llamaPriceUsd for symbol pricing"
);

// --- 3. Helper strips prior TOTAL row before writing --------------------
assert.ok(
  /getRange\s*\(\s*1\s*,\s*1\s*,\s*managedRows\s*,\s*7\s*\)\.clearContent\s*\(/.test(CEX_TOTAL_BODY),
  "helper must clear managed A:G before appending TOTAL row (idempotence; prevents stale column G totals)"
);
assert.ok(
  /fullValues\.push/.test(CEX_TOTAL_BODY) && /setValues\(fullValues\)/.test(CEX_TOTAL_BODY),
  "helper must write CEX output as one complete A:G matrix, not as partial A:D then E/F/G writes"
);
assert.ok(
  !/setValues\(opt_values\)/.test(CEX_TOTAL_BODY),
  "helper must not write A:D separately; timeouts after A:D leave CEX sheets without value_eur/Vérif/INFO_TOTAL"
);
assert.ok(
  /getMaxColumns\s*\(\s*\)\s*<\s*7/.test(CEX_TOTAL_BODY)
    && /insertColumnsAfter\s*\(/.test(CEX_TOTAL_BODY)
    && /7\s*-\s*sh\.getMaxColumns\s*\(\s*\)/.test(CEX_TOTAL_BODY),
  "helper must ensure CEX sheets have at least 7 columns before writing value_eur/Vérif/INFO_TOTAL"
);
assert.ok(
  !/getRange\s*\(\s*2\s*,\s*4\s*,\s*opt_values\.length\s*-\s*1\s*\)/.test(CEX_TOTAL_BODY),
  "helper must not use 3-argument getRange(row,col,numRows); a runtime throw after writing A:D leaves CEX sheets without value_eur/Vérif/INFO_TOTAL"
);
assert.ok(
  /getRange\s*\(\s*2\s*,\s*4\s*,\s*opt_values\.length\s*-\s*1\s*,\s*1\s*\)\.setNumberFormat\s*\(\s*"@"\s*\)/.test(CEX_TOTAL_BODY),
  "helper must format updated_at with an explicit one-column range"
);
assert.ok(
  !/STOCK_RATIO_MULTIPLIERS|"SSU"\s*:\s*25|"SMSN"\s*:\s*25/.test(CEX_TOTAL_BODY),
  "CEX stock value_eur must not reapply the legacy Samsung x25 multiplier; WCORE stock prices are already per Bitpanda SSU/SMSN unit"
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
  assert.ok(
    !/try\s*\{[^{}]*_cexComputeAndAppendTotal_\(/.test(src),
    `${f} must not swallow _cexComputeAndAppendTotal_ failures; a partial A:D CEX sheet is worse than a visible sync error`
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

// --- 6. _cexUpdateRecapColumnB_ is a standalone helper (Recap formula now dynamic) --
assert.ok(
  /function\s+_cexUpdateRecapColumnB_\s*\(/.test(BITPANDA_SRC),
  "_cexUpdateRecapColumnB_ must remain defined in 35_BITPANDA_SYNC.gs for manual recovery"
);

// --- 7. _setRecapCexInfoTotal_ still defined but NOT called from _setRecapHyperlinks_
// (v4.15.122: moved to per-sync _cexUpdateRecapColumnB_ to avoid REFRESH_LEDGER_CACHE timeout).
// The helper is kept for standalone use (e.g. manual recovery) but is no longer part
// of the ledger-cache rebuild.
assert.ok(
  /function\s+_setRecapCexInfoTotal_\s*\(/.test(LISTING_SRC),
  "_setRecapCexInfoTotal_ must remain defined in 17_LISTING.gs"
);

// --- 8. Helper has PriceManager reference removed; uses CEX_SYMBOL_GECKO_IDS now.
assert.ok(
  /CEX_SYMBOL_GECKO_IDS/.test(BITPANDA_SRC),
  "helper must reference CEX_SYMBOL_GECKO_IDS (symbol -> gecko id map)"
);

// --- 9. Generic live repair covers every CEX sheet ----------------------
assert.ok(
  /function\s+_cexRepairSheetStructure_\s*\(/.test(BITPANDA_SRC),
  "generic CEX structure repair helper must exist"
);
for (const sheet of [
  'CEX - Binance',
  'CEX - Bitfinex',
  'CEX - Bitpanda Commodity',
  'CEX - Bitpanda Crypto',
  'CEX - Bitpanda Fiat',
  'CEX - Bitpanda Stocks',
  'CEX - Bybit',
  'CEX - Coinbase',
  'CEX - Kraken',
  'CEX - OKX',
]) {
  assert.ok(CEX_REPAIR_BODY.includes(`"${sheet}"`), `REPAIR_CEX_SHEETS_STRUCTURE must cover ${sheet}`);
}
assert.ok(
  /setValue\("value_eur"\)/.test(BITPANDA_SRC) && /_cexWriteVerifMap_\(sh, sheetName\)/.test(BITPANDA_SRC),
  "CEX repair must restore value_eur and Vérif headers/formula"
);

console.log("cex-info-total: 9/9 guard assertions passed");
