# Crypto Portfolio V2 Top5000 Implementation Plan

> **Status 2026-07-13:** Implemented/in verification. `Portefeuille Crypto V2` and `Portefeuille Crypto Details V2` are canonical live tabs, and the legacy tabs have been deleted. Keep this file as execution provenance; verify code/tests before using unchecked boxes as active work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Portefeuille Crypto V2` use a complete Top 5000 universe, auto-add held off-universe rows as rank `5002`, and compute `J1` as the effective CMC rank needed to satisfy `Strat!F18` while respecting Include/Exclude positions.

**Architecture:** Keep `A:T` as the Action-aligned managed portfolio area. The API remains the canonical Top 5000 source; Apps Script composes API rows plus held symbols from `Portefeuille Crypto Details V2`, repairs formulas, and computes the rank boundary from spreadsheet state. Formatting/chart migration is handled through one explicit Sheets API script after source/formula correctness is verified.

**Migration status 2026-07-13:** `Portefeuille Crypto V2` and `Portefeuille Crypto Details V2` are canonical. Live audit found no external formulas, named ranges, or charts referencing legacy `Portefeuille Crypto` / `Portefeuille Crypto Details`; only formulas inside the two legacy tabs referenced each other. The legacy tabs were deleted from `Invest 2.0`.

**Tech Stack:** TypeScript API (`wcore-web/apps/api`), Apps Script source (`wcore-gsheet/src`), Node test scripts, Google Sheets API service account, Railway deploy script.

---

## File Map

- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.ts` - diagnose and fix why live API returns ~3820 instead of 5000 valid rows.
- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts` - add regression coverage for preserving 5000 rows and surfacing partial upstream data.
- Modify: `wcore-gsheet/src/43_CRYPTO_PORTFOLIO.gs` - add Details V2 symbol discovery, rank `5002` generation, formula references to Details V2, finite row cap, and calculated `J1` behavior.
- Modify: `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs` - preserve the same `E1` dependency correction for Stocks: use `J1`, not `F1`; repair formulas after stock refresh.
- Create: `wcore-gsheet/tests/crypto-portfolio-v2.test.js` - static/unit tests for GAS helpers without live Sheets access.
- Optionally modify: `wcore-gsheet/src/16_REFRESH.gs` - only if the existing `A1` edit path needs to call a new repair/refresh function name.
- Create: `C:\Users\strau\AppData\Local\Temp\opencode\apply-crypto-v2-right-side-and-chart.js` - one-off live Sheets API migration for right-side crypto columns and chart.

---

### Task 1: API Top5000 Completeness

**Files:**
- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.ts`
- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts`

- [ ] **Step 1: Add a failing test for partial valid rows below requested limit**

Append this test to `wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts`:

```ts
test("getListingSnapshot rejects partial CMC rows when 5000 were requested", async () => {
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1"],
    fetchImpl: async () => cmcResponse(manyRows(3820)),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });

  await assert.rejects(
    service.getListingSnapshot(5_000),
    /returned 3820 valid rows, expected 5000/
  );
});
```

- [ ] **Step 2: Run the targeted API test and confirm it fails**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/api test -- crypto-listing-service.test.ts
```

Expected: the new test fails because the service currently accepts any response with at least `MIN_VALID_ROWS` instead of requiring the requested count.

- [ ] **Step 3: Tighten the CMC row-count validation**

In `buildSnapshot(limit: number)`, replace the current minimum valid row check:

```ts
if (rows.length < Math.min(MIN_VALID_ROWS, limit)) {
  lastError = `CoinMarketCap returned ${rows.length} valid rows, expected at least ${Math.min(MIN_VALID_ROWS, limit)}`;
  continue;
}
```

with:

```ts
if (rows.length < limit) {
  lastError = `CoinMarketCap returned ${rows.length} valid rows, expected ${limit}`;
  continue;
}
```

- [ ] **Step 4: Run API tests**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/api test -- crypto-listing-service.test.ts
```

Expected: all `crypto-listing-service.test.ts` tests pass.

- [ ] **Step 5: Verify the full API package typecheck**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/api typecheck
```

Expected: no TypeScript errors.

---

### Task 2: GAS Helper Tests for V2 Row Composition

**Files:**
- Create: `wcore-gsheet/tests/crypto-portfolio-v2.test.js`
- Modify: `wcore-gsheet/package.json`

- [ ] **Step 1: Create the helper test file**

Create `wcore-gsheet/tests/crypto-portfolio-v2.test.js` with this content:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "43_CRYPTO_PORTFOLIO.gs"), "utf8");

function loadContext() {
  const context = {
    console,
    SpreadsheetApp: {},
    BITPANDA_SYNC_CONFIG: { SPREADSHEET_ID: "test" },
  };
  vm.createContext(context);
  vm.runInContext(src, context, { filename: "43_CRYPTO_PORTFOLIO.gs" });
  return context;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test("rank 5002 manual rows are appended after API rows", () => {
  const ctx = loadContext();
  const matrix = ctx._cryptoPortfolioBuildMatrix_({
    rows: [
      { canonicalSymbol: "BTC", rank: 1, priceEur: 100, marketCapEur: 1000000, name: "Bitcoin" },
      { canonicalSymbol: "ETH", rank: 2, priceEur: 50, marketCapEur: 500000, name: "Ethereum" },
    ],
  }, [
    { symbol: "WCORE", rank: 5002, priceEur: 1.5, marketCapEur: 0, name: "WCORE" },
  ]);

  assert.equal(matrix.length, 3);
  assert.equal(matrix[2][0], "WCORE");
  assert.equal(matrix[2][1], 5002);
});

test("V2 formulas reference Portefeuille Crypto Details V2", () => {
  const ctx = loadContext();
  const row = Array(ctx.CRYPTO_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN).fill("");
  ctx._cryptoPortfolioApplyFormulasToRow_(row, 3);
  assert.match(row[6], /Portefeuille Crypto Details V2/);
});

test("J1 is emitted as a formula instead of preserving a manual stale rank", () => {
  const ctx = loadContext();
  const row1 = ctx._cryptoPortfolioBuildRow1_([false, "", "", "", "", "", "", "", "", 8]);
  assert.equal(typeof row1[9], "string");
  assert.match(row1[9], /^=/);
});
```

- [ ] **Step 2: Add the test script**

In `wcore-gsheet/package.json`, add this script under `scripts`:

```json
"test:crypto-portfolio-v2": "node tests/crypto-portfolio-v2.test.js"
```

Also include it in the aggregate `test` script after `test:top-marketcap-currency`:

```json
"test": "npm run validate:static && npm run test:watchdog-quota && npm run test:listing-recap-headers && npm run test:web-scan-adapter && npm run test:packed-wallet-cache && npm run test:base-engine-stats && npm run test:wallet-cache-preserve-prices && npm run test:wallet-cache-expand-prices && npm run test:auto-heal-new-ledgers && npm run test:action-rebalancing-refresh && npm run test:cex-refresh-load && npm run test:top-marketcap-currency && npm run test:crypto-portfolio-v2"
```

- [ ] **Step 3: Run the new test and confirm it fails before implementation**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk npm run test:crypto-portfolio-v2
```

Expected: failures for Details V2 references and formula-based `J1` until Task 3 is implemented.

---

### Task 3: Implement Details V2 Rank 5002 Rows and J1 Formula

**Files:**
- Modify: `wcore-gsheet/src/43_CRYPTO_PORTFOLIO.gs`

- [ ] **Step 1: Add finite row and details constants**

Extend `CRYPTO_PORTFOLIO_CONFIG`:

```js
  MAX_ROWS: 6012,
  DETAILS_SHEET_NAME: "Portefeuille Crypto Details V2",
  OFF_UNIVERSE_RANK: 5002,
```

- [ ] **Step 2: Preserve fixed sheet height**

Replace `_cryptoPortfolioEnsureRows_(sh, rowCount)` with:

```js
function _cryptoPortfolioEnsureRows_(sh, rowCount) {
  var needed = Math.max(CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS, CRYPTO_PORTFOLIO_CONFIG.FIRST_DATA_ROW + rowCount - 1);
  if (sh.getMaxRows() < needed) sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows());
  if (sh.getMaxRows() > CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS) {
    var extra = sh.getMaxRows() - CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS;
    sh.deleteRows(CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS + 1, extra);
  }
}
```

- [ ] **Step 3: Read off-universe symbols from Details V2, not old manual V2 rows**

Replace `_cryptoPortfolioReadManualRows_(sh)` with this implementation:

```js
function _cryptoPortfolioReadManualRows_(sh, snapshotRows) {
  var ss = sh.getParent();
  var details = ss.getSheetByName(CRYPTO_PORTFOLIO_CONFIG.DETAILS_SHEET_NAME);
  if (!details) return [];
  var present = {};
  for (var i = 0; i < (snapshotRows || []).length; i++) {
    var apiSymbol = String(snapshotRows[i].canonicalSymbol || "").trim().toUpperCase();
    if (apiSymbol) present[apiSymbol] = true;
  }
  var last = details.getLastRow();
  if (last < 3) return [];
  var values = details.getRange(3, 3, last - 2, 9).getValues();
  var seen = {};
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var symbol = String(values[r][0] || "").trim().toUpperCase();
    if (!symbol || present[symbol] || seen[symbol]) continue;
    seen[symbol] = true;
    rows.push({
      symbol: symbol,
      rank: CRYPTO_PORTFOLIO_CONFIG.OFF_UNIVERSE_RANK,
      priceEur: Number(values[r][1]) || 0,
      marketCapEur: 0,
      name: symbol
    });
  }
  rows.sort(function(a, b) { return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0; });
  return rows;
}
```

- [ ] **Step 4: Pass snapshot rows into manual row discovery**

In `UPDATE_CRYPTO_PORTFOLIO_V2`, replace:

```js
var manualRows = _cryptoPortfolioReadManualRows_(sh);
```

with:

```js
var manualRows = _cryptoPortfolioReadManualRows_(sh, snapshot.rows || []);
```

- [ ] **Step 5: Point formulas to Details V2**

In `_cryptoPortfolioApplyFormulasToRow_`, replace the old details formula:

```js
row[6] = "=IFERROR(SUMIFS('Portefeuille Crypto Details'!K:K;'Portefeuille Crypto Details'!C:C;A" + sheetRow + ";'Portefeuille Crypto Details'!A:A;B" + sheetRow + ")*C" + sheetRow + ";0)";
```

with:

```js
row[6] = "=IFERROR(SUMIFS('Portefeuille Crypto Details V2'!K:K;'Portefeuille Crypto Details V2'!C:C;A" + sheetRow + ";'Portefeuille Crypto Details V2'!A:A;B" + sheetRow + ")*C" + sheetRow + ";0)";
```

- [ ] **Step 6: Compute J1 as the required rank boundary for `Strat!F18`**

In `_cryptoPortfolioBuildRow1_`, replace the current preserved `j1` logic:

```js
var existingJ1 = existingRow1 && existingRow1.length > 9 ? existingRow1[9] : "";
var j1 = (existingJ1 === "" || existingJ1 === null || existingJ1 === undefined) ? 8 : existingJ1;
```

with:

```js
var j1 = "=IFERROR(INDEX(FILTER(B3:B6012;B3:B6012<5002;H3:H6012=0;(SCAN(0;D3:D6012*(H3:H6012=0)*(I3:I6012=0);LAMBDA(acc;v;acc+v))+SUMPRODUCT(D3:D6012*(H3:H6012=0)*(I3:I6012>0)))>=Strat!F18);1);5000)";
```

This formula treats Include rows as already included value, excludes `H=1`, ignores rank `5002` as a boundary candidate, and returns the smallest rank whose effective included market-cap/value reaches `Strat!F18`.

- [ ] **Step 6A: Keep E1 dependent on J1**

In `_cryptoPortfolioBuildRow1_`, ensure the `E1` formula uses `B3:B<=J1`, not `B3:B<=F1`:

```js
"=SUMPRODUCT(D3:D;(H3:H=0)*1;(I3:I>0)*1)+SUMPRODUCT(D3:D;(H3:H=0)*1;(B3:B<=J1)*1)",
```

This preserves the live correction: the covered value must follow the calculated effective rank boundary.

- [ ] **Step 6B: Apply the same E1 correction to Stocks**

In `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs`, ensure `_stockPortfolioBuildRow1_` also uses `B3:B<=J1`, not `B3:B<=F1`:

```js
"=SUMPRODUCT(D3:D;(H3:H=0)*1;(I3:I>0)*1)+SUMPRODUCT(D3:D;(H3:H=0)*1;(B3:B<=J1)*1)",
```

This keeps `Portefeuille Action` aligned with the same boundary semantics.

- [ ] **Step 6C: Repair Stock formulas after refresh**

In `UPDATE_STOCK_PORTFOLIO()`, after resetting `A1` to `false`, call:

```js
REPAIR_STOCK_PORTFOLIO_FORMULAS();
```

This keeps newly inserted Stock rows populated in computed columns and preserves the source-level `E1` correction during refresh workflows.

- [ ] **Step 7: Use finite formula ranges where changed**

Do not globally rewrite every legacy formula in this task. Only changed formulas must use finite `3:6012` ranges. Existing live formulas can be optimized later if they are not part of this behavior change.

- [ ] **Step 8: Run the GAS helper test**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk npm run test:crypto-portfolio-v2
```

Expected: all tests in `crypto-portfolio-v2.test.js` pass.

---

### Task 4: Static Validation and Deploy Prep

**Files:**
- Modify only files changed by Tasks 1-3.

- [ ] **Step 1: Run static GAS validation**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk npm run validate:static
```

Expected: `Static validation OK`.

- [ ] **Step 2: Run targeted GAS tests**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk npm run test:crypto-portfolio-v2
```

Expected: all targeted tests pass.

- [ ] **Step 3: Inspect git diff before deployment**

Run from `C:\Users\strau\WCORE`:

```powershell
rtk git diff -- wcore-web/apps/api/src/crypto/crypto-listing-service.ts wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts wcore-gsheet/src/43_CRYPTO_PORTFOLIO.gs wcore-gsheet/tests/crypto-portfolio-v2.test.js wcore-gsheet/package.json docs/superpowers/specs/2026-07-12-crypto-portfolio-v2-top5000-design.md docs/superpowers/plans/2026-07-12-crypto-portfolio-v2-top5000.md
```

Expected: only intended changes are present.

---

### Task 5: Deploy API and GAS

**Files:**
- No new source edits unless deployment verification exposes a defect.

- [ ] **Step 1: Deploy API**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk powershell -File scripts\deploy.ps1 -Service api
```

Expected: Railway API deployment succeeds.

- [ ] **Step 2: Verify API Top5000 live response**

Run a service-token request using the known local token source. If the token is not in the environment, set it manually for this shell first.

```powershell
rtk node -e "const token=process.env.GSHEET_API_TOKEN;if(!token) throw new Error('GSHEET_API_TOKEN missing');fetch('https://api-production-b5bf.up.railway.app/api/gsheet/crypto/portfolio',{headers:{'x-gsheet-token':token}}).then(r=>r.json()).then(j=>console.log(JSON.stringify({ok:j.ok,rows:j.rows&&j.rows.length,first:j.rows&&j.rows[0],last:j.rows&&j.rows[j.rows.length-1]},null,2)))"
```

Expected: `rows` is `5000`. If it is still ~3820, inspect the returned error/stale flag and cache behavior before deploying GAS.

- [ ] **Step 3: Deploy GAS with safe push**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk powershell -File safe-push.ps1
```

Expected: safe push succeeds and reports backup path.

- [ ] **Step 4: Re-authorize triggers if needed**

Because `clasp run` is unreliable for this project, execute `WCORE_AUTO_HEAL_FORCE()` from the Apps Script editor if triggers need fresh authorization after push.

Expected: `WCORE_AUTO_HEAL_STATUS()` reports required triggers present.

---

### Task 6: Live Sheets Migration for Right-Side Columns and Chart

**Files:**
- Create: `C:\Users\strau\AppData\Local\Temp\opencode\apply-crypto-v2-right-side-and-chart.js`

- [ ] **Step 1: Create the one-off migration script**

Create the temp script with service-account auth. The script must perform these live operations in this order:

```text
1. Read spreadsheet metadata for sheet IDs.
2. Verify right-side formulas/formats on `Portefeuille Crypto V2`.
3. Verify no external references remain to deleted legacy `Portefeuille Crypto` or `Portefeuille Crypto Details`.
4. Verify the crypto chart on `Portefeuille Crypto V2` uses V2 ranges.
5. Keep all ranges finite to row 6012.
6. Do not modify `Portefeuille Action`.
```

The script must use `google-auth-library` and the service account at `C:\Users\strau\.config\gsheets-mcp\service-account.json`.

- [ ] **Step 2: Run the migration script**

Run from `C:\Users\strau\WCORE`:

```powershell
rtk node C:\Users\strau\AppData\Local\Temp\opencode\apply-crypto-v2-right-side-and-chart.js
```

Expected: script logs copied ranges and created chart ID.

- [ ] **Step 3: Verify V2 structure live**

Use the Google Sheets API or MCP metadata to verify:

```text
Portefeuille Crypto V2 rows = 6012
Portefeuille Crypto V2 columns >= 28
Portefeuille Crypto V2 T:T visible
Portefeuille Crypto V2 has a chart
Portefeuille Action unchanged
```

---

### Task 7: Final Verification

**Files:**
- No edits expected.

- [ ] **Step 1: Refresh V2 live**

Trigger `Portefeuille Crypto V2!A1 = TRUE` manually in Sheets or call `UPDATE_CRYPTO_PORTFOLIO_V2()` from Apps Script editor.

Expected: `B1` becomes a fresh timestamp and `A1` returns to `FALSE`.

- [ ] **Step 2: Verify live row counts and off-universe rows**

Read these values from `Portefeuille Crypto V2`:

```text
COUNTIF(B3:B6012,"<=5000") = 5000
COUNTIF(B3:B6012,5002) >= 0
COUNTBLANK(A3:A5002) = 0
```

Expected: Top 5000 is present; off-universe rows appear only for symbols from `Details V2` absent from API.

- [ ] **Step 3: Verify J1 behavior**

Inspect `Portefeuille Crypto V2!J1`:

```text
J1 is a formula
J1 result is between 1 and 5000
Changing an Exclude row before J1 increases or preserves J1
Changing an Include row after J1 decreases or preserves J1 when its market cap/value contributes to Strat!F18
Rows with B=5002 do not become the J1 result
```

- [ ] **Step 4: Run final local verification**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/api typecheck
```

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk npm run validate:static
rtk npm run test:crypto-portfolio-v2
```

Expected: all commands pass.

---

## Self-Review

- Spec coverage: Top5000 API, rank `5002`, Details V2 wiring, `J1` as rank boundary for `Strat!F18`, finite `6012` rows, right-side columns/chart, and deployment verification are covered.
- Placeholder scan: no TBD/TODO markers remain. The one-off live Sheets migration is intentionally specified as ordered live API operations because exact chart IDs and source ranges must be read from spreadsheet metadata at execution time.
- Type consistency: API tests use existing `CanonicalCryptoService`; GAS tests load existing `43_CRYPTO_PORTFOLIO.gs`; new config names are consistently `DETAILS_SHEET_NAME`, `MAX_ROWS`, and `OFF_UNIVERSE_RANK`.
