# Canonical Stock Pricing Harmonization Implementation Plan

> **Status 2026-07-13:** Implemented/in verification. Related stock API, relay, and GSheet changes are present in the current worktree. Keep this file as execution provenance; verify code/tests before using unchecked boxes as active work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep CompaniesMarketCap as the Top 300 universe while making WCORE the sole producer of reliable EUR stock prices consumed by `Google Finance`, `Action Rebalancing`, and `CEX - Bitpanda Stocks`.

**Architecture:** A focused WCORE stock module owns CompaniesMarketCap parsing, canonical mappings, native Yahoo quotes, canonical FX conversion, drift validation, and last-known-good cache semantics. An authenticated snapshot endpoint serves the Top 300, while the existing bounded CEX stock route delegates to the same module. Apps Script validates and atomically writes static values with headers on row 1 and data from row 2, preserving `Ignore` during the legacy-layout migration.

**Tech Stack:** TypeScript, Fastify 5, Node test runner/tsx, `@wcore/core` FX and cache, Express relay, Google Apps Script, Google Sheets advanced API.

**Constraint:** Do not commit or deploy. The worktree contains unrelated user changes; modify only scoped files and never regenerate or edit the untracked `.js` mirrors under `wcore-gsheet/src`.

---

## File Map

### New WCORE files

- `wcore-web/apps/api/src/stocks/mappings.ts`: canonical exchange, Yahoo and Bitpanda alias data plus explicit ratio metadata.
- `wcore-web/apps/api/src/stocks/top-market-cap.ts`: pure CompaniesMarketCap parser, normalized row builder and snapshot validation.
- `wcore-web/apps/api/src/stocks/stock-pricing.ts`: native quote conversion, source drift resolution and last-known-good semantics.
- `wcore-web/apps/api/src/stocks/stock-service.ts`: relay batching, CompaniesMarketCap fetch, FX retrieval, cache and snapshot orchestration.
- `wcore-web/apps/api/src/plugins/stocks.ts`: authenticated Top 300 route.
- `wcore-web/apps/api/src/stocks/*.test.ts`: pure, service and route tests.
- `wcore-gsheet/tests/top-marketcap-snapshot.test.js`: static/runtime guards for snapshot validation, layout and migration.

### Modified WCORE files

- `wcore-web/apps/api/src/cex/stock-relay.ts`: add native quote relay client while preserving the existing EUR response client.
- `wcore-web/apps/api/src/plugins/cex.ts`: delegate `bucket=stocks` and account stock pricing to the canonical stock service.
- `wcore-web/apps/api/src/server.ts`: register the stock plugin and share one service instance with CEX.
- `wcore-web/packages/shared/src/cache-key-registry.ts`: register stock snapshot and last-good cache keys.
- `wcore-gsheet/railway-relay/server.js`: expose native Yahoo quote/currency data, remove fixed FX and ratio application from the canonical path.
- `wcore-gsheet/railway-relay/server.test.js`: relay quote and mapping tests.

### Modified GSheet files

- `wcore-gsheet/src/34_TOP_MARKETCAP.gs`: replace CSV/formula generation with authenticated snapshot consumption and row-1 static layout.
- `wcore-gsheet/src/35_BITPANDA_SYNC.gs`: consume WCORE stock prices without local aliases or double ratios.
- `wcore-gsheet/package.json`: replace the obsolete currency-formula test with snapshot/layout guards.
- `wcore-gsheet/docs/top-marketcap-google-finance.md`, `wcore-gsheet/AGENTS.md`, root audits/roadmaps: document the canonical flow and fresh verification evidence.

---

### Task 1: Lock the Canonical Stock Domain

**Files:**
- Create: `wcore-web/apps/api/src/stocks/mappings.ts`
- Create: `wcore-web/apps/api/src/stocks/top-market-cap.ts`
- Create: `wcore-web/apps/api/src/stocks/top-market-cap.test.ts`

- [ ] **Step 1: Write failing parser and mapping tests**

Cover quoted CSV fields, malformed rows, Top N bounds, exchange mappings, unsupported exchanges, aliases and Toyota supply normalization. The tests must include these explicit decisions:

```ts
assert.equal(mapTopMarketCapTicker("000660.KS").canonicalTicker, "KRX:000660");
assert.deepEqual(getBitpandaAliases("KRX:000660"), ["HYXS"]);
assert.equal(getBitpandaSecurity("TSFA").canonicalTicker, "TPE:2330");
assert.equal(getBitpandaSecurity("ROG").yahooTicker, "RO.SW");
assert.equal(normalizeSupply("TM", 100), 1_000);
```

`TSFA` is fixed to Taiwan Semiconductor (`2330.TW`/`TPE:2330`), not Tesla. Samsung receipt metadata records `unitsPerReceipt: 25` but does not modify the canonical ordinary-share price.

- [ ] **Step 2: Run the domain test and verify RED**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/stocks/top-market-cap.test.ts
```

Expected: FAIL because the stock domain files do not exist.

- [ ] **Step 3: Implement pure mappings and parser**

Define stable interfaces:

```ts
export interface CanonicalStockMapping {
  canonicalTicker: string;
  yahooTickers: string[];
  bitpandaAliases: string[];
  expectedCurrency?: string;
  unitsPerReceipt?: number;
  supplyMultiplier?: number;
}

export interface TopMarketCapSourceRow {
  rank: number;
  company: string;
  sourceTicker: string;
  marketCapUsd: number;
  priceUsd: number;
  country: string;
}
```

Parse headers by normalized name when present and retain the tested positional fallback for the current CSV. Reject non-finite/non-positive rank, market cap and price values. Deduplicate by canonical ticker and stop at the server-controlled limit.

- [ ] **Step 4: Run the domain test and verify GREEN**

Expected: all parser and mapping tests pass.

---

### Task 2: Return Native Quotes From the Relay

**Files:**
- Modify: `wcore-gsheet/railway-relay/server.js`
- Modify: `wcore-gsheet/railway-relay/server.test.js`
- Modify: `wcore-web/apps/api/src/cex/stock-relay.ts`
- Modify: `wcore-web/apps/api/src/cex/stock-relay.test.ts`

- [ ] **Step 1: Add failing relay tests**

Test a pure quote collector that returns native values without FX or business ratios:

```js
assert.deepEqual(quotes.HYXS, {
  priceNative: 2180000,
  currency: "KRW",
  yahooTicker: "000660.KS",
  source: "yahoo:relay"
});
```

Also assert that `SSU` is not multiplied by 25 in the native quote endpoint and that no fixed `1.08` fallback is present in that path.

- [ ] **Step 2: Run relay tests and verify RED**

```powershell
rtk node --test server.test.js
```

Expected: FAIL because `/stock/quotes` and exported quote helpers do not exist.

- [ ] **Step 3: Add `/stock/quotes` compatibly**

Keep `/stock/prices` unchanged for deployed-client compatibility. Add `POST /stock/quotes`, protected by the existing timing-safe relay token check, with a maximum of 300 validated symbols. Return:

```json
{
  "ok": true,
  "quotes": {
    "HYXS": {
      "priceNative": 2180000,
      "currency": "KRW",
      "yahooTicker": "000660.KS",
      "source": "yahoo:relay"
    }
  }
}
```

Use the existing explicit candidate map. Add an `AbortSignal.timeout` equivalent supported by the Node relay fetch calls and bounded worker concurrency instead of the current sequential loop.

- [ ] **Step 4: Add the TypeScript quote client**

Export:

```ts
export interface StockNativeQuote {
  priceNative: number;
  currency: string;
  yahooTicker: string;
  source: string;
}

export async function fetchStockQuotesViaRelay(
  symbols: string[],
  deps: StockRelayDeps,
): Promise<Record<string, StockNativeQuote>>;
```

Validate all returned fields and drop malformed quotes.

- [ ] **Step 5: Run relay and TypeScript client tests**

Expected: all focused relay tests pass.

---

### Task 3: Implement Canonical EUR Price Resolution

**Files:**
- Create: `wcore-web/apps/api/src/stocks/stock-pricing.ts`
- Create: `wcore-web/apps/api/src/stocks/stock-pricing.test.ts`

- [ ] **Step 1: Write failing conversion and drift tests**

Cover `KRW`, `GBp`, `CHF`, `JPY`, `USD`, `EUR`, unknown/missing currency, exact ratio handling and the 15% drift boundary. Lock the original regression:

```ts
const result = resolveStockPrice({
  quote: { priceNative: 2_180_000, currency: "KRW", yahooTicker: "000660.KS", source: "yahoo:relay" },
  nativeToEur: 1 / 1717.17,
  companiesMarketCapPriceEur: 1_270,
  lastGood: null,
});
assert.ok(result.priceEur! > 1_200 && result.priceEur! < 1_400);
```

Unknown currency must produce no fresh price. It must never default to USD.

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because `resolveStockPrice` does not exist.

- [ ] **Step 3: Implement the pure resolver**

Return this stable result shape:

```ts
export interface ResolvedStockPrice {
  priceNative: number | null;
  currency: string | null;
  priceEur: number | null;
  priceSource: string | null;
  fallbackSource: string | null;
  appliedRatio: number;
  stale: boolean;
  updatedAt: string;
  errors: Array<{ code: string; message: string }>;
}
```

Use relative drift `Math.abs(a - b) / Math.max(a, b)`. At `<= 0.15`, keep Yahoo primary. Above `0.15`, use a last-good price if available; otherwise return `null` with `source_drift`. Do not average conflicting prices.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all resolver tests pass.

---

### Task 4: Build the Cached Stock Service and Snapshot

**Files:**
- Create: `wcore-web/apps/api/src/stocks/stock-service.ts`
- Create: `wcore-web/apps/api/src/stocks/stock-service.test.ts`
- Modify: `wcore-web/packages/shared/src/cache-key-registry.ts`
- Modify: corresponding cache registry tests

- [ ] **Step 1: Write failing service tests**

Inject fetch, relay, FX and cache dependencies. Cover:

- one CompaniesMarketCap request per snapshot;
- one relay quote batch for all Top N symbols;
- one FX snapshot reused across all rows;
- fresh row cache and long-lived last-good cache;
- stale full snapshot on total upstream failure;
- malformed/truncated CSV never replaces last-good;
- cache write failure does not fail a healthy response;
- lock contention serves cache rather than issuing another refresh;
- Top N and CEX explicit-symbol pricing produce the same `priceEur` for the same canonical security.

- [ ] **Step 2: Run service tests and verify RED**

Expected: FAIL because `CanonicalStockService` does not exist.

- [ ] **Step 3: Register canonical cache keys**

Add registry entries for:

```text
stock:price:{canonicalTicker}:fresh
stock:price:{canonicalTicker}:last-good
stock:top-market-cap:fresh
stock:top-market-cap:last-good
stock:top-market-cap:lock
```

Fresh per-security price and complete snapshot TTLs are 1 hour. Last-good data uses a 30-day TTL so expiration of the fresh key does not destroy the stale fallback. The service checks timestamps itself.

- [ ] **Step 4: Implement `CanonicalStockService`**

Expose:

```ts
interface CanonicalStockService {
  getTopMarketCapSnapshot(limit?: number): Promise<TopMarketCapSnapshot>;
  getPricesForBitpandaSymbols(symbols: string[]): Promise<Record<string, ResolvedStockPrice>>;
}
```

Use `getEurUsdRate({ cache })`. Obtain non-USD currency rates once per distinct currency through the relay quote infrastructure or a dedicated injected FX resolver; never call FX once per row. Validate a complete snapshot before updating last-good.

- [ ] **Step 5: Run service, core FX and cache registry tests**

Expected: all focused tests pass.

---

### Task 5: Expose the Authenticated Snapshot and Reuse the Service in CEX

**Files:**
- Create: `wcore-web/apps/api/src/plugins/stocks.ts`
- Create: `wcore-web/apps/api/src/plugins/stocks.test.ts`
- Modify: `wcore-web/apps/api/src/plugins/cex.ts`
- Modify: `wcore-web/apps/api/src/cex/pricing.test.ts`
- Modify: `wcore-web/apps/api/src/server.ts`

- [ ] **Step 1: Write failing route tests**

Test:

- 401 without `x-gsheet-token`;
- 401 when `GSHEET_API_TOKEN` is unset;
- successful fixed Top 300 response;
- caller cannot provide symbols or upstream URL;
- 503 only when no fresh or last-good snapshot exists;
- `/api/cex/prices?bucket=stocks` still caps at 50 and delegates to the same service;
- account stock pricing batches rows through the same service and preserves stock-before-crypto collision protection.

- [ ] **Step 2: Run route tests and verify RED**

Expected: FAIL because the stock plugin and service dependency do not exist.

- [ ] **Step 3: Add `GET /api/gsheet/stocks/top-market-cap`**

Use the existing GSheet token convention. Return the service snapshot and no user-selected URL or symbols. Register the plugin only when `GSHEET_API_TOKEN` is configured, consistent with the existing GSheet integration.

- [ ] **Step 4: Inject one service instance into both plugins**

Create the service once in `server.ts`, then pass it to `stocksPlugin` and `cexPlugin`. Remove direct stock relay/cache orchestration from `cex.ts` only after focused tests prove parity.

- [ ] **Step 5: Run API tests, typecheck and targeted lint**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/stocks/*.test.ts src/cex/pricing.test.ts src/cex/normalizers.test.ts src/cex/stock-relay.test.ts
rtk pnpm --dir apps/api typecheck
rtk pnpm exec eslint apps/api/src/stocks apps/api/src/plugins/stocks.ts apps/api/src/plugins/cex.ts apps/api/src/cex/stock-relay.ts
```

Expected: all tests pass, no TypeScript or targeted ESLint errors.

---

### Task 6: Add a Migration-Safe GSheet Snapshot Consumer

**Files:**
- Modify: `wcore-gsheet/src/34_TOP_MARKETCAP.gs`
- Replace: `wcore-gsheet/tests/top-marketcap-currency-fallback.test.js` with `wcore-gsheet/tests/top-marketcap-snapshot.test.js`
- Modify: `wcore-gsheet/package.json`

- [ ] **Step 1: Write failing layout and validation guards**

The new test must prove:

```text
HEADER_ROW = 1
FIRST_ROW = 2
headers A:T are exact
no GOOGLEFINANCE
no CSV_URL or CompaniesMarketCap fetch in GAS
no FX range A1:C10
no hardcoded exchange currency fallback
snapshot auth uses x-gsheet-token
invalid snapshots write neither Google Finance nor Action Rebalancing
legacy Ignore M12:M311 is read before migration
new Ignore M2:M301 is preserved after migration
```

Add the new script to `npm test` and remove the obsolete formula-fallback script.

- [ ] **Step 2: Run the GSheet test and verify RED**

```powershell
rtk npm run test:top-marketcap-snapshot
```

Expected: FAIL against the formula-based implementation.

- [ ] **Step 3: Implement authenticated fetch and strict validation**

Use `WCORE_WEB_API_URL`, `GSHEET_API_TOKEN` and `x-gsheet-token`. Validate:

- `ok === true`;
- exactly 300 rows for the visible migration;
- unique ranks and canonical tickers;
- finite positive rank, supply and market caps;
- `priceEur` positive or explicitly `null` only when accompanied by errors;
- stats sum to row count;
- no cell string begins with `=`.

Return before any business write on failure.

- [ ] **Step 4: Implement migration-aware Ignore preservation**

Detect the layout from row-1/row-11 headers. On first migration read legacy `A12:M311`; afterward read new `A2:M301`. Preserve by canonical ticker first and normalized company name second.

- [ ] **Step 5: Build one static A:T matrix**

Keep D as `Price EUR`, G as `Market Cap EUR`, L as `Company`, and M as `Ignore` so existing Action Rebalancing lookups remain compatible. Use:

```text
A Canonical Ticker
B Price Native
C Currency
D Price EUR
E Price Source
F Fallback Source
G Market Cap EUR
H Rank
I Supply
J Market Cap USD
K Country
L Company
M Ignore
N Updated At
O Stale
P Applied Ratio
Q Source Ticker
R Yahoo Ticker
S Bitpanda Aliases
T Errors
```

- [ ] **Step 6: Atomically write both managed tables**

Build the complete `Google Finance` and `Action Rebalancing` matrices before writing. Use a single Sheets advanced API batch request for values, legacy-layout clearing and new data. Apply checkbox validation and formatting only after the value batch succeeds. On any fetch/schema failure, leave both existing tables untouched and write only a refresh status outside the managed data range.

- [ ] **Step 7: Run GSheet focused and static validation**

```powershell
rtk npm run test:top-marketcap-snapshot
rtk npm run test:action-rebalancing-refresh
rtk npm run validate:static
```

Expected: all pass and no `GOOGLEFINANCE` remains in `34_TOP_MARKETCAP.gs`.

---

### Task 7: Eliminate Bitpanda Stock Duplication and Double Ratios

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs`
- Modify: `wcore-gsheet/tests/cex-info-total.test.js`
- Modify: `wcore-gsheet/tests/cex-refresh-load-guard.test.js`
- Modify: `wcore-gsheet/package.json`

- [ ] **Step 1: Write failing parity and ratio tests**

Prove:

- WCORE stock output is primary;
- `Action Rebalancing` is not independently repriced;
- `HYXS` uses the same canonical price as `KRX:000660`;
- Samsung `SSU`/`SMSN` ratio is applied exactly once;
- Toyota uses the ordinary-share price and normalized supply exactly once;
- symbols outside Top 300 still use the bounded CEX stock adapter;
- crypto homonyms never price stock rows.

- [ ] **Step 2: Run tests and verify RED**

Expected: at least the Samsung double-ratio and WCORE-primary assertions fail.

- [ ] **Step 3: Remove duplicated stock pricing data from GAS**

Remove local exchange/alias/ratio pricing tables only after the snapshot/API returns required aliases and canonical fields. Keep ingestion-only aliases needed to normalize raw Bitpanda balances, but source them from one generated/canonical mapping where possible.

For CEX values, consume the per-unit Bitpanda price returned by WCORE. Do not multiply a canonical receipt-adjusted price and quantity by the same ratio.

- [ ] **Step 4: Run CEX and queue guards**

```powershell
rtk npm run test:cex-info-total
rtk npm run test:cex-refresh-load
rtk npm run test:action-rebalancing-refresh
```

Expected: all pass.

---

### Task 8: Shadow Comparison and Documentation

**Files:**
- Modify: `wcore-gsheet/docs/top-marketcap-google-finance.md`
- Modify: `wcore-gsheet/AGENTS.md`
- Modify: `docs/AUDIT.md`
- Modify: `ROADMAP.md`
- Modify: `wcore-web/docs/AUDIT.md`
- Modify: `docs/superpowers/specs/2026-07-10-stock-pricing-harmonization-design.md` only if implementation exposes a proven contract correction

- [ ] **Step 1: Add a non-writing comparison diagnostic**

Before live migration, expose a diagnostic that fetches the WCORE snapshot and compares it with the current visible rows without modifying either sheet. Report coverage, stale count, unpriced count and all drifts above 15%.

- [ ] **Step 2: Run the diagnostic against live data without deployment**

If the new endpoint is not deployed, run the same service locally against live CompaniesMarketCap and relay fixtures. Investigate every drift rather than suppressing it.

- [ ] **Step 3: Update living documentation**

Document WCORE ownership, exact A:T layout, source cascade, cache semantics, row migration and operational refresh behavior. Remove claims that GSheet formulas or its FX table remain canonical.

- [ ] **Step 4: Run complete scoped verification**

From `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api test
rtk pnpm --dir apps/api typecheck
rtk pnpm --dir apps/web typecheck
rtk pnpm exec eslint apps/api/src/stocks apps/api/src/plugins/stocks.ts apps/api/src/plugins/cex.ts apps/api/src/cex/stock-relay.ts
```

From `wcore-gsheet`:

```powershell
rtk npm test
rtk node --test railway-relay/server.test.js
```

From repository root:

```powershell
rtk git diff --check
rtk git diff -- wcore-web/apps/api/src/stocks wcore-web/apps/api/src/plugins/stocks.ts wcore-web/apps/api/src/plugins/cex.ts wcore-web/apps/api/src/cex/stock-relay.ts wcore-gsheet/railway-relay/server.js wcore-gsheet/src/34_TOP_MARKETCAP.gs wcore-gsheet/src/35_BITPANDA_SYNC.gs wcore-gsheet/tests docs/AUDIT.md ROADMAP.md
```

Expected: tests/typechecks/lint/static validation pass; diff has no whitespace errors; no unrelated files are reverted or modified.

---

## Completion Conditions

- CompaniesMarketCap remains the Top 300 universe source.
- WCORE is the only producer of final EUR stock prices.
- The Top snapshot and CEX stock adapter share mappings, FX, drift and cache behavior.
- `Google Finance` has headers in row 1, data from row 2, no FX table and no `GOOGLEFINANCE` formulas.
- `Ignore` survives the one-time legacy migration.
- `Action Rebalancing` and `CEX - Bitpanda Stocks` use the canonical WCORE price without circular fallback or double ratios.
- Fresh, stale and missing prices are distinguishable and healthy previous values survive transient failures.
- No commit or deployment is performed in this implementation session.
