# DeFi Position Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal DeFi position model for existing WCORE DeFi positions while keeping the current Sheet row format and adding visible `[Flex]` / `[Lock]` / `[Unknown]` suffixes in `token_name`.

**Architecture:** Add a small DeFi position registry and normalization layer in `@wcore/core`, then use it from the existing gsheet API post-scan path. Keep the existing token scan path intact, emit the same `tokens` array shape, and preserve current seven-column Apps Script output.

**Tech Stack:** TypeScript (`wcore-web/packages/core`, `wcore-web/apps/api`), Node test runner, Apps Script `.gs` tests, Google Sheets output compatibility.

---

## File Structure

### Create

- `wcore-web/packages/core/src/defi/positions.ts`
  - Defines `PositionType`, `LiquidityStatus`, `PortfolioPosition`, registry entry types, suffix helpers, and conversion helpers.

- `wcore-web/packages/core/src/defi/registry.ts`
  - Holds v1 known DeFi registry entries for Compound V3, WCT, Chainbase, and known staked/mirrored variants.

- `wcore-web/packages/core/src/defi/index.ts`
  - Barrel export for DeFi helpers.

- `wcore-web/packages/core/src/defi/positions.test.ts`
  - Unit tests for suffixes, debt signs, registry lookup, and row conversion.

### Modify

- `wcore-web/packages/core/src/index.ts`
  - Export DeFi helpers.

- `wcore-web/packages/core/src/tokens/types.ts`
  - Add optional DeFi metadata to `DiscoveredToken` so existing registry entries can carry position semantics during migration.

- `wcore-web/packages/core/src/tokens/registry.ts`
  - Annotate existing DeFi-like registry entries using the new metadata. Do not remove existing `balanceSelector` fields in v1.

- `wcore-web/apps/api/src/plugins/gsheet.ts`
  - Replace the hardcoded `STAKED_PRICE_MIRRORS` behavior with registry-backed metadata while keeping the public `applyStakedPriceMirrors` function name for minimal diff and test compatibility.
  - Apply `[Flex]` / `[Lock]` / `[Unknown]` suffixes to DeFi token names.

- `wcore-web/apps/api/src/plugins/gsheet.test.ts`
  - Extend existing mirror tests to assert suffixes and unchanged result shape.

- `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs`
  - No planned structural change. Verify it passes through suffixed `name` values unchanged.

- `wcore-gsheet/tests/web-scan-adapter.test.js`
  - Add a regression that suffixed DeFi names pass through to cache/output rows.

---

### Task 1: Core DeFi Position Types And Suffix Helpers

**Files:**
- Create: `wcore-web/packages/core/src/defi/positions.ts`
- Create: `wcore-web/packages/core/src/defi/index.ts`
- Create: `wcore-web/packages/core/src/defi/positions.test.ts`
- Modify: `wcore-web/packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add `wcore-web/packages/core/src/defi/positions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { liquiditySuffix, withLiquiditySuffix, positionToTokenLike } from "./positions.js";

test("liquiditySuffix maps internal status to visible Sheet suffix", () => {
  assert.equal(liquiditySuffix("flex"), "[Flex]");
  assert.equal(liquiditySuffix("lock"), "[Lock]");
  assert.equal(liquiditySuffix("unknown"), "[Unknown]");
  assert.equal(liquiditySuffix(undefined), "");
});

test("withLiquiditySuffix does not suffix normal wallet tokens", () => {
  assert.equal(withLiquiditySuffix("WalletConnect Token", { type: "wallet_token" }), "WalletConnect Token");
});

test("withLiquiditySuffix appends suffix for DeFi positions and avoids duplicates", () => {
  assert.equal(withLiquiditySuffix("WCT Stake Weight", { type: "staking_locked", liquidityStatus: "lock" }), "WCT Stake Weight [Lock]");
  assert.equal(withLiquiditySuffix("WCT Stake Weight [Lock]", { type: "staking_locked", liquidityStatus: "lock" }), "WCT Stake Weight [Lock]");
});

test("positionToTokenLike preserves negative debt values", () => {
  const token = positionToTokenLike({
    id: "optimism:compound-v3:weth-borrow",
    chain: "OPTIMISM",
    protocol: "compound-v3",
    type: "lending_debt",
    label: "Comp WETH Borrow",
    name: "Compound V3 cWETHv3 Borrowed",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    balance: -0.006,
    decimals: 18,
    priceEur: 1400,
    valueEur: -8.4,
    liquidityStatus: "flex",
    source: "registry+rpc",
    confidence: "high",
  });

  assert.equal(token.symbol, "Comp WETH Borrow");
  assert.equal(token.name, "Compound V3 cWETHv3 Borrowed [Flex]");
  assert.equal(token.balance, -0.006);
  assert.equal(token.valueEur, -8.4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
```

Expected: FAIL because `src/defi/positions.ts` does not exist.

- [ ] **Step 3: Add minimal implementation**

Create `wcore-web/packages/core/src/defi/positions.ts`:

```ts
export type PositionType =
  | "wallet_token"
  | "staking_locked"
  | "claimable"
  | "lending_collateral"
  | "lending_debt"
  | "vault_share"
  | "liquid_staking"
  | "real_world_asset"
  | "unknown_defi";

export type LiquidityStatus = "flex" | "lock" | "unknown";

export interface PortfolioPosition {
  id: string;
  chain: string;
  protocol?: string;
  type: PositionType;
  label: string;
  name: string;
  contract: string;
  underlying?: string;
  balance: number;
  decimals: number;
  priceEur: number | null;
  valueEur: number | null;
  liquidityStatus?: LiquidityStatus;
  source: "registry" | "discovery" | "registry+rpc" | "api" | "cache";
  confidence: "high" | "medium" | "low";
}

export type PositionMetadata = Pick<PortfolioPosition, "protocol" | "type" | "underlying" | "liquidityStatus" | "confidence"> & {
  pricing?: {
    mode: "mirror_underlying" | "mirror_native" | "direct" | "none";
    sign?: "asset" | "debt";
  };
};

export interface TokenLikePositionInput {
  symbol: string;
  name: string;
  contract: string;
  balance: number;
  decimals: number;
  priceEur: number | null;
  valueEur: number | null;
}

export function liquiditySuffix(status?: LiquidityStatus): "" | "[Flex]" | "[Lock]" | "[Unknown]" {
  if (status === "flex") return "[Flex]";
  if (status === "lock") return "[Lock]";
  if (status === "unknown") return "[Unknown]";
  return "";
}

export function withLiquiditySuffix(name: string, meta: { type?: PositionType; liquidityStatus?: LiquidityStatus }): string {
  const base = String(name || "").trim();
  if (!meta.type || meta.type === "wallet_token") return base;
  const suffix = liquiditySuffix(meta.liquidityStatus);
  if (!suffix) return base;
  if (/\s\[(Flex|Lock|Unknown)\]$/.test(base)) return base;
  return `${base} ${suffix}`;
}

export function positionToTokenLike(position: PortfolioPosition): TokenLikePositionInput {
  return {
    symbol: position.label,
    name: withLiquiditySuffix(position.name, position),
    contract: position.contract,
    balance: position.balance,
    decimals: position.decimals,
    priceEur: position.priceEur,
    valueEur: position.valueEur,
  };
}
```

Create `wcore-web/packages/core/src/defi/index.ts`:

```ts
export * from "./positions.js";
```

Modify `wcore-web/packages/core/src/index.ts` to export the new module:

```ts
export * from "./defi/index.js";
```

If `src/index.ts` already has grouped exports, add the line next to other core exports.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
```

Expected: PASS for all tests in `positions.test.ts`.

- [ ] **Step 5: Checkpoint**

Run:

```powershell
rtk git diff -- packages/core/src/defi packages/core/src/index.ts
```

Expected: diff only contains the new DeFi types/helpers and export. Do not commit unless explicitly requested.

---

### Task 2: DeFi Registry For Existing Known Positions

**Files:**
- Create: `wcore-web/packages/core/src/defi/registry.ts`
- Modify: `wcore-web/packages/core/src/defi/index.ts`
- Modify: `wcore-web/packages/core/src/defi/positions.test.ts`

- [ ] **Step 1: Write the failing registry tests**

Append to `wcore-web/packages/core/src/defi/positions.test.ts`:

```ts
import { getDeFiPositionMetadata } from "./registry.js";

test("registry identifies WCT stake and claimable liquidity", () => {
  const stake = getDeFiPositionMetadata("OPTIMISM", "0x521b4c065bbdbe3e20b3727340730936912dfa46", "WCT Stake");
  const claimable = getDeFiPositionMetadata("OPTIMISM", "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf", "WCT Claimable");

  assert.equal(stake?.type, "staking_locked");
  assert.equal(stake?.liquidityStatus, "lock");
  assert.equal(claimable?.type, "claimable");
  assert.equal(claimable?.liquidityStatus, "flex");
});

test("registry uses symbol-specific Compound collateral over Comet debt default", () => {
  const comet = "0xe36a30d249f7761327fd973001a32010b521b6fd";
  const debt = getDeFiPositionMetadata("OPTIMISM", comet, "Comp WETH Borrow");
  const collateral = getDeFiPositionMetadata("OPTIMISM", comet, "Comp wrsETH");

  assert.equal(debt?.type, "lending_debt");
  assert.equal(debt?.pricing?.sign, "debt");
  assert.equal(collateral?.type, "lending_collateral");
  assert.equal(collateral?.pricing?.sign, "asset");
});

test("registry returns undefined for normal tokens", () => {
  assert.equal(getDeFiPositionMetadata("OPTIMISM", "0xef4461891dfb3ac8572ccf7c794664a8dd927945", "WCT"), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
```

Expected: FAIL because `./registry.js` does not exist.

- [ ] **Step 3: Add registry implementation**

Create `wcore-web/packages/core/src/defi/registry.ts`:

```ts
import type { PositionMetadata } from "./positions.js";

export interface DeFiPositionRegistryEntry extends PositionMetadata {
  chain: string;
  contract: string;
  symbol?: string;
}

const entries: DeFiPositionRegistryEntry[] = [
  {
    chain: "BASE",
    contract: "0x8a337e3f2b63e869b085354ce28dd5902a5db038",
    symbol: "SDAYS",
    protocol: "staked-mirror",
    type: "liquid_staking",
    underlying: "0xb58372a5bb18e10229e680d8bcc4201ca3c98301",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "BASE",
    contract: "0x9ebe195d685f90b9be3449fe0628af20e15f729b",
    symbol: "SSWEET",
    protocol: "staked-mirror",
    type: "liquid_staking",
    underlying: "0x8da2a47f76d928a97a8f44498db25aa787198087",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf",
    symbol: "WCT Claimable",
    protocol: "walletconnect-staking",
    type: "claimable",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0x521b4c065bbdbe3e20b3727340730936912dfa46",
    symbol: "WCT Stake",
    protocol: "walletconnect-staking",
    type: "staking_locked",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "lock",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    symbol: "Comp WETH Borrow",
    protocol: "compound-v3",
    type: "lending_debt",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "debt" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    symbol: "Comp wrsETH",
    protocol: "compound-v3",
    type: "lending_collateral",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "asset" },
  },
];

function norm(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function getDeFiPositionMetadata(chain: string, contract: string, symbol?: string): DeFiPositionRegistryEntry | undefined {
  const chainKey = String(chain || "").trim().toUpperCase();
  const c = norm(contract);
  const s = norm(symbol || "");

  const symbolSpecific = entries.find((entry) => entry.chain === chainKey && norm(entry.contract) === c && entry.symbol && norm(entry.symbol) === s);
  if (symbolSpecific) return symbolSpecific;

  return entries.find((entry) => entry.chain === chainKey && norm(entry.contract) === c && !entry.symbol);
}

export function listDeFiPositionRegistryEntries(): readonly DeFiPositionRegistryEntry[] {
  return entries;
}
```

Modify `wcore-web/packages/core/src/defi/index.ts`:

```ts
export * from "./positions.js";
export * from "./registry.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```powershell
rtk git diff -- packages/core/src/defi
```

Expected: registry contains only v1 known positions and tests. Do not commit unless explicitly requested.

---

### Task 3: Add Optional DeFi Metadata To Token Types And Existing Registry Entries

**Files:**
- Modify: `wcore-web/packages/core/src/tokens/types.ts`
- Modify: `wcore-web/packages/core/src/tokens/registry.ts`
- Modify: `wcore-web/packages/core/src/defi/positions.test.ts`

- [ ] **Step 1: Write failing test that registry tokens expose DeFi metadata**

Append to `wcore-web/packages/core/src/defi/positions.test.ts`:

```ts
import { TOKEN_REGISTRY } from "../tokens/registry.js";

test("existing token registry entries can carry DeFi metadata during migration", () => {
  const optimism = TOKEN_REGISTRY.OPTIMISM ?? [];
  const stake = optimism.find((token) => token.symbol === "WCT Stake");
  const borrow = optimism.find((token) => token.symbol === "Comp WETH Borrow");

  assert.equal(stake?.defi?.type, "staking_locked");
  assert.equal(stake?.defi?.liquidityStatus, "lock");
  assert.equal(borrow?.defi?.type, "lending_debt");
  assert.equal(borrow?.defi?.pricing?.sign, "debt");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
```

Expected: FAIL because `DiscoveredToken` does not have `defi` and registry entries do not set it.

- [ ] **Step 3: Extend token type**

Modify `wcore-web/packages/core/src/tokens/types.ts`:

```ts
import type { PositionMetadata } from "../defi/index.js";

export interface DiscoveredToken {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  source?: "registry" | "logs" | "indexer";
  logoUrl?: string;
  defi?: PositionMetadata;
  balanceSelector?: string;
  balanceSelectorExtraArgs?: string[];
}
```

Keep the existing comments for `balanceSelector` and `balanceSelectorExtraArgs`; only add the import and `defi?: PositionMetadata`.

- [ ] **Step 4: Annotate existing DeFi registry entries**

Modify only the known DeFi-like entries in `wcore-web/packages/core/src/tokens/registry.ts`.

Use this exact pattern for Optimism entries:

```ts
{
  ...T("0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf", "WCT Claimable", "WCT Staking Reward Distributor", 18),
  balanceSelector: "0x1e83409a",
  defi: {
    protocol: "walletconnect-staking",
    type: "claimable",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
}
```

```ts
{
  ...T("0x521b4c065bbdbe3e20b3727340730936912dfa46", "WCT Stake", "WCT Stake Weight", 18),
  balanceSelector: "0x5de9a137",
  defi: {
    protocol: "walletconnect-staking",
    type: "staking_locked",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "lock",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
}
```

```ts
{
  ...T("0xE36A30D249f7761327fd973001A32010b521b6Fd", "Comp WETH Borrow", "Compound V3 cWETHv3 Borrowed", 18),
  balanceSelector: "0x374c49b4",
  defi: {
    protocol: "compound-v3",
    type: "lending_debt",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "debt" },
  },
}
```

```ts
{
  ...T("0xE36A30D249f7761327fd973001A32010b521b6Fd", "Comp wrsETH", "Compound V3 cWETHv3 Collateral", 18),
  balanceSelector: "0x5c2549ee",
  balanceSelectorExtraArgs: ["0x00000000000000000000000087eEE96D50Fb761AD85B1c982d28A042169d61b1"],
  defi: {
    protocol: "compound-v3",
    type: "lending_collateral",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "asset" },
  },
}
```

Also annotate Base `SDAYS` and `SSWEET` entries if they exist in `TOKEN_REGISTRY.BASE`; if they do not exist yet, leave them for Task 4 API registry lookup and do not add new token registry rows in this task.

- [ ] **Step 5: Run tests**

Run:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
rtk pnpm --filter @wcore/core typecheck
```

Expected: tests PASS and typecheck reports no TypeScript errors.

---

### Task 4: Registry-Backed GSheet Mirror Pricing And Flex/Lock Suffixes

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts`
- Modify: `wcore-web/apps/api/src/plugins/gsheet.test.ts`

- [ ] **Step 1: Write failing API tests for suffixes and registry-backed behavior**

Modify the existing tests in `wcore-web/apps/api/src/plugins/gsheet.test.ts` under `describe("applyStakedPriceMirrors", ...)`.

Add assertions to the WCT test:

```ts
assert.equal(claimable?.name, "WCT Staking Reward Distributor [Flex]");
assert.equal(stake?.name, "WCT Stake Weight [Lock]");
```

Change the local type for `claimable` and `stake` to include `name`:

```ts
const claimable = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "WCT Claimable");
const stake = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "WCT Stake");
```

Add assertions to the Compound test:

```ts
assert.equal(borrow?.name, "Compound V3 cWETHv3 Borrowed [Flex]");
assert.equal(collateral?.name, "Compound V3 cWETHv3 Collateral [Flex]");
```

Change the local type for `tokens` to include `name`:

```ts
const tokens = result.tokens as Array<{ symbol: string; name: string; balance: number; priceEur: number | null; valueEur: number | null; source: string | null }>;
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
rtk pnpm --filter @wcore/api test -- src/plugins/gsheet.test.ts
```

Expected: FAIL because suffixes are not added yet. Existing unrelated `STRETCH` failure may still appear; the new suffix assertions should fail before implementation.

- [ ] **Step 3: Update gsheet plugin imports**

At the top of `wcore-web/apps/api/src/plugins/gsheet.ts`, add:

```ts
import { getDeFiPositionMetadata, withLiquiditySuffix } from "@wcore/core";
```

If `@wcore/core` is already imported in this file, extend the existing import instead of adding a duplicate.

- [ ] **Step 4: Replace mirror lookup with registry metadata fallback**

Inside `applyStakedPriceMirrors`, before the `updated = tokens.map(...)` block, add this helper:

```ts
  function metadataForToken(token: unknown) {
    const rec = token as Record<string, unknown>;
    return getDeFiPositionMetadata(chain, String(rec.contract || ""), String(rec.symbol || ""));
  }
```

Then inside the `tokens.map`, after `contract` and `sym` are computed, add:

```ts
    const meta = metadataForToken(t);
```

Keep the existing `STAKED_PRICE_MIRRORS` map for compatibility during v1, but prefer registry metadata when available:

```ts
    const registryPricing = meta?.pricing;
    const registryUnderlying = meta?.underlying;
```

Replace the mirror selection block with:

```ts
    let mirror = mirrors[`${contract}|${sym}`];
    if (!mirror) mirror = mirrors[contract];
    if (!mirror && registryPricing && registryUnderlying) {
      mirror = {
        underlying: registryUnderlying,
        symbol: registryUnderlying === "native" ? String(result.native?.symbol || "native") : registryUnderlying,
        negate: registryPricing.sign === "debt",
      };
    }
    if (!mirror && !meta) return t;
```

After computing `displayValue`, build the suffixed name:

```ts
    const originalName = String((t as Record<string, unknown>).name || "");
    const name = meta ? withLiquiditySuffix(originalName, meta) : originalName;
```

Return `name` in the updated token:

```ts
    return { ...(t as Record<string, unknown>), name, balance: displayBalance, priceEur: underlyingPriced.priceEur, valueEur: displayValue, source: sourceLabel };
```

For DeFi metadata entries that do not need mirror pricing but still need suffixes, add this before `return t` paths:

```ts
    if (!mirror && meta) {
      const originalName = String((t as Record<string, unknown>).name || "");
      return { ...(t as Record<string, unknown>), name: withLiquiditySuffix(originalName, meta) };
    }
```

- [ ] **Step 5: Run API tests**

Run:

```powershell
rtk pnpm --filter @wcore/api test -- src/plugins/gsheet.test.ts
```

Expected: the suffix tests pass. If the existing unrelated `STRETCH` test still fails, record it as pre-existing and continue only if the new DeFi tests pass.

- [ ] **Step 6: Typecheck API**

Run:

```powershell
rtk pnpm --filter @wcore/api typecheck
```

Expected: no TypeScript errors.

---

### Task 5: Apps Script Pass-Through Regression For Flex/Lock Names

**Files:**
- Modify: `wcore-gsheet/tests/web-scan-adapter.test.js`
- Verify: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs`

- [ ] **Step 1: Write failing/pass-through test**

Add this block to `wcore-gsheet/tests/web-scan-adapter.test.js` near existing web scan cache conversion tests:

```js
{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Optimism', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'OPTIMISM',
    chainName: 'Optimism',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0, priceEur: 1400, valueEur: 0 },
    tokens: [
      { symbol: 'WCT Stake', name: 'WCT Stake Weight [Lock]', contract: '0x521b4c065bbdbe3e20b3727340730936912dfa46', balance: 71.2, decimals: 18, priceEur: 0.037, valueEur: 2.6344 },
      { symbol: 'WCT Claimable', name: 'WCT Staking Reward Distributor [Flex]', contract: '0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf', balance: 12.8, decimals: 18, priceEur: 0.037, valueEur: 0.4736 },
    ],
    totalValueEur: 3.108,
    errors: [],
    degraded: false,
    fxRate: 0.878,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, []);
  assert.equal(cache.assets[1].name, 'WCT Stake Weight [Lock]');
  assert.equal(cache.assets[2].name, 'WCT Staking Reward Distributor [Flex]');
}
```

- [ ] **Step 2: Run test**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk node tests\web-scan-adapter.test.js
```

Expected: PASS if Apps Script already preserves names. If it fails, the failure should show where names are stripped.

- [ ] **Step 3: Patch only if needed**

If the test fails because `_webScanAssetFromToken_` strips suffixes, ensure it uses the raw API-provided `name`:

```js
name: String(tokenObj.name || tokenObj.symbol || ""),
```

Do not add suffix logic in Apps Script. Suffixing belongs in the API/core layer for v1.

- [ ] **Step 4: Run Apps Script validation**

Run:

```powershell
rtk node tests\web-scan-adapter.test.js
rtk npm run validate:static
```

Expected: web scan adapter OK and static validation OK.

---

### Task 6: End-To-End Verification With Current Existing Positions

**Files:**
- No planned code changes.
- Verify live API and Sheet output after deployment.

- [ ] **Step 1: Run core and API targeted tests**

Run from `C:\Users\strau\WCORE\wcore-web`:

```powershell
rtk pnpm --filter @wcore/core test -- src/defi/positions.test.ts
rtk pnpm --filter @wcore/core test -- src/engines/evm.test.ts
rtk pnpm --filter @wcore/core typecheck
rtk pnpm --filter @wcore/api test -- src/plugins/gsheet.test.ts
rtk pnpm --filter @wcore/api typecheck
```

Expected:

- DeFi position tests PASS.
- EVM tests PASS.
- Core typecheck has no errors.
- API typecheck has no errors.
- If `gsheet.test.ts` still has an unrelated pre-existing `STRETCH` failure, document it and verify the DeFi-specific tests pass.

- [ ] **Step 2: Run Apps Script tests**

Run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk node tests\web-scan-adapter.test.js
rtk node tests\wallet-cache-preserve-prices.test.js
rtk npm run validate:static
```

Expected: all listed commands pass.

- [ ] **Step 3: Deploy only after explicit approval**

Do not deploy automatically. If the user explicitly approves deployment, use the established deployment paths:

For API Railway, follow the existing safe pattern from the previous session:

```powershell
rtk railway up .. --path-as-root --service api --ci
```

Run from `C:\Users\strau\WCORE\wcore-web` and verify the correct Railway project/service before deploying.

For Apps Script, run from `C:\Users\strau\WCORE\wcore-gsheet`:

```powershell
rtk proxy npx @google/clasp status
rtk proxy npx @google/clasp push -f
rtk proxy npx @google/clasp deploy -d "defi-position-engine-v1-flex-lock"
```

- [ ] **Step 4: Verify Sheet output after deployment**

After deployment and refresh, verify `Ledger - Optimism!A1:G25` contains these names:

```text
Compound V3 cWETHv3 Collateral [Flex]
WCT Stake Weight [Lock]
WCT Staking Reward Distributor [Flex]
Compound V3 cWETHv3 Borrowed [Flex]
```

Verify `Comp WETH Borrow` remains negative and `INFO_TOTAL` remains net.

Also verify `Ledger - Base!A1:G35` contains:

```text
Chainbase Staking (locked) [Lock]
Chainbase Airdrop (claimable) [Flex]
```

If SDAYS/SSWEET are present, verify their names include `[Flex]` only if registry metadata was added for them.

---

## Self-Review

Spec coverage:

- Internal position model: Task 1.
- Registry-driven known positions: Tasks 2 and 3.
- Conservative discovery hybrid: Task 2 establishes registry lookup; broader discovery remains later by spec.
- Same Sheet columns: Tasks 5 and 6.
- Visible `[Flex]` / `[Lock]`: Tasks 4, 5, and 6.
- Net `INFO_TOTAL` and negative debt preservation: Task 6 verifies existing behavior stays intact.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps remain.
- Deployment steps are gated on explicit user approval because commits/deploys are not implicit.

Type consistency:

- `PositionType`, `LiquidityStatus`, `PositionMetadata`, `PortfolioPosition`, `getDeFiPositionMetadata`, `withLiquiditySuffix`, and `positionToTokenLike` are introduced before use.
- `liquidityStatus` values use `"flex" | "lock" | "unknown"` internally and `[Flex] | [Lock] | [Unknown]` visibly.
