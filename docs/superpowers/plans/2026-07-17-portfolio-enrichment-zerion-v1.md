---
type: plan
status: active
project: wcore
date: 2026-07-17
---
# Portfolio Enrichment Zerion V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, server-only Zerion portfolio enrichment that preserves WCORE RPC balances, pricing, signed totals, cache isolation, and fail-open scan behavior.

**Architecture:** A capability-aware provider layer runs once per wallet after cached or live WCORE assets have received native DeFi finalization and before public serialization. Zerion supplies verified complex positions, RPC-verifiable token discovery hints, and internal reconciliation diagnostics; Redis owns all shared leases, budgets, breaker state, and provider caches, while `MemoryCacheStore` disables enrichment. Helius, Etherscan V2, and LI.FI Earn are represented only as disabled provider IDs and capabilities; Route Intelligence remains a separate program.

**Tech Stack:** TypeScript, Node.js fetch and Web Streams, Fastify, Zod, ioredis/Lua, node:test, Vitest, Next.js 16.

---

## Scope And Delivery Boundaries

- Zerion is the only implemented provider in this plan.
- Helius, Etherscan V2, and LI.FI Earn receive type-level provider slots only; they perform no network work.
- Route Intelligence and bridge/swap quote aggregation are not implemented here.
- Enrichment remains disabled by default and cannot start without `ZERION_API_KEY`, atomic Redis, and explicit confirmation that the Zerion account permits `filter[positions]=no_filter`.
- EVM wallet hints are verified by a strict contract-only WCORE rescan. Solana hints are matched against a fresh WCORE Solana token-account scan; a Zerion-only amount or price is never admitted.
- If a hint cannot be verified with a positive WCORE balance and normal WCORE pricing, it is excluded.
- The derived Zerion position sum is internal telemetry only and never replaces or rescales public totals.

## File Structure

### New files

- `wcore-web/apps/api/src/integrations/portfolio-enrichment/types.ts`: provider IDs, capabilities, normalized snapshots, diagnostics, and service contracts.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/chain-map.ts`: reviewed Zerion chain ID to WCORE chain key mapping.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/protocol-aliases.ts`: canonical protocol aliases and namespaced unknown IDs.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/zerion.ts`: bounded HTTP client, structural validation, and response adapter.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/wallet-hints.ts`: WCORE-owned EVM and Solana hint verification.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/merge.ts`: authority, collision, LP-group, receipt-token, and signed-total rules.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/provider-state.ts`: Redis leases, daily budget, breaker, failure cache, and untracked cache.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/orchestrator.ts`: provider cache, single-flight, stale fallback, verification, merge, and telemetry coordination.
- `wcore-web/apps/api/src/integrations/portfolio-enrichment/index.ts`: fail-open factory and disabled future-provider registry.
- `wcore-web/apps/api/src/plugins/scan-finalization.ts`: one wallet-scoped finalization boundary shared by sync, batch, async, and cached paths.

### Existing files changed

- `wcore-web/apps/api/src/config.ts` and `config.test.ts`: typed Zerion configuration and startup validation.
- `wcore-web/packages/core/src/cache/types.ts`, `redis-store.ts`, and tests: atomic Redis capability contract and Lua operations.
- `wcore-web/packages/shared/src/cache-key-registry.ts` and tests: versioned Zerion/provider keys.
- `wcore-web/packages/core/src/engines/types.ts`, `evm-types.ts`, and exports: internal provenance and explicit price source.
- `wcore-web/apps/api/src/server-helpers.ts` and `scan.test.ts`: preserve explicit price source and provider flags.
- `wcore-web/packages/shared/src/scam-detector.ts` and tests: explicit admin-block predicate.
- `wcore-web/apps/api/src/plugins/scan-utils.ts` and scam tests: admin blocks before trusted DeFi flags.
- `wcore-web/apps/web/components/scam-detector.ts`, `TokenTable.tsx`, `ChainCard.tsx`, and tests: one frontend exclusion rule.
- `wcore-web/apps/api/src/plugins/scan.ts` and route tests: invoke enrichment once per wallet on every scan path without polluting `scan:result:*`.
- `wcore-web/apps/api/src/server.ts`: instantiate enrichment from the effective cache backend and inject it into the scan plugin.
- `wcore-web/.env.example`, `.env.production.template`, `README.md`, `DEPLOY.md`, and `TESTING.md`: secure configuration, operation, and opt-in live-test instructions.

## Task 1: Typed Zerion Configuration

**Files:**
- Modify: `wcore-web/apps/api/src/config.ts:10-202`
- Modify: `wcore-web/apps/api/src/config.test.ts`

- [ ] **Step 1: Write failing configuration tests**

Add tests asserting the disabled defaults, all environment overrides, trimmed keys, and startup rejection when enabled without a key:

```ts
assert.deepEqual(config.portfolioEnrichment.zerion, {
  enabled: false,
  apiKey: undefined,
  timeoutMs: 3_000,
  cacheTtlMs: 600_000,
  lastGoodTtlMs: 86_400_000,
  dailyBudget: 1_000,
  maxResponseBytes: 2_000_000,
  maxPositions: 1_000,
});
assert.throws(
  () => getApiConfig({ ZERION_ENRICHMENT_ENABLED: "true", ZERION_API_KEY: "   " }),
  /ZERION_API_KEY is required/,
);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/config.test.ts
```

Expected: FAIL because `portfolioEnrichment` is absent.

- [ ] **Step 3: Add the typed configuration**

Define and parse this exact contract:

```ts
export interface ZerionEnrichmentConfig {
  enabled: boolean;
  apiKey?: string;
  timeoutMs: number;
  cacheTtlMs: number;
  lastGoodTtlMs: number;
  dailyBudget: number;
  maxResponseBytes: number;
  maxPositions: number;
}

portfolioEnrichment: {
  zerion: ZerionEnrichmentConfig;
};
```

Use a strict boolean parser accepting only `true` and `false`, trim the key, require positive finite integers for numeric values, and throw a named configuration error when enabled without a key. Keep `https://api.zerion.io` in the client rather than configuration.

- [ ] **Step 4: Run tests and typecheck**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/config.test.ts
rtk pnpm --filter @wcore/api typecheck
```

Expected: all configuration tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
rtk git add wcore-web/apps/api/src/config.ts wcore-web/apps/api/src/config.test.ts
rtk git commit -m "feat: configure Zerion portfolio enrichment"
```

## Task 2: Atomic Redis Capability

**Files:**
- Modify: `wcore-web/packages/core/src/cache/types.ts`
- Modify: `wcore-web/packages/core/src/cache/redis-store.ts`
- Modify: `wcore-web/packages/core/src/cache/redis-store.test.ts`
- Modify: `wcore-web/apps/api/src/server.ts:46-62`

- [ ] **Step 1: Write failing capability and ownership tests**

Cover type guarding, owner-only deletion, compare-and-set, atomic counter TTL, and Redis fallback detection:

```ts
assert.equal(isAtomicCacheStore(new MemoryCacheStore()), false);
assert.equal(await redis.compareAndDelete("lease", "wrong-owner"), false);
assert.equal(await redis.get("lease"), "right-owner");
assert.equal(await redis.compareAndDelete("lease", "right-owner"), true);
assert.equal(await redis.compareAndSet("state", undefined, { failures: 1 }, 60_000), true);
assert.equal(await redis.incrementWithTtl("budget", 60_000), 1);
assert.ok((await client.pttl("budget")) > 0);
```

Use `TEST_REDIS_URL` only; skip the real Redis cases when it is absent.

- [ ] **Step 2: Run the core cache test and confirm RED**

```powershell
rtk pnpm --filter @wcore/core exec tsx --test src/cache/redis-store.test.ts
```

Expected: FAIL because `AtomicCacheStore` and its methods do not exist.

- [ ] **Step 3: Add the capability interface and type guard**

```ts
export interface AtomicCacheStore extends CacheStore {
  readonly backend: "redis";
  isAvailable(): Promise<boolean>;
  compareAndDelete<T>(key: string, expected: T): Promise<boolean>;
  compareAndSet<T>(key: string, expected: T | undefined, next: T, ttlMs?: number): Promise<boolean>;
  incrementWithTtl(key: string, ttlMs: number): Promise<number>;
}

export function isAtomicCacheStore(cache: CacheStore): cache is AtomicCacheStore {
  return (cache as Partial<AtomicCacheStore>).backend === "redis";
}
```

Do not add these methods to `MemoryCacheStore`.

- [ ] **Step 4: Implement the Redis operations with Lua**

Use Lua so each operation is one Redis transaction. Serialize compared values with the same JSON encoding used by `set()`:

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

For compare-and-set, compare the current raw value, then use `SET key value PX ttl` or `SET key value`. For the budget, run `INCR`; when the result is `1`, run `PEXPIRE` in the same script. `isAvailable()` must issue `PING` and return false on any error. Ensure the cache factory reports the backend actually returned after a Redis connection failure.

- [ ] **Step 5: Run focused and package tests**

```powershell
rtk pnpm --filter @wcore/core exec tsx --test src/cache/redis-store.test.ts
rtk pnpm --filter @wcore/core test
```

Expected: tests PASS; real Redis tests either PASS with `TEST_REDIS_URL` or are explicitly skipped.

- [ ] **Step 6: Commit**

```powershell
rtk git add wcore-web/packages/core/src/cache wcore-web/apps/api/src/server.ts
rtk git commit -m "feat: expose atomic Redis cache operations"
```

## Task 3: Versioned Provider Cache Keys

**Files:**
- Modify: `wcore-web/packages/shared/src/cache-key-registry.ts`
- Modify: `wcore-web/packages/shared/src/cache-key-registry.test.ts`
- Modify: `wcore-web/packages/shared/src/cache-keys.test.ts`

- [ ] **Step 1: Write failing exact-key tests**

Assert these outputs for normalized lowercase addresses and UTC dates:

```ts
expect(cacheKey("zerionPortfolioFresh", { address })).toBe(`zerion:portfolio:v1:${address}:fresh`);
expect(cacheKey("zerionPortfolioLastGood", { address })).toBe(`zerion:portfolio:v1:${address}:last-good`);
expect(cacheKey("zerionPortfolioFailure", { address })).toBe(`zerion:portfolio:v1:${address}:failure`);
expect(cacheKey("zerionPortfolioUntracked", { address })).toBe(`zerion:portfolio:v1:${address}:untracked`);
expect(cacheKey("zerionRequestLease", { address })).toBe(`provider:zerion:request:${address}`);
expect(cacheKey("zerionHalfOpenLease", {})).toBe("provider:zerion:half-open-lease");
expect(cacheKey("zerionDailyBudget", { date: "2026-07-17" })).toBe("provider:zerion:daily:2026-07-17");
expect(cacheKey("zerionBreakerState", {})).toBe("provider:zerion:breaker");
```

- [ ] **Step 2: Run shared tests and confirm RED**

```powershell
rtk pnpm --filter @wcore/shared test
```

Expected: FAIL for unknown cache-key names.

- [ ] **Step 3: Register the keys and validators**

Add the eight names to the canonical registry. Require a valid normalized EVM or Solana address for wallet keys and `YYYY-MM-DD` for the daily key. Provider modules must call `cacheKey()` and must not concatenate these key strings locally.

- [ ] **Step 4: Run shared tests and commit**

```powershell
rtk pnpm --filter @wcore/shared test
rtk git add wcore-web/packages/shared/src/cache-key-registry.ts wcore-web/packages/shared/src/cache-key-registry.test.ts wcore-web/packages/shared/src/cache-keys.test.ts
rtk git commit -m "feat: register portfolio provider cache keys"
```

Expected: shared tests PASS and the commit succeeds.

## Task 4: Provider Contracts, Chain Mapping, And Protocol Aliases

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/types.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/chain-map.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/protocol-aliases.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/mapping.test.ts`

- [ ] **Step 1: Write mapping and contract tests**

Test known mappings, unknown-chain drops, canonical aliases, provider-namespaced unknown protocols, and future providers disabled by default:

```ts
assert.equal(toWcoreChain("arbitrum"), "ARBITRUM_ONE");
assert.equal(toWcoreChain("solana"), "SOLANA");
assert.equal(toWcoreChain("not-reviewed"), undefined);
assert.equal(canonicalProtocol("zerion", "aave-v3"), "aave-v3");
assert.equal(canonicalProtocol("zerion", "new-dapp"), "zerion:new-dapp");
assert.deepEqual(DISABLED_PROVIDER_IDS, ["helius", "etherscan", "lifi-earn"]);
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/mapping.test.ts
```

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Define the normalized contracts**

Use these public internal shapes:

```ts
export type ProviderId = "zerion" | "helius" | "etherscan" | "lifi-earn";
export type EnrichmentPurpose = "complex-positions" | "wallet-hints" | "diagnostics";

export interface ProviderCapabilities {
  requestScope: "wallet" | "chain";
  purposes: readonly EnrichmentPurpose[];
  maxRequests: number;
}

export interface ProviderRequestContext {
  address: string;
  requestedChains: readonly string[];
  purposes: readonly EnrichmentPurpose[];
  maxPositions: number;
}

export interface ProviderWalletHint {
  chain: string;
  contract: string;
}

export interface NormalizedProviderPosition {
  provider: ProviderId;
  chain: string;
  protocol: string;
  type: "collateral" | "vault_share" | "lending_debt" | "staking_locked" | "staking_liquid" | "claimable" | "real_world_asset" | "unknown_defi";
  contract?: string;
  underlyingContract?: string;
  receiptContract?: string;
  poolAddress?: string;
  positionId: string;
  groupId?: string;
  balance: number;
  priceEur: number | null;
  valueEur: number;
  liquidity: "liquid" | "locked" | "claimable" | "unknown";
  providerVerified: true;
}

export interface ProviderPortfolioSnapshot {
  provider: ProviderId;
  walletHints: readonly ProviderWalletHint[];
  positions: readonly NormalizedProviderPosition[];
  derivedPositionValueEur: number;
  observedAt: string;
  diagnostics: Readonly<Record<string, number | string | boolean>>;
}

export interface PortfolioEnrichmentInput {
  address: string;
  requestedChains: readonly string[];
  assetsByChain: ReadonlyMap<string, WalletAssets>;
}

export interface PortfolioEnrichmentResult {
  assetsByChain: Map<string, WalletAssets>;
  diagnostics: Readonly<Record<string, number | string | boolean>>;
}

export interface PortfolioEnrichmentProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  supports(address: string): boolean;
  load(context: ProviderRequestContext): Promise<ProviderPortfolioSnapshot>;
}

export interface PortfolioEnrichmentService {
  enrich(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult>;
}
```

The snapshot must separate `walletHints`, `positions`, `derivedPositionValueEur`, `observedAt`, and safe diagnostics. Position provenance may contain opaque provider IDs, but no raw response, credential, or raw HTTP error.

- [ ] **Step 4: Implement reviewed mappings**

Seed `chain-map.ts` only with Zerion network IDs that can be matched to existing WCORE mainnet keys. Normalize aliases for Aave, Compound, Lido, EigenLayer, Spark, Morpho, Curve, Convex, Uniswap, Balancer, and reviewed protocol variants. Unknown Zerion DApps remain `zerion:<normalized-id>` and cannot collide with another provider's unknown IDs.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/mapping.test.ts
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment
rtk git commit -m "feat: define portfolio enrichment provider contracts"
```

Expected: mapping tests and typecheck PASS.

## Task 5: Bounded Zerion Client And Adapter

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/zerion.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/zerion.test.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/fixtures/zerion-positions.json`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/fixtures/zerion-untracked.json`

- [ ] **Step 1: Add fixtures and failing adapter tests**

The positions fixture must include wallet, deposit, loan, locked, staked, reward, investment, grouped LP, native, hidden, trash, unverified, unknown-chain, invalid-number, and contractless complex examples. Assert:

```ts
assert.equal(request.url.origin, "https://api.zerion.io");
assert.equal(request.url.searchParams.get("filter[positions]"), "no_filter");
assert.equal(request.url.searchParams.get("currency"), "eur");
assert.equal(request.url.searchParams.get("filter[trash]"), "only_non_trash");
assert.equal(request.headers.get("authorization"), `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`);
assert.ok(snapshot.positions.every((position) => position.providerVerified));
assert.ok(snapshot.positions.find((position) => position.type === "lending_debt")!.valueEur < 0);
```

Also test timeout before headers, stalled body, `Content-Length` overflow, chunked overflow, malformed JSON, more than 1,000 raw and normalized positions, valid empty data, changed `400`, allowlisted untracked `400`, `401`, `403`, `429`, `503`, and bounded `Retry-After`.

- [ ] **Step 2: Run the Zerion tests and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/zerion.test.ts
```

Expected: FAIL because `createZerionProvider` is absent.

- [ ] **Step 3: Implement one bounded wallet request**

Use a fixed base URL, `AbortController`, and one timer covering headers and body. Reject an excessive `Content-Length`, then stream `response.body.getReader()` while counting bytes and abort immediately over the cap. Do not retry in this client. Convert HTTP outcomes to a discriminated error with only `kind`, `status`, and bounded retry delay.

- [ ] **Step 4: Validate the full response before exposing rows**

Use Zod at the response envelope and position level. Reject the complete snapshot when its envelope or pagination structure is incomplete. Drop individual entries only for documented semantic exclusions: hidden, trash, non-finite values, invalid contracts, unknown chains, native wallet entries, or unverified fungible metadata. Reject the complete snapshot when the raw or normalized count exceeds the configured limit.

Map loans to negative balance and EUR value. Require every LP component to be provider-verified or drop the whole group. Preserve opaque `positionId`, `groupId`, receipt contract, pool address, protocol, position type, and liquidity internally. Calculate the diagnostic derived sum from structurally complete displayable positions only.

- [ ] **Step 5: Run tests, typecheck, and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/zerion.test.ts
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment
rtk git commit -m "feat: add bounded Zerion portfolio client"
```

Expected: all Zerion adapter and transport tests PASS.

## Task 6: WCORE Verification Of Wallet Hints

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/wallet-hints.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/wallet-hints.test.ts`
- Modify: `wcore-web/packages/core/src/engines/types.ts`
- Modify: `wcore-web/packages/core/src/engines/evm-types.ts`
- Modify: `wcore-web/packages/core/src/engines/dispatch.ts`

- [ ] **Step 1: Write failing authority tests**

Inject an engine verifier and prove provider quantities and prices are ignored:

```ts
const hint = { chain: "ETHEREUM", contract, providerBalance: 999, providerPriceEur: 999 };
const verified = await verifyWalletHints([hint], depsReturning({ balance: 2, priceEur: 3 }));
assert.equal(verified[0].balance, 2);
assert.equal(verified[0].priceEur, 3);
assert.equal(verified[0].valueEur, 6);
assert.equal(verified[0].priceSource, "pricing-cascade");
```

Test zero balance, no price, RPC failure, unknown chain, existing WCORE token collision, duplicate hints, EVM strict contract lists, and Solana filtering by mint after a fresh WCORE scan.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/wallet-hints.test.ts
```

Expected: FAIL because `verifyWalletHints` is absent.

- [ ] **Step 3: Add internal provenance fields**

Extend `WalletAssetPrice` with `priceSource?: string | null`. Extend EVM/SVM token-compatible internal data with optional `providerVerified`, `providerId`, `providerPositionId`, and `providerGroupId`. These fields stay server-side except `priceSource` and public flags.

- [ ] **Step 4: Implement the verifier**

Define injectable dependencies:

```ts
export interface WalletHintVerifierDeps {
  scanEvmHints(chain: string, address: string, contracts: readonly string[]): Promise<WalletAssets>;
  scanSolana(chain: string, address: string): Promise<WalletAssets>;
}
```

Production EVM wiring calls the existing engine with `customTokens` equal to the bounded hint contracts and `strictTokens: true`; production Solana wiring performs one normal authoritative token-account scan and filters its returned mints against the bounded hints. Merge only positive, priced WCORE results absent from the original chain assets. Use WCORE balance, metadata, logo, scam treatment, and price source. Provider balance and price fields must not appear in the verifier input type.

- [ ] **Step 5: Run API and core tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/wallet-hints.test.ts
rtk pnpm --filter @wcore/core test
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment/wallet-hints.ts wcore-web/apps/api/src/integrations/portfolio-enrichment/wallet-hints.test.ts wcore-web/packages/core/src/engines
rtk git commit -m "feat: verify provider token hints with WCORE"
```

Expected: authority tests PASS and no provider quantity or price is used.

## Task 7: Authority-Preserving Position Merge

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/merge.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/merge.test.ts`

- [ ] **Step 1: Write failing merge tests**

Cover every collision and signed-value invariant:

```ts
assert.equal(mergePortfolio(wcoreTokenCollision).addedPositions.length, 0);
assert.equal(mergePortfolio(wcoreNativeDeFiCollision).addedPositions.length, 0);
assert.equal(semanticKey(positionFromZerion), semanticKey(equivalentPositionFromFutureProvider));
assert.equal(mergePortfolio(receiptTokenCollision).addedGroups.length, 0);
assert.equal(mergePortfolio(sharedUnderlyingOnly).addedPositions.length, 1);
assert.ok(mergePortfolio(debtPosition).totalValueEur < originalTotalValueEur);
```

Include aliases, unknown protocol namespaces, opaque provider IDs excluded from semantic keys, pool/receipt fingerprints, contractless complex synthetic internal keys, native wallet exclusion, all-or-nothing LP groups, and WCORE protocol/contract/type tuples.

- [ ] **Step 2: Run the merge test and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/merge.test.ts
```

Expected: FAIL because merge functions are absent.

- [ ] **Step 3: Implement semantic authority and signed recomputation**

Build WCORE indexes before considering provider rows. Apply authority in this exact order: WCORE wallet assets, WCORE native DeFi positions, then provider positions. Reject an entire group on any member collision. Use the semantic tuple `(chain, canonicalProtocol, positionType, assetOrUnderlyingContract, poolOrGroupFingerprint)`; never use provider position IDs for cross-provider equality.

Append accepted positions as internal `WalletAssets` tokens with direct signed values, inline DeFi metadata, `providerVerified: true`, and `priceSource: "zerion"`. Recompute each affected chain total from native plus all token signed values. Return collision counts and added EUR value for telemetry.

- [ ] **Step 4: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/merge.test.ts
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment/merge.ts wcore-web/apps/api/src/integrations/portfolio-enrichment/merge.test.ts
rtk git commit -m "feat: merge verified provider positions safely"
```

Expected: merge tests PASS.

## Task 8: Shared Provider State And Resilience

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/provider-state.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/provider-state.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Use a deterministic clock and an atomic-cache fake. Test five failures opening the breaker, two-minute cooldown, one owner-only half-open probe, success closing/resetting, failed probe reopening, daily budget exhaustion, UTC rollover, request lease ownership, and no state change for valid empty, unsupported, or untracked outcomes.

```ts
assert.equal((await state.recordFailure()).breaker, "closed");
await state.recordFailure(); await state.recordFailure(); await state.recordFailure();
assert.equal((await state.recordFailure()).breaker, "open");
clock.advance(120_000);
assert.equal(await state.tryAcquireHalfOpen("owner-a"), true);
assert.equal(await state.tryAcquireHalfOpen("owner-b"), false);
```

- [ ] **Step 2: Run the state test and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/provider-state.test.ts
```

Expected: FAIL because provider state is absent.

- [ ] **Step 3: Implement bounded CAS transitions**

Represent breaker state as `{ failures, state, openedAt }`. Use bounded compare-and-set loops for shared transitions, a 10-second half-open lease, and owner-only compare-and-delete. Increment the daily key atomically before a real provider request and reject requests over the configured budget. Calculate the daily key and its expiry from UTC midnight boundaries.

- [ ] **Step 4: Implement request outcome caches**

Write two-minute failures, one-hour valid-untracked entries, and bounded `Retry-After` extensions up to ten minutes for `429` and `503`. Do not overwrite last-good here. Unknown `400` is a normal provider failure, not untracked.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/provider-state.test.ts
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment/provider-state.ts wcore-web/apps/api/src/integrations/portfolio-enrichment/provider-state.test.ts
rtk git commit -m "feat: coordinate portfolio provider resilience"
```

Expected: all state and concurrency tests PASS.

## Task 9: Zerion Orchestrator And Fail-Open Factory

**Files:**
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/orchestrator.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/orchestrator.test.ts`
- Create: `wcore-web/apps/api/src/integrations/portfolio-enrichment/index.ts`

- [ ] **Step 1: Write failing cache, concurrency, and factory tests**

Test fresh cache, valid empty cache replacement, last-good after provider failure, no last-good overwrite on any failure, local single-flight, distributed lease contention, 3.5-second loser bound, Redis-unavailable no-call, unsupported Cosmos/TON no-call, one Zerion call for a multichain wallet, and disabled future providers.

```ts
const [a, b] = await Promise.all([service.enrich(input), service.enrich(input)]);
assert.equal(provider.calls, 1);
assert.deepEqual(a.assetsByChain, b.assetsByChain);
assert.equal(await createPortfolioEnrichment({ cache: new MemoryCacheStore(), config }), undefined);
assert.equal(provider.calls, 0);
```

Assert that provider errors return original WCORE assets when last-good is absent and never mutate scan errors, `degraded`, or chain breaker state.

- [ ] **Step 2: Run orchestrator tests and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/orchestrator.test.ts
```

Expected: FAIL because the service and factory are absent.

- [ ] **Step 3: Implement cache-first orchestration**

Normalize the wallet once. Return immediately for unsupported address families, fresh cache, failure cache, untracked cache, open breaker, or exhausted budget. Deduplicate local work with `Map<string, Promise<PortfolioEnrichmentResult>>`. Acquire a 10-second Redis request lease before the provider call; losing replicas poll shared fresh/failure/untracked keys until 3.5 seconds, then return unchanged assets.

On a structurally valid response, verify wallet hints, merge positions, write both fresh and last-good caches, and record success. On a provider failure, write failure state and serve last-good when available. Mark stale only in internal diagnostics. Always release leases with owner-only compare-and-delete.

- [ ] **Step 4: Implement the activation factory**

Return `undefined` when disabled, when the cache lacks `AtomicCacheStore`, or when `isAvailable()` is false. Register Zerion as the only active implementation. Expose capability descriptors for Helius, Etherscan V2, and LI.FI Earn with `enabled: false` and no client factory.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/orchestrator.test.ts
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/integrations/portfolio-enrichment
rtk git commit -m "feat: orchestrate fail-open Zerion enrichment"
```

Expected: orchestrator tests PASS with one request per wallet window.

## Task 10: Serialization And Explicit Scam Blocks

**Files:**
- Modify: `wcore-web/apps/api/src/server-helpers.ts:100-135`
- Modify: `wcore-web/apps/api/src/scan.test.ts`
- Modify: `wcore-web/packages/shared/src/scam-detector.ts`
- Modify: `wcore-web/packages/shared/src/scam-detector.test.ts`
- Modify: `wcore-web/apps/api/src/plugins/scan-utils.ts:214-229`
- Modify: `wcore-web/apps/api/src/scam-filtering.test.ts`
- Modify: `wcore-web/apps/web/components/scam-detector.ts`
- Modify: `wcore-web/apps/web/components/TokenTable.tsx`
- Modify: `wcore-web/apps/web/components/ChainCard.tsx`
- Modify: `wcore-web/apps/web/__tests__/scam-overrides.test.ts`

- [ ] **Step 1: Write failing backend serialization and scam tests**

Assert explicit source preservation and trust ordering:

```ts
assert.equal(buildChainScan(providerAssets).tokens[0].priceSource, "zerion");
assert.deepEqual(buildChainScan(providerAssets).tokens[0].flags.sort(), ["DEFI", "PROVIDER_VERIFIED"]);
assert.equal(calcCleanChainValue(explicitlyBlockedDeFi, detectScam), 0);
assert.equal(calcCleanChainValue(verifiedProviderDebt, detectScam), -25);
```

Also assert absent source falls back to `pricing-cascade` only when a price exists and null price produces null source.

- [ ] **Step 2: Write failing frontend aggregation tests**

Test the same matrix for `DEFI`, `PROVIDER_VERIFIED`, explicit admin block, heuristic scam, trusted debt, and normal wallet fallback token.

- [ ] **Step 3: Run focused tests and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/scan.test.ts src/scam-filtering.test.ts
rtk pnpm --filter @wcore/web exec tsx --test __tests__/scam-overrides.test.ts
```

Expected: at least the provider-source and explicit-block precedence assertions FAIL.

- [ ] **Step 4: Export and apply one explicit-block predicate**

Export `isExplicitlyBlockedContract(contract?: string): boolean` from shared scam detection, covering built-in and runtime-admin blocked contracts without heuristic checks. Backend ordering must be: explicit block excludes; otherwise `DEFI` or `PROVIDER_VERIFIED` bypasses heuristic scam rules; otherwise run `detectScam()`.

In the web-local scam module, expose a single `shouldExcludeAsset(asset)` implementing the same ordering. Replace independent trust checks in `TokenTable` and `ChainCard` with this helper.

- [ ] **Step 5: Preserve explicit price source and flags**

In `buildChainScan()`, set `priceSource` to null for unpriced assets, use the internal explicit source when present, otherwise use `pricing-cascade`. Add `PROVIDER_VERIFIED` only when internal provenance says the provider verification passed; provider wallet hints do not receive this flag.

- [ ] **Step 6: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/shared test
rtk pnpm --filter @wcore/api exec tsx --test src/scan.test.ts src/scam-filtering.test.ts
rtk pnpm --filter @wcore/web exec tsx --test __tests__/scam-overrides.test.ts
rtk git add wcore-web/packages/shared/src/scam-detector.ts wcore-web/packages/shared/src/scam-detector.test.ts wcore-web/apps/api/src/server-helpers.ts wcore-web/apps/api/src/scan.test.ts wcore-web/apps/api/src/plugins/scan-utils.ts wcore-web/apps/api/src/scam-filtering.test.ts wcore-web/apps/web/components/scam-detector.ts wcore-web/apps/web/components/TokenTable.tsx wcore-web/apps/web/components/ChainCard.tsx wcore-web/apps/web/__tests__/scam-overrides.test.ts
rtk git commit -m "fix: enforce scam blocks before provider trust"
```

Expected: shared, API, and web focused tests PASS.

## Task 11: One Wallet-Scoped Finalization Across All Scan Paths

**Files:**
- Create: `wcore-web/apps/api/src/plugins/scan-finalization.ts`
- Create: `wcore-web/apps/api/src/plugins/scan-finalization.test.ts`
- Modify: `wcore-web/apps/api/src/plugins/scan.ts`
- Modify: `wcore-web/apps/api/test/scan-plugin-routes.test.ts`

- [ ] **Step 1: Write the finalizer unit tests**

Inject a fake enrichment service and assert WCT/Compound/registry finalization precedes enrichment, the service sees all requested chains once, signed totals are recomputed, and failure returns original finalized WCORE assets.

```ts
assert.deepEqual(callOrder, ["native-defi", "portfolio-enrichment", "serialize"]);
assert.equal(enrichment.callsFor(wallet), 1);
assert.equal(result.get("ETHEREUM")!.totalValueEur, expectedSignedTotal);
```

- [ ] **Step 2: Add failing route tests for sync, cached, batch, and async**

Extend the injected scan dependencies so tests avoid real RPC, Redis, DB, and Zerion. For each path, assert identical enrichment, exactly one provider call per wallet, unchanged response when the provider throws, unchanged `degraded` and errors, and no provider rows written under `scan:result:*`.

- [ ] **Step 3: Run route tests and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/plugins/scan-finalization.test.ts test/scan-plugin-routes.test.ts
```

Expected: FAIL because scan paths do not share wallet finalization.

- [ ] **Step 4: Extract the wallet finalization boundary**

Use this signature:

```ts
export async function finalizePortfolioAssets(
  input: {
    address: string;
    requestedChains: readonly string[];
    assetsByChain: ReadonlyMap<string, WalletAssets>;
  },
  deps: { portfolioEnrichment?: PortfolioEnrichmentService },
): Promise<Map<string, WalletAssets>>;
```

Keep WCT, Compound, and native registry finalization before this function. Keep writes to `scan:result:*` before enrichment. Serialize only after enrichment.

- [ ] **Step 5: Rewire sync and batch**

For sync, combine cached and fresh finalized assets by wallet, call the finalizer once, then serialize. For batch, build each wallet's complete chain map first and call once per address. Ensure non-EVM batch results receive the same native finalization currently missing from that branch.

- [ ] **Step 6: Rewire async without multiplying requests**

Read valid `scan:result:*` entries before launching engines. Accumulate finalized `WalletAssets` for all chains in the job, preserve partial cache writes of WCORE-only assets, call portfolio finalization once after the pool settles, then replace the job's serialized chain entries. Late timeout completions may update WCORE scan cache but must not start another Zerion request after the job result has finalized.

- [ ] **Step 7: Run route and API tests and commit**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/plugins/scan-finalization.test.ts test/scan-plugin-routes.test.ts
rtk pnpm --filter @wcore/api test
rtk git add wcore-web/apps/api/src/plugins/scan-finalization.ts wcore-web/apps/api/src/plugins/scan-finalization.test.ts wcore-web/apps/api/src/plugins/scan.ts wcore-web/apps/api/test/scan-plugin-routes.test.ts
rtk git commit -m "feat: enrich every scan path once per wallet"
```

Expected: complete API suite PASS; sync, cache, batch, and async return consistent results.

## Task 12: Startup Wiring, Diagnostics, Environment, And Operations

**Files:**
- Modify: `wcore-web/apps/api/src/server.ts`
- Modify: `wcore-web/.env.example`
- Modify: `wcore-web/.env.production.template`
- Modify: `wcore-web/README.md`
- Modify: `wcore-web/DEPLOY.md`
- Modify: `wcore-web/TESTING.md`
- Modify: `wcore-web/apps/api/src/integrations/portfolio-enrichment/orchestrator.test.ts`

- [ ] **Step 1: Add failing startup/no-op tests**

Assert disabled mode creates no client, enabled mode with `MemoryCacheStore` logs one safe warning and creates no client, unavailable Redis disables enrichment, and healthy atomic Redis injects one service. Capture logs and assert they contain neither API keys nor raw response bodies.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
rtk pnpm --filter @wcore/api exec tsx --test src/integrations/portfolio-enrichment/orchestrator.test.ts
```

Expected: FAIL on missing server/factory wiring assertions.

- [ ] **Step 3: Wire the effective cache into startup**

After `createCacheStore()` resolves, derive the backend from the returned instance rather than `REDIS_URL`. Call `createPortfolioEnrichment()` and pass the optional result into `scanPlugin`. Emit structured provider diagnostics for calls, cache hits, stale hits, timeout/status class, parse drops, breaker, budget remaining, positions/EUR added, WCORE collisions, and WCORE versus derived Zerion position-sum delta. Never emit secrets, URLs containing credentials, raw bodies, or raw provider errors.

- [ ] **Step 4: Document all eight variables and activation gates**

Add exactly:

```dotenv
ZERION_ENRICHMENT_ENABLED=false
ZERION_API_KEY=
ZERION_TIMEOUT_MS=3000
ZERION_CACHE_TTL_MS=600000
ZERION_LAST_GOOD_TTL_MS=86400000
ZERION_DAILY_BUDGET=1000
ZERION_MAX_RESPONSE_BYTES=2000000
ZERION_MAX_POSITIONS=1000
```

Document Redis atomic-state requirement, no-call behavior without Redis, single kill switch, server-only secret handling, no official `/portfolio` total claim, and opt-in live tests. State that production activation requires dashboard confirmation for `no_filter` and a Railway API variable, never a web or `NEXT_PUBLIC_*` variable.

- [ ] **Step 5: Run tests and commit**

```powershell
rtk pnpm --filter @wcore/api test
rtk pnpm --filter @wcore/api typecheck
rtk git add wcore-web/apps/api/src/server.ts wcore-web/apps/api/src/integrations/portfolio-enrichment/orchestrator.test.ts wcore-web/.env.example wcore-web/.env.production.template wcore-web/README.md wcore-web/DEPLOY.md wcore-web/TESTING.md
rtk git commit -m "docs: wire and operate Zerion enrichment"
```

Expected: API tests and typecheck PASS; no secret value is tracked.

## Task 13: Full Verification And Controlled Rollout Record

**Files:**
- Modify after verification: `ROADMAP.md`
- Modify after verification: `CHANGELOG.md`

- [ ] **Step 1: Confirm worktree intent before verification**

```powershell
rtk git status --short
rtk git diff --stat
```

Expected: only intended Portfolio Intelligence files are modified; unrelated user changes remain untouched.

- [ ] **Step 2: Run all hermetic tests**

```powershell
rtk pnpm --filter @wcore/core test
rtk pnpm --filter @wcore/shared test
rtk pnpm --filter @wcore/api test
rtk pnpm --filter @wcore/web test
```

Expected: all suites PASS with no live Zerion request.

- [ ] **Step 3: Run static and production-build checks**

```powershell
rtk pnpm typecheck
rtk lint
rtk pnpm build
```

Expected: typecheck, lint, and all package/app builds exit 0.

- [ ] **Step 4: Run Redis integration tests when a dedicated test Redis is configured**

```powershell
rtk pnpm --filter @wcore/core exec tsx --test src/cache/redis-store.test.ts
rtk pnpm --filter @wcore/api exec tsx --import ./set-test-env.js --test test/cache-integration.test.ts
```

Expected: owner leases, CAS, budget TTL, and fallback behavior PASS against `TEST_REDIS_URL`. Never point this variable at production.

- [ ] **Step 5: Verify disabled-mode parity**

Start the API with `ZERION_ENRICHMENT_ENABLED=false`, inject representative sync, batch, async, and cache route fixtures, and compare normalized JSON to the pre-feature fixtures. Expected: byte-equivalent business data, no provider diagnostics exposed publicly, and zero network calls to `api.zerion.io`.

- [ ] **Step 6: Update rollout records without claiming activation**

Record framework completion, test evidence, disabled-by-default status, and the two remaining production gates in `ROADMAP.md` and `CHANGELOG.md`: a generated Zerion key and confirmed `no_filter` entitlement. Do not claim Zerion production coverage before both are satisfied.

- [ ] **Step 7: Commit verification records**

```powershell
rtk git add ROADMAP.md CHANGELOG.md
rtk git commit -m "docs: record Zerion enrichment readiness"
```

- [ ] **Step 8: Production activation after both external gates are satisfied**

Set the eight variables only on the Railway API service, initially with the documented conservative defaults. Deploy API through `wcore-web/scripts/deploy.ps1 -Service api`, verify JSON health and disabled web secret exposure, enable the single kill switch, and inspect selected known EVM and Solana wallets for provider call count, cache behavior, collisions, signed debt, diagnostic delta, and unchanged chain degradation. If any invariant fails, set `ZERION_ENRICHMENT_ENABLED=false` and redeploy the API variable change.

## Acceptance Checklist

- [ ] Disabled or unavailable enrichment is a strict no-op and makes no provider call.
- [ ] Zerion is called at most once per wallet during each fresh, failure, untracked, or distributed-lease window.
- [ ] Live and cached sync, batch, and async paths produce consistent enrichment.
- [ ] WCORE RPC/Multicall balances and normal WCORE pricing own every wallet fallback token.
- [ ] Existing WCORE wallet and native DeFi positions win every collision.
- [ ] Loans remain negative through merge, serialization, backend clean totals, and frontend totals.
- [ ] Explicit admin blocks win before `DEFI` or `PROVIDER_VERIFIED` trust.
- [ ] Malformed, partial, oversized, unverified, trash, hidden, and unknown-chain provider data never reaches display totals.
- [ ] Last-good survives every failure and valid empty snapshots can replace both provider caches.
- [ ] Provider failures do not alter chain errors, `degraded`, or chain circuit breakers.
- [ ] Provider secrets remain server-only and absent from URLs, logs, responses, and `NEXT_PUBLIC_*` variables.
- [ ] The derived Zerion sum remains internal diagnostics and is never described as the official portfolio total.
- [ ] Helius, Etherscan V2, and LI.FI Earn remain disabled slots with no network implementation.
- [ ] Route Intelligence remains independent and receives no portfolio-enrichment cache, budget, breaker, secret, or execution state.
