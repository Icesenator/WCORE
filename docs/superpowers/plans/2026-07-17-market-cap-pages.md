# Market Cap Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename and redesign the crypto and stock market-cap routes as responsive WCORE ranking dashboards with exact logos, snapshot context, search, and pagination.

**Architecture:** Keep the existing public routes and canonical listing services. Add small API presentation helpers for optional branding fields and pure web helpers for filtering, totals, and pagination, then rebuild the shared client component around those contracts.

**Tech Stack:** TypeScript, Fastify, Next.js 16, React 19, Tailwind CSS, Node test runner.

---

## File Structure

### Create

- `wcore-web/apps/api/src/market-cap/presentation.ts`: maps canonical crypto/stock rows to the public market-cap contract and constructs source logo URLs.
- `wcore-web/apps/api/src/market-cap/presentation.test.ts`: verifies exact branding fields and safe optional behavior.
- `wcore-web/apps/web/app/cmc/market-cap.ts`: pure response types, filtering, aggregate, and pagination helpers.
- `wcore-web/apps/web/__tests__/market-cap.test.ts`: verifies the pure table behavior and public labels.

### Modify

- `wcore-web/apps/api/src/crypto/crypto-listing-service.ts`: preserve the CoinMarketCap numeric ID on each row.
- `wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts`: verify ID propagation and cache validation.
- `wcore-web/apps/api/src/server.ts`: use presentation helpers and expose `stale`, `logoUrl`, and stock `country`.
- `wcore-web/apps/web/app/cmc/CmcTableClient.tsx`: responsive ranking dashboard UI.
- `wcore-web/apps/web/app/cmc/crypto/page.tsx`: Market Cap Crypto metadata and copy.
- `wcore-web/apps/web/app/cmc/stocks/page.tsx`: Market Cap Stock metadata and copy.
- `wcore-web/apps/web/components/Sidebar.tsx`: renamed navigation labels.

---

### Task 1: Enrich The Public Market Cap Contract

**Files:**
- Create: `wcore-web/apps/api/src/market-cap/presentation.ts`
- Create: `wcore-web/apps/api/src/market-cap/presentation.test.ts`
- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.ts`
- Modify: `wcore-web/apps/api/src/crypto/crypto-listing-service.test.ts`
- Modify: `wcore-web/apps/api/src/server.ts`

- [x] **Step 1: Write failing tests for crypto IDs and presentation mapping**

Add service coverage asserting that a CMC payload entry with `id: 1` produces `row.id === 1`. Add presentation tests equivalent to:

```ts
assert.deepEqual(toCryptoMarketCapRow({ id: 1, rank: 1, symbol: "BTC", name: "Bitcoin", priceEur: 50_000, marketCapEur: 1_000_000 }), {
  rank: 1,
  symbol: "BTC",
  name: "Bitcoin",
  priceEur: 50_000,
  marketCapEur: 1_000_000,
  logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
});

assert.equal(toStockMarketCapRow({
  rank: 1,
  company: "NVIDIA",
  country: "USA",
  sourceTicker: "NVDA",
  canonicalTicker: "NVDA",
  priceEur: 170,
  marketCapEur: 4_000_000_000_000,
} as StockSnapshotRow).logoUrl, "https://companiesmarketcap.com/img/company-logos/64/NVDA.png");
```

- [x] **Step 2: Run tests to verify the contract is missing**

Run:

```powershell
rtk node --import tsx --test src/market-cap/presentation.test.ts src/crypto/crypto-listing-service.test.ts
```

Expected: FAIL because the presentation module and crypto `id` field do not exist.

- [x] **Step 3: Implement the minimal API presentation layer**

Extend `CryptoListingRow` with `id: number`, parse a positive integer `entry.id`, validate it in cached snapshots, and preserve it through slicing. Implement:

```ts
export function toCryptoMarketCapRow(row: CryptoListingRow) {
  return {
    rank: row.rank,
    symbol: row.symbol,
    name: row.name,
    priceEur: row.priceEur,
    marketCapEur: row.marketCapEur,
    logoUrl: `https://s2.coinmarketcap.com/static/img/coins/64x64/${row.id}.png`,
  };
}

export function toStockMarketCapRow(row: StockSnapshotRow) {
  const ticker = encodeURIComponent(row.sourceTicker.trim());
  return {
    rank: row.rank,
    symbol: row.canonicalTicker,
    name: row.company,
    priceEur: row.priceEur,
    marketCapEur: row.marketCapEur,
    country: row.country || undefined,
    logoUrl: ticker ? `https://companiesmarketcap.com/img/company-logos/64/${ticker}.png` : undefined,
  };
}
```

Use these functions in `/api/cmc/crypto` and `/api/cmc/stocks`. Include `stale: snapshot.stale` in both responses. Keep `generatedAt`, `ok`, and all existing fields unchanged.

- [x] **Step 4: Run focused API tests and typecheck**

Run:

```powershell
rtk node --import tsx --test src/market-cap/presentation.test.ts src/crypto/crypto-listing-service.test.ts
rtk pnpm --filter @wcore/api typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

---

### Task 2: Add Pure Ranking Helpers

**Files:**
- Create: `wcore-web/apps/web/app/cmc/market-cap.ts`
- Create: `wcore-web/apps/web/__tests__/market-cap.test.ts`

- [x] **Step 1: Write failing tests for filter, total, and pagination**

Cover case-insensitive symbol/name/country search, null market caps, page clamping, and 100-row pages:

```ts
assert.deepEqual(filterMarketCapRows(rows, "btc").map((row) => row.symbol), ["BTC"]);
assert.equal(totalMarketCap(rows), 1_500);
assert.deepEqual(paginateMarketCapRows(rows301, 2, 100), { rows: rows301.slice(100, 200), page: 2, totalPages: 4 });
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```powershell
rtk node --import tsx --test __tests__/market-cap.test.ts
```

Expected: FAIL because `app/cmc/market-cap.ts` does not exist.

- [x] **Step 3: Implement pure helpers**

Define `MarketCapRow`, `MarketCapResponse`, `MarketKind`, `PAGE_SIZE = 100`, `filterMarketCapRows`, `totalMarketCap`, and `paginateMarketCapRows`. Pagination must clamp the requested page to `1..totalPages`, with one page for an empty result.

- [x] **Step 4: Run the helper tests**

Run:

```powershell
rtk node --import tsx --test __tests__/market-cap.test.ts
```

Expected: all tests pass.

---

### Task 3: Build The Responsive Ranking Dashboard

**Files:**
- Modify: `wcore-web/apps/web/app/cmc/CmcTableClient.tsx`
- Modify: `wcore-web/apps/web/app/cmc/crypto/page.tsx`
- Modify: `wcore-web/apps/web/app/cmc/stocks/page.tsx`
- Modify: `wcore-web/apps/web/components/Sidebar.tsx`
- Test: `wcore-web/apps/web/__tests__/market-cap.test.ts`

- [x] **Step 1: Add failing source-level assertions for public labels**

Read the three page/navigation source files and assert they contain `Market Cap Crypto` and `Market Cap Stock`, and no user-facing `CMC Crypto` or `CMC Stocks` labels.

- [x] **Step 2: Run the web test to verify labels fail**

Run:

```powershell
rtk node --import tsx --test __tests__/market-cap.test.ts
```

Expected: FAIL against the old CMC labels.

- [x] **Step 3: Rebuild `CmcTableClient` around the approved design**

Change props to:

```ts
interface CmcTableClientProps {
  endpoint: string;
  title: string;
  description: string;
  kind: "crypto" | "stock";
}
```

The component must:

- parse `generatedAt`, `stale`, and enriched rows;
- keep existing rows visible during refresh;
- reset page to one when search changes;
- display three summary cards for row count, aggregate market cap, and snapshot state/time;
- render logo with an initial fallback when the remote image fails;
- combine name and ticker in one identity cell;
- show country only for stocks and hide it below `md`;
- use a sticky table header, `min-w-[680px]`, and horizontal overflow;
- render exactly the current 100-row page;
- show Previous/Next controls and `Page X of Y`;
- stack title and controls on mobile;
- show skeleton rows only on the initial load, a retained-data error banner on refresh failure, and a no-results row for an empty search.

Use `Intl.NumberFormat("en", { style: "currency", currency: "EUR", notation: "compact" })` for summary market cap and a more precise EUR formatter for prices.

- [x] **Step 4: Rename pages and navigation without changing routes**

Use:

```tsx
<CmcTableClient
  endpoint="/api/cmc/crypto"
  title="Market Cap Crypto"
  description="The leading crypto assets ranked by market capitalization."
  kind="crypto"
/>
```

and the corresponding stock copy. Set metadata titles to `Market Cap Crypto | WCORE` and `Market Cap Stock | WCORE`. Rename only sidebar labels; retain `/cmc/crypto` and `/cmc/stocks`.

- [x] **Step 5: Run web tests, typecheck, and build**

Run:

```powershell
rtk pnpm --filter @wcore/web test
rtk pnpm --filter @wcore/web typecheck
rtk pnpm --filter @wcore/web build
```

Expected: tests, TypeScript, and Next production build pass.

---

### Task 4: Regression Verification And Documentation

**Files:**
- Modify: `ROADMAP.md` only if it still describes these pages as unimplemented.

- [x] **Step 1: Update current status documentation**

Replace stale backlog wording with a concise completed entry describing stable routes, enriched logos/context, responsive ranking UI, search, and pagination. Do not claim charts, watchlists, or auto-refresh.

- [x] **Step 2: Run the full relevant verification**

Run:

```powershell
rtk pnpm --filter @wcore/api test
rtk pnpm --filter @wcore/web test
rtk pnpm --filter @wcore/shared test
rtk pnpm lint
rtk pnpm --filter @wcore/api build
rtk pnpm --filter @wcore/web build
rtk git diff --check
```

Expected: no failures. A live-network integration test may report an explicit skip only when its documented preconditions are unavailable.

- [x] **Step 3: Review the final diff**

Confirm the diff contains no route renames, no new runtime dependency, no unrelated wallet redesign, and no changes to existing market-cap pricing calculations.

- [x] **Step 4: Leave deployment gated**

Do not deploy or commit unless explicitly requested. Report the exact verification results and any external-logo availability risk.
