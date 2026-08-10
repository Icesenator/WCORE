# SVM Market Metadata Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mint-prefix placeholders such as `7atgF8KQ` with verified metadata from the pricing source that successfully priced the SVM token.

**Architecture:** Preserve optional `symbol` and `name` from the accepted Web pricing source, then let the SVM engine consume them only when canonical metadata is absent. In Apps Script, reuse the existing DexScreener bulk response after GeckoTerminal and Jupiter metadata misses, while retaining the existing metadata precedence and cache.

**Tech Stack:** TypeScript, Node test runner, Google Apps Script JavaScript, pnpm, clasp, Railway.

---

## File Structure

- Modify `wcore-web/packages/core/src/pricing/types.ts`: expose optional metadata on `PricingResult`.
- Modify `wcore-web/packages/core/src/pricing/cascade.ts`: propagate metadata from the accepted source.
- Modify `wcore-web/packages/core/src/pricing/cascade.test.ts`: guard metadata propagation.
- Modify `wcore-web/packages/core/src/engines/svm.ts`: replace only placeholder identity and cache improvements.
- Modify `wcore-web/packages/core/src/engines/svm.test.ts`: guard CWIF enrichment and canonical metadata precedence.
- Modify `wcore-gsheet/src/14_SVM_ENGINE.gs`: add Dex metadata fallback and recognize mint-prefix placeholders during pricing.
- Create `wcore-gsheet/tests/svm-market-metadata.test.js`: isolate and test Apps Script metadata resolution.
- Modify `wcore-gsheet/src/01_INIT.gs`, `wcore-gsheet/dist/package.json`, and version guards: publish `4.16.64`.

### Task 1: Preserve Winning-Source Metadata In Web Pricing

**Files:**
- Modify: `wcore-web/packages/core/src/pricing/types.ts:53-61`
- Modify: `wcore-web/packages/core/src/pricing/cascade.ts:207-247`
- Test: `wcore-web/packages/core/src/pricing/cascade.test.ts`

- [ ] **Step 1: Write the failing cascade test**

Add a test whose DexScreener source returns real source metadata:

```ts
test("returns metadata from the source that supplied the accepted price", async () => {
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => ({
    priceUsd: 2.4e-8,
    source: "dex",
    symbol: "CWIF",
    name: "catwifhat",
  });

  const priced = await priceTokenCascade({
    token: token({
      key: "solana:7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      contract: "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      symbol: "7atgF8KQ",
      name: "7atgF8KQ",
      chain: { ...baseChain, key: "SOLANA", vm: "SVM" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(priced.symbol, "CWIF");
  assert.equal(priced.name, "catwifhat");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `rtk pnpm exec tsx --test packages/core/src/pricing/cascade.test.ts`

Expected: TypeScript or assertion failure because `PricingResult` does not expose `symbol` and `name`.

- [ ] **Step 3: Add optional fields to `PricingResult`**

```ts
export interface PricingResult {
  key: string;
  priceEur: number | null;
  priceUsd: number | null;
  source: PriceSource | string | null;
  reason: string | null;
  symbol?: string;
  name?: string;
  marker?: PricingMarker;
  trail: PricingTrailStep[];
}
```

- [ ] **Step 4: Propagate only committed source metadata**

Pass `source.symbol` and `source.name` from `commitSourcePrice` into `result`, and extend `result` with optional parameters:

```ts
return result(
  key,
  priceEur,
  source.priceUsd,
  source.source,
  null,
  _trail,
  source.marker,
  source.symbol,
  source.name,
);
```

```ts
function result(
  key: string,
  priceEur: number | null,
  priceUsd: number | null,
  source: PriceSource | string | null,
  reason: string | null,
  trail: PricingResult["trail"],
  marker?: PricingResult["marker"],
  symbol?: string,
  name?: string,
): PricingResult {
  return {
    key,
    priceEur,
    priceUsd,
    source,
    reason,
    trail,
    ...(marker ? { marker } : {}),
    ...(symbol ? { symbol } : {}),
    ...(name ? { name } : {}),
  };
}
```

- [ ] **Step 5: Run cascade tests and typecheck**

Run: `rtk pnpm exec tsx --test packages/core/src/pricing/cascade.test.ts`

Expected: all cascade tests pass.

Run: `rtk pnpm --filter @wcore/core typecheck`

Expected: no TypeScript errors.

- [ ] **Step 6: Commit Task 1**

```powershell
rtk git add wcore-web/packages/core/src/pricing/types.ts wcore-web/packages/core/src/pricing/cascade.ts wcore-web/packages/core/src/pricing/cascade.test.ts
rtk git commit -m "feat(core): preserve pricing source metadata"
```

### Task 2: Enrich Placeholder SVM Identity In Web Scans

**Files:**
- Modify: `wcore-web/packages/core/src/engines/svm.ts:242-266,490-521`
- Test: `wcore-web/packages/core/src/engines/svm.test.ts`

- [ ] **Step 1: Write failing tests for placeholder and canonical identity**

Export a pure `resolveSvmTokenIdentity` helper from `svm.ts` and add tests:

```ts
import { getSvmWalletAssets, resolveSvmTokenIdentity } from "./svm.js";

test("SVM market metadata replaces a mint-prefix placeholder", () => {
  assert.deepEqual(
    resolveSvmTokenIdentity(
      "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      "7atgF8KQ",
      "7atgF8KQ",
      undefined,
      { symbol: "CWIF", name: "catwifhat" },
    ),
    { symbol: "CWIF", name: "catwifhat", improved: true },
  );
});

test("SVM market metadata never overwrites canonical metadata", () => {
  assert.deepEqual(
    resolveSvmTokenIdentity(
      "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      "CANON",
      "Canonical Token",
      { symbol: "CANON", name: "Canonical Token", decimals: 2 },
      { symbol: "CWIF", name: "catwifhat" },
    ),
    { symbol: "CANON", name: "Canonical Token", improved: false },
  );
});
```

- [ ] **Step 2: Run the SVM test and verify RED**

Run: `rtk pnpm exec tsx --test packages/core/src/engines/svm.test.ts`

Expected: failure because `resolveSvmTokenIdentity` is not exported.

- [ ] **Step 3: Implement the pure identity resolver**

```ts
export function resolveSvmTokenIdentity(
  mint: string,
  symbol: string,
  name: string,
  metadata: SvmTokenMetadata | undefined,
  market: { symbol?: string; name?: string },
): { symbol: string; name: string; improved: boolean } {
  const prefix = mint.slice(0, 8);
  const resolvedSymbol = symbol === prefix && market.symbol ? market.symbol : symbol;
  const resolvedName = !metadata?.name && (name === prefix || name === symbol) && market.name
    ? market.name
    : name;
  return {
    symbol: resolvedSymbol,
    name: resolvedName,
    improved: resolvedSymbol !== symbol || resolvedName !== name,
  };
}
```

- [ ] **Step 4: Apply the resolver after pricing and learn improvements**

In `priceSvmToken`, resolve identity from `priced.symbol` and `priced.name`, then return the resolved values. When `improved` is true, update `_svmMetaCache` with the resolved identity, decimals, and existing logo URL before returning.

```ts
const identity = resolveSvmTokenIdentity(mint, symbol, name, metadata, priced);
if (identity.improved) {
  _svmMetaCache.set(mint, {
    symbol: identity.symbol,
    name: identity.name,
    decimals,
    logoUrl,
  });
}
```

Use `identity.symbol` in any emitted pricing error and in the returned `SvmWalletToken`.

- [ ] **Step 5: Run SVM, Core, and type checks**

Run: `rtk pnpm exec tsx --test packages/core/src/engines/svm.test.ts packages/core/src/pricing/cascade.test.ts`

Expected: all selected tests pass.

Run: `rtk pnpm --filter @wcore/core test`

Expected: 0 failures; the optional real Redis test may remain skipped.

- [ ] **Step 6: Commit Task 2**

```powershell
rtk git add wcore-web/packages/core/src/engines/svm.ts wcore-web/packages/core/src/engines/svm.test.ts
rtk git commit -m "fix(core): enrich placeholder SVM metadata"
```

### Task 3: Align Apps Script Metadata Fallback

**Files:**
- Modify: `wcore-gsheet/src/14_SVM_ENGINE.gs:312-338,560-584`
- Create: `wcore-gsheet/tests/svm-market-metadata.test.js`
- Modify: `wcore-gsheet/src/01_INIT.gs:39-43`
- Modify: `wcore-gsheet/dist/package.json:3`
- Modify: `wcore-gsheet/tests/auto-heal-new-ledgers.test.js:16`

- [ ] **Step 1: Write the failing Apps Script metadata test**

Extract and evaluate the `SvmTokenMeta` IIFE in a VM context. Configure GeckoTerminal and Jupiter to miss, then return CWIF from `dexBulkTokens`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '14_SVM_ENGINE.gs'), 'utf8');
const start = source.indexOf('var SvmTokenMeta =');
const end = source.indexOf('// SVM ENGINE', start);
assert.ok(start >= 0 && end > start, 'SvmTokenMeta source not found');

const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
let dexCalls = 0;
const context = {
  console,
  Date,
  JSON,
  Object,
  String,
  Number,
  isFinite,
  _svmIsBase58: () => true,
  Num: {
    isValid: (value) => value !== null && value !== '' && Number.isFinite(Number(value)),
  },
  MetaCache: {
    load: () => ({}),
    save: () => {},
  },
  PriceSources: {
    getGeckoTerminalMeta: () => null,
    getJupiterTokenMeta: () => null,
    dexBulkTokens: () => {
      dexCalls++;
      return { [mint.toLowerCase()]: { symbol: 'CWIF', name: 'catwifhat' } };
    },
  },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const meta = context.SvmTokenMeta.resolve(mint, null, null, { CHAIN: { VM: 'SVM' } }, false);
assert.deepStrictEqual(JSON.parse(JSON.stringify(meta)), {
  symbol: 'CWIF',
  name: 'catwifhat',
  decimals: null,
});

const canonical = context.SvmTokenMeta.resolve(
  mint,
  { symbol: 'CANON', name: 'Canonical Token' },
  null,
  { CHAIN: { VM: 'SVM' } },
  false,
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(canonical)), {
  symbol: 'CANON',
  name: 'Canonical Token',
  decimals: null,
});
assert.equal(dexCalls, 1, 'canonical metadata must skip market fallback');
```

Add a second assertion with override `{ symbol: 'CANON', name: 'Canonical Token' }` and verify DexScreener is not called.

- [ ] **Step 2: Run the new test and verify RED**

Run: `rtk node tests/svm-market-metadata.test.js`

Expected: metadata remains empty because `SvmTokenMeta.resolve` has no DexScreener fallback.

- [ ] **Step 3: Add DexScreener as the final resolver fallback**

After the Jupiter lookup, only if symbol or name remains a placeholder, call the existing bulk source and merge its record:

```js
if (_ph(mt.symbol) || _pn(mt.name)) {
  try {
    if (typeof PriceSources !== 'undefined' && PriceSources.dexBulkTokens) {
      var dexMap = PriceSources.dexBulkTokens([m], t, c) || {};
      var dexMeta = dexMap[m.toLowerCase()] || dexMap[m];
      if (dexMeta) {
        mt = _mg(mt, dexMeta);
        if (!_ph(mt.symbol) || !_pn(mt.name)) learn(m, mt, t, c);
      }
    }
  } catch (eDex) {}
}
```

- [ ] **Step 4: Recognize mint-prefix placeholders in the pricing loop**

Change the existing assignments so a successful bulk price can repair the current output immediately:

```js
var mintPrefix = k0.slice(0, 8);
if ((!a3.symbol || a3.symbol === "SPL" || a3.symbol === mintPrefix) && px.symbol) a3.symbol = px.symbol;
if ((!a3.name || a3.name === "SPL Token" || a3.name === mintPrefix) && px.name) a3.name = px.name;
```

- [ ] **Step 5: Advance release versions under test**

First update version guards to expect `4.16.64`, run them to observe failure, then set:

```js
PATCH: 64,
```

```js
var SVM_ENGINE_VERSION = "4.16.64";
```

and set `wcore-gsheet/dist/package.json` to `"version": "4.16.64"`.

- [ ] **Step 6: Run GSheet tests**

Run: `rtk node tests/svm-market-metadata.test.js`

Expected: CWIF fallback and canonical precedence pass.

Run: `rtk npm test`

Expected: static validation passes and all GSheet tests pass.

- [ ] **Step 7: Commit Task 3**

```powershell
rtk git add wcore-gsheet/src/14_SVM_ENGINE.gs wcore-gsheet/tests/svm-market-metadata.test.js wcore-gsheet/src/01_INIT.gs wcore-gsheet/dist/package.json wcore-gsheet/tests/auto-heal-new-ledgers.test.js
rtk git commit -m "fix(gsheet): enrich missing SVM metadata"
```

### Task 4: Verify, Deploy, And Confirm Layer3

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] **Step 1: Run final local verification**

Run: `rtk npm test` from `wcore-web`.

Expected: all workspace typechecks and tests pass; only the explicitly optional Redis integration may be skipped.

Run: `rtk npm run lint` from `wcore-web`.

Expected: ESLint exits 0.

Run: `rtk npm test` from `wcore-gsheet`.

Expected: static validation and every Node test pass.

Run: `rtk git diff --check` from repository root.

Expected: no output.

- [ ] **Step 2: Request independent code review**

Review the commits against `docs/superpowers/specs/2026-08-10-svm-market-metadata-fallback-design.md`. Fix every Critical or Important finding and rerun the affected tests.

- [ ] **Step 3: Push the implementation commits**

```powershell
rtk git push origin master
```

Expected: `master` is synchronized with `origin/master`; unrelated `graphify-out` changes remain unstaged.

- [ ] **Step 4: Deploy API, then Apps Script**

From `wcore-web`:

```powershell
rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy.ps1 -Service api
```

Wait for completion before deploying Apps Script. From `wcore-gsheet`:

```powershell
rtk powershell -NoProfile -ExecutionPolicy Bypass -File safe-push.ps1
```

Expected: both deployments succeed; OAuth scopes remain unchanged.

- [ ] **Step 5: Verify production health**

Request `https://api-production-b5bf.up.railway.app/health` and `/ready`.

Expected: liveness is `ok`, readiness is `ready`, and DB/Redis checks are true.

- [ ] **Step 6: Refresh and verify the Sheet**

Use the existing Google Sheets service-account workflow to set
`Layer3 - Solana!C1=TRUE` and pulse `B1`. Wait for `I1` and `J1` to advance, then
read the row for mint `7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1`.

Expected row identity:

```text
token_ticker = CWIF
token_name = catwifhat
contract_address = 7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1
```

Set `C1=FALSE` after verification and confirm the timestamp remains current.
