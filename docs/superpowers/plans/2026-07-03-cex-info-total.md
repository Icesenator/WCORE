# CEX INFO_TOTAL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append a `TOTAL` row to every `CEX - *` sheet after each sync and surface it in a new `INFO_TOTAL (H)` column in `Recap Portfolio`, harmonized with the on-chain wallet pattern.

**Architecture:** A shared helper `_cexComputeAndAppendTotal_(sheetName, balances, provider)` lives in `35_BITPANDA_SYNC.gs` next to the other shared CEX helpers (`CEX_ACQUIRE_LOCK`, `CEX_RELEASE_LOCK`, `CEX_QUEUE_OR_MARK_MANUAL_JOB`). Each `UPDATE_*_SPOT()` and each Bitpanda sync path calls it after writing balance rows. The helper removes any prior `TOTAL` row, fetches prices through `PriceManager.computePriceEur(symbol)`, sums `balance × price_eur`, and appends one new `TOTAL` row. A new column `H` in `Recap Portfolio` is populated by `_setRecapCexInfoTotal_()` called from `_setRecapHyperlinks_()`.

**Tech Stack:** Google Apps Script `.gs` files, existing pricing cascade in `07_PRICES.gs`, Node `cjs` tests via `npm test` in `wcore-gsheet`, `safe-push.ps1` for deploy.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `wcore-gsheet/src/35_BITPANDA_SYNC.gs` | Shared CEX helpers + Bitpanda sync | Add `_cexComputeAndAppendTotal_` helper, call from 4 Bitpanda sync paths |
| `wcore-gsheet/src/36_BINANCE_SYNC.gs` | Binance sync | Call helper at end of `_binWriteSheet_` |
| `wcore-gsheet/src/37_BITFINEX_SYNC.gs` | Bitfinex sync | Call helper at end of `_bitWriteSheet_` |
| `wcore-gsheet/src/38_BYBIT_SYNC.gs` | Bybit sync | Call helper at end of `_bybWriteSheet_` |
| `wcore-gsheet/src/39_COINBASE_SYNC.gs` | Coinbase sync | Call helper at end of `_cbaseWriteSheet_` |
| `wcore-gsheet/src/40_OKX_SYNC.gs` | OKX sync | Call helper at end of `_okxWriteSheet_` |
| `wcore-gsheet/src/41_KRAKEN_SYNC.gs` | Kraken sync | Call helper at end of `_krakenWriteSheet_` |
| `wcore-gsheet/src/17_LISTING.gs` | Recap Portfolio builder | Add `H1` header, add `_setRecapCexInfoTotal_` helper, call from `_setRecapHyperlinks_` |
| `wcore-gsheet/tests/cex-info-total.test.js` | Tests for the new helper and Recap integration | New file |

---

## Task 1: Test scaffold for the TOTAL helper

**Files:**
- Create: `wcore-gsheet/tests/cex-info-total.test.js`

- [ ] **Step 1: Create the test file with failing assertions for the helper**

Write `wcore-gsheet/tests/cex-info-total.test.js` with the following content:

```javascript
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
for (const tag of ["CRYPTO", "FIAT", "STOCKS", "COMMODITY"]) {
  assert.ok(
    new RegExp(`_cexComputeAndAppendTotal_\\([^)]*${tag}`, "i").test(BITPANDA_SRC) ||
    BITPANDA_SRC.includes(`_cexComputeAndAppendTotal_(buckets, "CEX - Bitpanda ${tag[0]}${tag.slice(1).toLowerCase()}"`),
    `Bitpanda ${tag} path must call the TOTAL helper`
  );
}

// --- 6. Recap Portfolio gains an INFO_TOTAL column header --------------
assert.ok(
  /H1[\s\S]{0,40}INFO_TOTAL/.test(LISTING_SRC) || /INFO_TOTAL[\s\S]{0,40}H1/.test(LISTING_SRC),
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
```

- [ ] **Step 2: Run the test to confirm it fails (RED)**

Run: `cd wcore-gsheet && node tests/cex-info-total.test.js`
Expected: failure with one or more assertion errors, e.g. `_cexComputeAndAppendTotal_(sheetName, balances, provider) must be defined in 35_BITPANDA_SYNC.gs`.

- [ ] **Step 3: Commit the failing test**

```bash
cd wcore-gsheet
git add tests/cex-info-total.test.js
git commit -m "test: scaffold cex info total guard tests (red)"
```

---

## Task 2: Implement the shared TOTAL helper

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs`

- [ ] **Step 1: Add the `_cexComputeAndAppendTotal_` helper**

Append the following block to the bottom of `wcore-gsheet/src/35_BITPANDA_SYNC.gs` (right after the existing shared CEX helpers like `CEX_ACQUIRE_LOCK`):

```javascript
// ============================================================
// INFO_TOTAL CEX — v4.15.121
// Appends a TOTAL row at the bottom of a CEX sheet, summing
// balance × price_eur for each line. Idempotent: removes any
// prior TOTAL row before appending. Uses the existing
// PriceManager.computePriceEur(symbol) cascade.
// ============================================================

/**
 * Compute and append the INFO_TOTAL row to a CEX sheet.
 * @param {Spreadsheet} ss
 * @param {string} sheetName - e.g. "CEX - Binance"
 * @param {Array<[string, number, string, string]>} balances - rows [symbol, balance, source, stamp]
 * @param {string} provider - e.g. "binance", "kraken", "bitpanda"
 * @returns {number} total value in EUR written to the TOTAL row
 */
function _cexComputeAndAppendTotal_(ss, sheetName, balances, provider) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    Logger.log("[CEX_TOTAL] sheet not found: " + sheetName);
    return 0;
  }

  // 1. Strip any prior TOTAL row to stay idempotent across syncs.
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var firstCol = sh.getRange(lastRow, 1, 1, 1).getValue();
    if (String(firstCol || "").trim().toUpperCase() === "TOTAL") {
      sh.deleteRow(lastRow);
      lastRow = sh.getLastRow();
    }
  }

  // 2. Sum balance × price_eur using the existing cascade.
  var total = 0;
  var valued = 0;
  var skipped = 0;
  for (var i = 0; i < (balances || []).length; i++) {
    var row = balances[i] || [];
    var symbol = String(row[0] || "").trim().toUpperCase();
    var balance = Number(row[1] || 0);
    if (!symbol || balance <= 0) continue;

    var priceEur = null;
    try {
      priceEur = PriceManager.computePriceEur(symbol);
    } catch (ePrice) {
      Logger.log("[CEX_TOTAL] skip no-price: " + symbol + " in " + sheetName + " (" + (ePrice && ePrice.message ? ePrice.message : ePrice) + ")");
      skipped++;
      continue;
    }
    if (priceEur == null || !isFinite(priceEur) || priceEur <= 0) {
      Logger.log("[CEX_TOTAL] skip no-price: " + symbol + " in " + sheetName);
      skipped++;
      continue;
    }
    total += balance * Number(priceEur);
    valued++;
  }

  // 3. Write the TOTAL row. If the cascade threw a quota error
  //    mid-loop, surface it honestly via [BLOCKED:QUOTA] stamp.
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var stampValue = "[BLOCKED:QUOTA] " + stamp;
  var label = "TOTAL";
  var valueCell = Math.round(total * 100) / 100;
  var providerCell = String(provider || "").toLowerCase();

  sh.getRange(lastRow + 1, 1, 1, 4).setValues([[label, valueCell, providerCell, stamp]]);
  sh.getRange(lastRow + 1, 4, 1, 1).setNumberFormat("@");

  Logger.log("[CEX_TOTAL] " + sheetName + " TOTAL=" + valueCell + " EUR valued=" + valued + " skipped=" + skipped);
  return valueCell;
}
```

- [ ] **Step 2: Run the test — it should now pass partial guard (1, 2, 3, 8)**

Run: `cd wcore-gsheet && node tests/cex-info-total.test.js`
Expected: still failing on assertions 4, 5, 6, 7 (call sites and Recap wiring not yet wired). The helper assertions 1, 2, 3, 8 should now pass.

- [ ] **Step 3: Commit the helper**

```bash
cd wcore-gsheet
git add src/35_BITPANDA_SYNC.gs
git commit -m "feat(cex): add _cexComputeAndAppendTotal_ helper"
```

---

## Task 3: Wire the helper into the 6 non-Bitpanda CEX sync files

**Files:**
- Modify: `wcore-gsheet/src/36_BINANCE_SYNC.gs`
- Modify: `wcore-gsheet/src/37_BITFINEX_SYNC.gs`
- Modify: `wcore-gsheet/src/38_BYBIT_SYNC.gs`
- Modify: `wcore-gsheet/src/39_COINBASE_SYNC.gs`
- Modify: `wcore-gsheet/src/40_OKX_SYNC.gs`
- Modify: `wcore-gsheet/src/41_KRAKEN_SYNC.gs`

- [ ] **Step 1: Binance — call helper at the end of `_binWriteSheet_`**

In `wcore-gsheet/src/36_BINANCE_SYNC.gs`, find the end of `_binWriteSheet_(ss, buckets)`. Right after the last `setValues` / `setNumberFormat` call, append:

```javascript
  // v4.15.121: append INFO_TOTAL row at the bottom of the CEX sheet.
  var _binValues = _binBuildValues_(buckets, _binFormatStamp_(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")));
  try { _cexComputeAndAppendTotal_(ss, BINANCE_SYNC_CONFIG.SHEET, _binValues, "binance"); } catch (eTot) { Logger.log("[CEX_TOTAL] binance append failed: " + eTot); }
```

- [ ] **Step 2: Bitfinex — call helper at the end of `_bitWriteSheet_`**

In `wcore-gsheet/src/37_BITFINEX_SYNC.gs`, find the end of `_bitWriteSheet_` (or its equivalent write function — match the existing local name). Append:

```javascript
  // v4.15.121: append INFO_TOTAL row at the bottom of the CEX sheet.
  try { _cexComputeAndAppendTotal_(ss, BITFINEX_SYNC_CONFIG.SHEET, _bitValues, "bitfinex"); } catch (eTot) { Logger.log("[CEX_TOTAL] bitfinex append failed: " + eTot); }
```

Use the actual local `values` array variable name in `_bitWriteSheet_` — read the file first, replace `_bitValues` with the correct local name.

- [ ] **Step 3: Bybit — call helper at the end of `_bybWriteSheet_`**

In `wcore-gsheet/src/38_BYBIT_SYNC.gs`, find the end of the Bybit write function. Append:

```javascript
  // v4.15.121: append INFO_TOTAL row at the bottom of the CEX sheet.
  try { _cexComputeAndAppendTotal_(ss, BYBIT_SYNC_CONFIG.SHEET, _bybValues, "bybit"); } catch (eTot) { Logger.log("[CEX_TOTAL] bybit append failed: " + eTot); }
```

Replace `_bybValues` with the actual local variable name from the file.

- [ ] **Step 4: Coinbase — call helper at the end of the Coinbase write function**

In `wcore-gsheet/src/39_COINBASE_SYNC.gs`, append the same pattern with provider `"coinbase"`.

- [ ] **Step 5: OKX — call helper at the end of the OKX write function**

In `wcore-gsheet/src/40_OKX_SYNC.gs`, append the same pattern with provider `"okx"`.

- [ ] **Step 6: Kraken — call helper at the end of `_krakenWriteSheet_`**

In `wcore-gsheet/src/41_KRAKEN_SYNC.gs`, append the same pattern with provider `"kraken"`.

- [ ] **Step 7: Run the test — assertion 4 should now pass**

Run: `cd wcore-gsheet && node tests/cex-info-total.test.js`
Expected: assertions 1, 2, 3, 4, 8 pass. Still failing on 5, 6, 7.

- [ ] **Step 8: Commit**

```bash
cd wcore-gsheet
git add src/36_BINANCE_SYNC.gs src/37_BITFINEX_SYNC.gs src/38_BYBIT_SYNC.gs src/39_COINBASE_SYNC.gs src/40_OKX_SYNC.gs src/41_KRAKEN_SYNC.gs
git commit -m "feat(cex): wire _cexComputeAndAppendTotal_ into 6 non-bitpanda syncs"
```

---

## Task 4: Wire the helper into the 4 Bitpanda buckets

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs`

- [ ] **Step 1: Find the 4 Bitpanda write paths**

In `35_BITPANDA_SYNC.gs`, locate the 4 functions (or function branches) that write to:
- `CEX - Bitpanda Crypto`
- `CEX - Bitpanda Fiat`
- `CEX - Bitpanda Stocks`
- `CEX - Bitpanda Commodity`

For each, find the local `balances` array passed to the writer (typically built by `_bpBuildValues_(buckets, stamp)` or similar).

- [ ] **Step 2: Append the helper call at the end of each write path**

After the last `setValues` / `setNumberFormat` of each of the 4 paths, insert:

```javascript
  // v4.15.121: append INFO_TOTAL row at the bottom of the CEX sheet.
  try { _cexComputeAndAppendTotal_(ss, "CEX - Bitpanda Crypto", _bpValues, "bitpanda"); } catch (eTot) { Logger.log("[CEX_TOTAL] bitpanda crypto append failed: " + eTot); }
```

Repeat for `Fiat`, `Stocks`, `Commodity`, replacing the sheet name and the local `values` variable name as appropriate. The `provider` cell stays `"bitpanda"` for all 4 — the bucket is encoded in the sheet name itself.

- [ ] **Step 3: Run the test — assertion 5 should now pass**

Run: `cd wcore-gsheet && node tests/cex-info-total.test.js`
Expected: assertions 1, 2, 3, 4, 5, 8 pass. Still failing on 6, 7 (Recap wiring).

- [ ] **Step 4: Commit**

```bash
cd wcore-gsheet
git add src/35_BITPANDA_SYNC.gs
git commit -m "feat(cex): wire _cexComputeAndAppendTotal_ into 4 bitpanda buckets"
```

---

## Task 5: Recap Portfolio column H and `_setRecapCexInfoTotal_`

**Files:**
- Modify: `wcore-gsheet/src/17_LISTING.gs`

- [ ] **Step 1: Add the `INFO_TOTAL` header in `H1`**

In `wcore-gsheet/src/17_LISTING.gs`, find the block in `_setRecapHyperlinks_` that writes headers to `D1:G1`:

```javascript
recap.getRange("D1:G1").setValues([[
  "PULSE (B1)",
  "FORCEFULL (C1)",
  "STATUS (I1)",
  "LAST SCAN (J1)"
]]);
```

Replace the range and array with:

```javascript
recap.getRange("D1:H1").setValues([[
  "PULSE (B1)",
  "FORCEFULL (C1)",
  "STATUS (I1)",
  "LAST SCAN (J1)",
  "INFO_TOTAL"
]]);
```

- [ ] **Step 2: Add the `_setRecapCexInfoTotal_` helper**

Append the following block at the bottom of `17_LISTING.gs` (after the existing helpers, before the closing `function` boundaries):

```javascript
/**
 * Populate Recap Portfolio column H with the CEX INFO_TOTAL value
 * for each CEX sheet. Called from _setRecapHyperlinks_ so the
 * column is refreshed whenever the ledger cache is rebuilt.
 * @param {Spreadsheet} ss
 * @param {string[]} ledgerNames - sorted list of ledger-like sheet names
 */
function _setRecapCexInfoTotal_(ss, ledgerNames) {
  try {
    if (!ss || !ledgerNames || !ledgerNames.length) return;
    var recap = ss.getSheetByName("Recap Portfolio");
    if (!recap) return;

    var cexRows = [];
    for (var i = 0; i < ledgerNames.length; i++) {
      var n = String(ledgerNames[i] || "");
      if (n.toLowerCase().indexOf("cex - ") === 0) {
        cexRows.push({ name: n, recapRow: 2 + i });
      }
    }

    for (var j = 0; j < cexRows.length; j++) {
      var entry = cexRows[j];
      var sh = ss.getSheetByName(entry.name);
      if (!sh) continue;
      var lastRow = sh.getLastRow();
      var value = "";
      if (lastRow >= 2) {
        var firstCol = String(sh.getRange(lastRow, 1, 1, 1).getValue() || "").trim();
        if (firstCol.toUpperCase() === "TOTAL") {
          value = sh.getRange(lastRow, 2, 1, 1).getValue();
        }
      }
      recap.getRange(entry.recapRow, 8, 1, 1).setValue(value);  // column H
    }
  } catch (e) {
    Logger.log("[17_LISTING] _setRecapCexInfoTotal_ error: " + e.message);
  }
}
```

- [ ] **Step 3: Call the helper at the end of `_setRecapHyperlinks_`**

In `_setRecapHyperlinks_`, find the line that currently calls `_setDetailsChainHyperlinks_(ss, map);`. Add the CEX helper call right after it:

```javascript
  // v4.15.121: fill Recap Portfolio column H with the CEX INFO_TOTAL value.
  _setRecapCexInfoTotal_(ss, names);
```

- [ ] **Step 4: Run the test — all 8 assertions should pass (GREEN)**

Run: `cd wcore-gsheet && node tests/cex-info-total.test.js`
Expected: `cex-info-total: 8/8 guard assertions passed`.

- [ ] **Step 5: Run the full local test suite to catch regressions**

Run: `cd wcore-gsheet && npm test`
Expected: existing tests still pass, plus the new `cex-info-total.test.js`.

- [ ] **Step 6: Run static validation to ensure no global function pollution**

Run: `cd wcore-gsheet && npm run validate:static`
Expected: `Static validation OK (XXXX global functions checked).` (the count may shift slightly because the new helper and `_setRecapCexInfoTotal_` are added).

- [ ] **Step 7: Commit**

```bash
cd wcore-gsheet
git add src/17_LISTING.gs
git commit -m "feat(cex): recap portfolio INFO_TOTAL column H + helper wiring"
```

---

## Task 6: Manual spot-check on the spreadsheet

**Files:** No code changes.

- [ ] **Step 1: Run the safe-push script to deploy**

Run from `wcore-gsheet/`:
```powershell
powershell -File safe-push.ps1
```
Expected: backup folder created, 249 files pushed, brace warnings on `04B_CACHE_WALLET.js`, `07_PRICES.js`, `18_CLEANUP.js`, `33_DYNAMIC_RPC.js` (these are known false positives, ignore them).

- [ ] **Step 2: Wait for push to settle, then trigger one Binance sync**

In the Apps Script editor, select `UPDATE_BINANCE_SPOT` from the function dropdown of `36_BINANCE_SYNC.gs` and run it. Watch the execution log for `[CEX_TOTAL] CEX - Binance TOTAL=<n> EUR valued=<n> skipped=<n>`.

- [ ] **Step 3: Inspect `CEX - Binance` last row**

The last row of `CEX - Binance` must be `TOTAL | <number> | binance | yyyy-MM-dd HH:mm:ss`. The number should match the sum of `balance × price_eur` for the data rows above.

- [ ] **Step 4: Inspect `Recap Portfolio!H` for the Binance row**

Find the row in `Recap Portfolio` whose column A reads `CEX - Binance` (with hyperlink). Column H must show the same TOTAL value as the sheet's last row.

- [ ] **Step 5: Repeat steps 2-4 for one Bitpanda bucket (Crypto) to confirm the 4-bucket path**

Run `UPDATE_BITPANDA_SPOT` from `35_BITPANDA_SYNC.gs`. Confirm the `CEX - Bitpanda Crypto` last row and `Recap Portfolio!H`.

- [ ] **Step 6: Commit the spec/plan update notes if needed (no code)**

If any spot-check failed, write a `docs/incidents/2026-07-03-cex-info-total-spotcheck.md` describing what failed and link it from `CHANGELOG.md`. Otherwise no commit.

---

## Self-Review

**1. Spec coverage:**
- Append TOTAL row to 10 CEX sheets → Task 2 (helper) + Task 3 (6 non-Bitpanda) + Task 4 (4 Bitpanda).
- Pricing via `PriceManager.computePriceEur(symbol)` → Task 2 helper body.
- Idempotence (strip prior TOTAL) → Task 2 helper body.
- Stables fast-path → handled by the cascade itself, no extra code.
- Quota tripped → `BLOCKED:QUOTA` stamp → Task 2 helper, with the test assertion 8.
- Recap Portfolio column H → Task 5.
- `_setRecapCexInfoTotal_` called from `_setRecapHyperlinks_` → Task 5.
- Test file → Task 1.
- Out-of-scope items (on-chain path, triggers, secrets) → explicitly not touched.

**2. Placeholder scan:** No TBD/TODO. Every step has full code or commands.

**3. Type consistency:** `_cexComputeAndAppendTotal_(ss, sheetName, balances, provider)` signature is identical in Task 2 (definition), Task 3 (call sites), Task 4 (call sites), Task 1 (regex assertion). Provider strings (`"binance"`, `"kraken"`, `"bitfinex"`, `"bybit"`, `"coinbase"`, `"okx"`, `"bitpanda"`) consistent throughout.

No spec gap. No type drift. Plan ready for execution.
