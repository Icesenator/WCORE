# CEX Pricing Accuracy and Resilience Implementation Plan

> **Status 2026-07-13:** Implemented/historical. Related code and tests are present in the current worktree. Keep this file for provenance; do not treat unchecked boxes below as active backlog without revalidating against code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct CEX EUR valuations, secure and bound the Google Sheets pricing endpoint, and preserve last-known CEX holdings during transient failures.

**Architecture:** Keep the existing provider-first synchronization flow. Add one pure USD-to-EUR conversion helper, retain the cross-project Google Sheets pricing route behind its shared token with bounded work, and isolate stale-result transitions in pure functions that the React hook calls and Node tests can exercise without a browser or live API.

**Tech Stack:** TypeScript, Fastify 5, Next.js 16/React 19, Node test runner, tsx.

**Constraint:** Do not commit. The worktree already contains unrelated user changes; modify only the files listed below.

---

## File Map

- Modify `wcore-web/apps/api/src/plugins/cex.ts`: canonical FX conversion and secured, bounded `/api/cex/prices`.
- Create `wcore-web/apps/api/src/cex/pricing.test.ts`: pure conversion and route auth/bounds/batching regression tests.
- Modify `wcore-web/apps/web/hooks/useCexHoldings.ts`: stale-preserving failure transitions.
- Create `wcore-web/apps/web/__tests__/cex-holdings-state.test.ts`: pure CEX state transition tests.
- Modify `docs/AUDIT.md`, `ROADMAP.md`, `wcore-web/docs/AUDIT.md`: close only findings proven fixed by this lot.

### Task 1: Correct Internal CEX FX Conversion

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/cex.ts:318-331`
- Create: `wcore-web/apps/api/src/cex/pricing.test.ts`

- [x] **Step 1: Write the pure conversion regression tests**

Create the test file with the following cases:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { convertUsdPriceToEur } from "../plugins/cex.js";

test("converts one USD stable using EUR per USD", () => {
  assert.equal(convertUsdPriceToEur(1, 0.8), 0.8);
});

test("converts a USD provider price using EUR per USD", () => {
  assert.equal(convertUsdPriceToEur(10, 0.8), 8);
});

test("rejects invalid prices and rates", () => {
  assert.equal(convertUsdPriceToEur(0, 0.8), null);
  assert.equal(convertUsdPriceToEur(10, 0), null);
  assert.equal(convertUsdPriceToEur(Number.NaN, 0.8), null);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `wcore-web`:

```powershell
rtk node --import tsx --test apps/api/src/cex/pricing.test.ts
```

Expected: FAIL because `convertUsdPriceToEur` is not exported.

- [x] **Step 3: Add the minimal helper and wire it into internal pricing**

Add near `CEX_PRICE_IDS`:

```ts
export function convertUsdPriceToEur(priceUsd: number, fxRate: number): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  return priceUsd * fxRate;
}
```

Update `priceSymbolEur`:

```ts
if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
  return { priceEur: convertUsdPriceToEur(1, eurUsd), source: "stable-usd" };
}
```

For DefiLlama, compute `const priceEur = convertUsdPriceToEur(priceUsd, eurUsd)` and return it only when non-null. Do not add a reciprocal fallback.

- [x] **Step 4: Run the focused test and existing CEX normalizer tests**

```powershell
rtk node --import tsx --test apps/api/src/cex/pricing.test.ts apps/api/src/cex/normalizers.test.ts
```

Expected: all tests PASS.

### Task 2: Secure and Bound the Google Sheets Pricing Endpoint

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/cex.ts:580-648`
- Test: `wcore-web/apps/api/src/cex/pricing.test.ts`

- [x] **Step 1: Add route authentication, limit and batching regression tests**

Append an isolated Fastify test:

```ts
import Fastify from "fastify";
import type { PrismaClient } from "@wcore/db";
import { cexPlugin } from "../plugins/cex.js";

test("requires the Google Sheets token", async () => {
  const app = Fastify();
  await cexPlugin(app, { prisma: {} as PrismaClient });
  await app.ready();
  const response = await app.inject({ method: "GET", url: "/api/cex/prices?symbols=BTC" });
  assert.equal(response.statusCode, 401);
  await app.close();
});
```

- [ ] **Step 2: Run the route test and verify RED**

```powershell
rtk node --import tsx --test apps/api/src/cex/pricing.test.ts
```

Expected: FAIL against the removed route because it returns 404 instead of the secured contract.

- [x] **Step 3: Restore the required route without restoring the amplification fan-out**

Require `x-gsheet-token`, cap requests at 50 symbols, send stock symbols to one relay batch, and price crypto fallbacks with at most five workers. Keep the old per-provider fan-out helpers removed.

- [x] **Step 4: Verify route contract and CEX tests**

```powershell
rtk node --import tsx --test apps/api/src/cex/pricing.test.ts apps/api/src/cex/normalizers.test.ts
rtk grep "/api/cex/prices" apps packages
```

Expected: tests PASS; grep finds the API route, its tests and the Google Sheets caller.

### Task 3: Preserve Last-Known CEX Holdings on Transient Failure

**Files:**
- Modify: `wcore-web/apps/web/hooks/useCexHoldings.ts:86-114`
- Create: `wcore-web/apps/web/__tests__/cex-holdings-state.test.ts`

- [x] **Step 1: Write pure state regression tests**

Export `CexScanResult` as today and write tests against a new `resolveCexLoadFailure` function. Construct one result with total `80`, one token, and a non-degraded chain. Cover:

```ts
assert.deepEqual(resolveCexLoadFailure(previous, 401), []);
assert.deepEqual(resolveCexLoadFailure(previous, 403), []);

const stale = resolveCexLoadFailure(previous, 500);
assert.equal(stale[0]?.totalEur, 80);
assert.equal(stale[0]?.chains[0]?.totals.valueEur, 80);
assert.equal(stale[0]?.chains[0]?.degraded, true);
assert.equal(stale[0]?.chains[0]?.errors.filter((e) => e.message.includes("last known CEX holdings")).length, 1);

const staleTwice = resolveCexLoadFailure(stale, undefined);
assert.equal(staleTwice[0]?.chains[0]?.errors.filter((e) => e.message.includes("last known CEX holdings")).length, 1);
```

- [ ] **Step 2: Run the Web test and verify RED**

```powershell
rtk node --import tsx --test apps/web/__tests__/cex-holdings-state.test.ts
```

Expected: FAIL because `resolveCexLoadFailure` does not exist.

- [x] **Step 3: Implement the pure transition**

In `useCexHoldings.ts`, add a stable marker constant and export:

```ts
const CEX_STALE_MESSAGE = "Showing last known CEX holdings because refresh failed";

export function resolveCexLoadFailure(previous: CexScanResult[], status?: number): CexScanResult[] {
  if (status === 401 || status === 403) return [];
  return previous.map((result) => ({
    ...result,
    chains: result.chains.map((chain) => ({
      ...chain,
      degraded: true,
      errors: chain.errors.some((error) => error.message === CEX_STALE_MESSAGE)
        ? chain.errors
        : [...chain.errors, { stage: "sync", message: CEX_STALE_MESSAGE }],
    })),
  }));
}
```

Preserve all token, price and total fields.

- [x] **Step 4: Wire session-keyed, requestId-guarded transitions into `reload` and adapt `WalletContent`**

Use explicit branches:

```ts
const res = await apiFetch("/api/cex/accounts");
if (!res.ok) {
  setCexResults((previous) => resolveCexLoadFailure(previous, res.status));
  return;
}
const data = await res.json() as { accounts?: CexAccountApi[] };
const accounts = (data.accounts ?? []).filter((account) => account.holdings.length > 0);
setCexResults(accounts.map(accountToScanResult));
```

In `catch`, call `setCexResults((previous) => resolveCexLoadFailure(previous))`. Keep `enabled=false` clearing immediately. A later HTTP 200 naturally replaces stale objects with fresh objects.

- [x] **Step 5: Run the focused Web tests**

```powershell
rtk node --import tsx --test apps/web/__tests__/cex-holdings-state.test.ts apps/web/__tests__/cex-display.test.ts
```

Expected: all tests PASS without a running API.

### Task 4: Verify and Reconcile Documentation

**Files:**
- Modify: `docs/AUDIT.md`
- Modify: `ROADMAP.md`
- Modify: `wcore-web/docs/AUDIT.md`

- [x] **Step 1: Run API and Web verification**

```powershell
rtk pnpm --filter @wcore/api typecheck
rtk pnpm --filter @wcore/web typecheck
rtk node --import tsx --test apps/api/src/cex/pricing.test.ts apps/api/src/cex/normalizers.test.ts
rtk node --import tsx --test apps/web/__tests__/cex-holdings-state.test.ts apps/web/__tests__/cex-display.test.ts
rtk pnpm exec eslint apps/api/src/plugins/cex.ts apps/api/src/cex/pricing.test.ts apps/web/hooks/useCexHoldings.ts apps/web/__tests__/cex-holdings-state.test.ts
```

Expected: all focused commands PASS.

- [x] **Step 2: Verify route consumer/auth contract and diff hygiene**

```powershell
rtk grep "/api/cex/prices" apps packages
rtk git diff --check
```

Expected: references are limited to the route, tests, documentation and authenticated Google Sheets caller; diff check exits 0.

- [x] **Step 3: Update audit status with evidence**

Mark the FX conversion, secured endpoint amplification and CEX stale-display findings fixed in the three living audit/roadmap files. Include the exact test filenames and fresh counts. Do not close `CEX_SECRET`, relay-token, SSRF, CI, Prisma or other GSheet findings.

- [ ] **Step 4: Review the final scoped diff**

```powershell
rtk git diff -- apps/api/src/plugins/cex.ts apps/api/src/cex/pricing.test.ts apps/web/hooks/useCexHoldings.ts apps/web/__tests__/cex-holdings-state.test.ts ../docs/AUDIT.md ../ROADMAP.md docs/AUDIT.md
```

Expected: only the planned CEX implementation, tests and evidence updates appear. Do not commit.

Corrected verification result (2026-07-10): the initial route-removal conclusion missed the cross-project caller in `wcore-gsheet`. The secured route now passes 33/33 focused API CEX/normalizer/stock-relay tests, including auth, 50-symbol limiting and single-batch stock relay behavior. No commit was created.
