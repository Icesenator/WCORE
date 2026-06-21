# EVM Balance Consensus Implementation Plan

> **Historical/completed plan.** Kept for implementation history only; verify current consensus behavior in `packages/core` before acting on any task here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EVM token/native balances resilient to unstable RPCs by resolving explicit votes from live RPC, Multicall, and cache.

**Architecture:** Add a focused `packages/core/src/balances/` module with a deterministic `resolveBalance()` function. Integrate it into `packages/core/src/engines/evm.ts` without changing API/frontend response shape, while adding cache timestamps and `[DEGRADED]` diagnostics.

**Tech Stack:** TypeScript, Node test runner (`node --import tsx --test`), WCORE core package, Redis-compatible `CacheStore`, EVM RPC dispatcher.

---

## File Structure

- Create: `packages/core/src/balances/consensus.ts` - pure balance decision resolver and types.
- Create: `packages/core/src/balances/consensus.test.ts` - resolver unit tests.
- Create: `packages/core/src/balances/index.ts` - exports balance consensus module.
- Modify: `packages/core/src/index.ts` - export `balances/index.js`.
- Modify: `packages/core/src/engines/evm.ts` - collect balance votes, use resolver, write richer cache entries, preserve degraded balances.
- Modify: `packages/core/src/engines/evm.test.ts` - EVM integration tests for cache fallback, confirmed zero, non-ERC20 skip, native fallback.

## Implementation Notes

- Keep v1 EVM-only. Do not modify SVM or Cosmos.
- Keep frontend/API response shape unchanged.
- Legacy cache entries `{ balance: string }` must remain readable.
- New cache entries should use `{ balance: string; ts: number; source: BalanceSource; confidence: number }`.
- Use `rtk` prefix for shell commands.
- Stage and commit only files touched by the task being completed.

### Task 1: Add Balance Consensus Resolver Tests

**Files:**
- Create: `packages/core/src/balances/consensus.test.ts`

- [ ] **Step 1: Create the failing test file**

Create `packages/core/src/balances/consensus.test.ts` with:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { resolveBalance, type BalanceVote } from "./consensus.js";

const NOW = 1_800_000;

function vote(partial: Partial<BalanceVote> & { source: BalanceVote["source"]; raw: bigint }): BalanceVote {
  return {
    confidence: 1,
    observedAt: NOW,
    ...partial,
  };
}

test("live consensus zero beats fresh positive cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 0n, confidence: 1, consensus: true, observedAt: NOW }),
    vote({ source: "cache", raw: 123n, confidence: 0.8, observedAt: NOW - 10_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 0n);
  assert.equal(decision.source, "rpc");
  assert.equal(decision.degraded, false);
  assert.equal(decision.reason, "live_consensus");
});

test("failed live read plus fresh positive cache returns degraded cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 0n, confidence: 0, error: "consensus failed", observedAt: NOW }),
    vote({ source: "cache", raw: 456n, confidence: 0.8, observedAt: NOW - 20_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 456n);
  assert.equal(decision.source, "cache");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "cache_fallback_live_failed");
});

test("single healthy live read beats stale cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 789n, confidence: 0.7, observedAt: NOW }),
    vote({ source: "cache", raw: 456n, confidence: 0.4, observedAt: NOW - 25 * 60 * 60 * 1000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 789n);
  assert.equal(decision.source, "rpc");
  assert.equal(decision.degraded, false);
  assert.equal(decision.reason, "best_live_vote");
});

test("legacy cache without observedAt remains degraded fallback", () => {
  const decision = resolveBalance([
    { source: "cache", raw: 999n, confidence: 0.3 },
  ], { nowMs: NOW });

  assert.equal(decision.raw, 999n);
  assert.equal(decision.source, "cache");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "legacy_cache_fallback");
});

test("positive cache conflict chooses most recent fallback", () => {
  const decision = resolveBalance([
    vote({ source: "cache", raw: 100n, confidence: 0.6, observedAt: NOW - 50_000 }),
    vote({ source: "indexer", raw: 200n, confidence: 0.6, observedAt: NOW - 10_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 200n);
  assert.equal(decision.source, "indexer");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "balance_conflict");
});

test("no usable votes returns degraded zero", () => {
  const decision = resolveBalance([], { nowMs: NOW });

  assert.equal(decision.raw, 0n);
  assert.equal(decision.source, "none");
  assert.equal(decision.confidence, 0);
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "no_votes");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk node --import tsx --test packages/core/src/balances/consensus.test.ts`

Expected: FAIL with module not found for `./consensus.js`.

- [ ] **Step 3: Commit failing tests**

```powershell
rtk git add packages/core/src/balances/consensus.test.ts
rtk git commit -m "test: add evm balance consensus resolver cases"
```

### Task 2: Implement Balance Consensus Resolver

**Files:**
- Create: `packages/core/src/balances/consensus.ts`
- Create: `packages/core/src/balances/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add resolver implementation**

Create `packages/core/src/balances/consensus.ts` with:

```typescript
export type BalanceSource = "rpc" | "multicall" | "cache" | "explorer" | "indexer" | "none";

export interface BalanceVote {
  source: Exclude<BalanceSource, "none">;
  raw: bigint;
  confidence: number;
  observedAt?: number;
  consensus?: boolean;
  endpoint?: string;
  error?: string;
}

export interface BalanceDecision {
  raw: bigint;
  source: BalanceSource;
  confidence: number;
  degraded: boolean;
  reason: string;
  votes: BalanceVote[];
}

export interface BalanceConsensusPolicy {
  nowMs: number;
  freshCacheMs: number;
  staleCacheMs: number;
  maxCacheMs: number;
  minLiveConfidence: number;
  minFallbackConfidence: number;
}

const DEFAULT_POLICY: BalanceConsensusPolicy = {
  nowMs: Date.now(),
  freshCacheMs: 60 * 60 * 1000,
  staleCacheMs: 24 * 60 * 60 * 1000,
  maxCacheMs: 7 * 24 * 60 * 60 * 1000,
  minLiveConfidence: 0.65,
  minFallbackConfidence: 0.25,
};

const LIVE_SOURCES = new Set<BalanceSource>(["rpc", "multicall"]);
const FALLBACK_SOURCES = new Set<BalanceSource>(["cache", "explorer", "indexer"]);

export function resolveBalance(
  votes: BalanceVote[],
  policyOverrides: Partial<BalanceConsensusPolicy> = {},
): BalanceDecision {
  const policy = { ...DEFAULT_POLICY, ...policyOverrides };
  const usable = votes.filter((v) => v.confidence > 0 && !v.error);

  if (usable.length === 0) {
    return { raw: 0n, source: "none", confidence: 0, degraded: true, reason: "no_votes", votes };
  }

  const liveConsensus = usable
    .filter((v) => LIVE_SOURCES.has(v.source) && v.consensus === true)
    .sort(sortByConfidenceThenObservedAt(policy.nowMs))[0];
  if (liveConsensus) {
    return { raw: liveConsensus.raw, source: liveConsensus.source, confidence: liveConsensus.confidence, degraded: false, reason: "live_consensus", votes };
  }

  const strongLive = usable
    .filter((v) => LIVE_SOURCES.has(v.source) && v.confidence >= policy.minLiveConfidence)
    .sort(sortByConfidenceThenObservedAt(policy.nowMs))[0];

  const fallback = usable
    .filter((v) => FALLBACK_SOURCES.has(v.source) && v.raw > 0n)
    .map((v) => withAgeAdjustedConfidence(v, policy))
    .filter((v) => v.adjustedConfidence >= policy.minFallbackConfidence)
    .sort((a, b) => {
      if (a.adjustedConfidence !== b.adjustedConfidence) return b.adjustedConfidence - a.adjustedConfidence;
      return (b.observedAt ?? 0) - (a.observedAt ?? 0);
    })[0];

  if (strongLive) {
    const staleFallback = fallback && fallback.adjustedConfidence < strongLive.confidence;
    if (!fallback || staleFallback || strongLive.raw > 0n) {
      return { raw: strongLive.raw, source: strongLive.source, confidence: strongLive.confidence, degraded: false, reason: "best_live_vote", votes };
    }
  }

  if (fallback) {
    const liveFailed = votes.some((v) => LIVE_SOURCES.has(v.source) && (v.error || v.confidence === 0));
    const conflicts = usable.some((v) => FALLBACK_SOURCES.has(v.source) && v.raw > 0n && v.raw !== fallback.raw);
    const reason = fallback.observedAt == null
      ? "legacy_cache_fallback"
      : conflicts
        ? "balance_conflict"
        : liveFailed
          ? "cache_fallback_live_failed"
          : "fallback_balance";
    return { raw: fallback.raw, source: fallback.source, confidence: fallback.adjustedConfidence, degraded: true, reason, votes };
  }

  if (strongLive) {
    return { raw: strongLive.raw, source: strongLive.source, confidence: strongLive.confidence, degraded: false, reason: "best_live_vote", votes };
  }

  return { raw: 0n, source: "none", confidence: 0, degraded: true, reason: "no_reliable_vote", votes };
}

function sortByConfidenceThenObservedAt(nowMs: number): (a: BalanceVote, b: BalanceVote) => number {
  return (a, b) => {
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return observedAtOrOld(b, nowMs) - observedAtOrOld(a, nowMs);
  };
}

function observedAtOrOld(vote: BalanceVote, nowMs: number): number {
  return vote.observedAt ?? (nowMs - DEFAULT_POLICY.maxCacheMs);
}

function withAgeAdjustedConfidence(vote: BalanceVote, policy: BalanceConsensusPolicy): BalanceVote & { adjustedConfidence: number } {
  if (vote.observedAt == null) return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.3) };
  const age = Math.max(0, policy.nowMs - vote.observedAt);
  if (age > policy.maxCacheMs) return { ...vote, adjustedConfidence: 0 };
  if (age <= policy.freshCacheMs) return { ...vote, adjustedConfidence: vote.confidence };
  if (age <= policy.staleCacheMs) return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.55) };
  return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.25) };
}
```

- [ ] **Step 2: Add exports**

Create `packages/core/src/balances/index.ts` with:

```typescript
export * from "./consensus.js";
```

Modify `packages/core/src/index.ts` to include:

```typescript
export * from "./balances/index.js";
```

- [ ] **Step 3: Run resolver tests**

Run: `rtk node --import tsx --test packages/core/src/balances/consensus.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 4: Commit resolver**

```powershell
rtk git add packages/core/src/balances packages/core/src/index.ts
rtk git commit -m "feat: add evm balance consensus resolver"
```

### Task 3: Add EVM Cache Vote Helpers

**Files:**
- Modify: `packages/core/src/engines/evm.ts`

- [ ] **Step 1: Add imports and helper types**

Modify imports in `packages/core/src/engines/evm.ts`:

```typescript
import { resolveBalance, type BalanceDecision, type BalanceSource, type BalanceVote } from "../balances/index.js";
```

Add near constants:

```typescript
interface BalanceCacheEntry {
  balance: string;
  ts?: number;
  source?: BalanceSource;
  confidence?: number;
}

function cacheVote(entry: BalanceCacheEntry | undefined): BalanceVote | undefined {
  if (!entry) return undefined;
  try {
    return {
      source: "cache",
      raw: BigInt(entry.balance),
      confidence: entry.confidence ?? 0.8,
      observedAt: entry.ts,
    };
  } catch {
    return undefined;
  }
}

function liveVote(source: "rpc" | "multicall", raw: bigint, consensus: boolean, confidence: number, endpoint?: string): BalanceVote {
  return { source, raw, consensus, confidence, endpoint, observedAt: Date.now() };
}

function failedLiveVote(source: "rpc" | "multicall", error: string): BalanceVote {
  return { source, raw: 0n, confidence: 0, error, observedAt: Date.now() };
}

function cacheEntry(decision: BalanceDecision): BalanceCacheEntry {
  return {
    balance: decision.raw.toString(),
    ts: Date.now(),
    source: decision.source,
    confidence: decision.confidence,
  };
}

function pushBalanceDecisionError(errors: string[], symbol: string, decision: BalanceDecision): void {
  if (!decision.degraded || decision.source === "none") return;
  errors.push(`[DEGRADED] ${symbol} balance: ${decision.reason}, using ${decision.source} fallback`);
}
```

- [ ] **Step 2: Run TypeScript build to catch import/type failures**

Run: `rtk pnpm --filter @wcore/core build`

Expected: PASS or fail only if Task 2 was not completed. If it fails because helpers are unused, continue to Task 4 and rerun after integration.

- [ ] **Step 3: Commit helper scaffold if build passes**

```powershell
rtk git add packages/core/src/engines/evm.ts
rtk git commit -m "refactor: add evm balance vote helpers"
```

If build fails due unused imports under current lint/build config, do not commit this task separately. Continue to Task 4 and commit Task 3 + Task 4 together.

### Task 4: Integrate Native Balance Decisions

**Files:**
- Modify: `packages/core/src/engines/evm.ts:180-204`
- Modify: `packages/core/src/engines/evm.ts:605-624`

- [ ] **Step 1: Extend native read result**

Change `readNativeBalance` return type and success/failure returns:

```typescript
): Promise<{ balance: bigint; consensusFailed: boolean; vote: BalanceVote }> {
  const res = await dispatcher.run(endpoints, (endpoint, rpcOpts) =>
    rpc.getBalance(endpoint, address, "latest", rpcOpts),
  (value) => value.toString());
  if (res.consensus && res.value != null) {
    const winner = res.attempts.find((a) => a.ok && a.value != null);
    if (winner) rpcHealth.recordSuccess(chainKey, winner.endpoint);
    return { balance: res.value, consensusFailed: false, vote: liveVote("rpc", res.value, true, 1, winner?.endpoint) };
  }
  for (const ep of endpoints) rpcHealth.recordFailure(chainKey, ep);
  errors.push("native balance consensus failed");
  return { balance: 0n, consensusFailed: true, vote: failedLiveVote("rpc", "native balance consensus failed") };
}
```

- [ ] **Step 2: Replace native fallback block with resolver decision**

Replace the native balance block inside `nativePromise` with:

```typescript
const nativeRead = disableNative
  ? { balance: 0n, consensusFailed: false, vote: liveVote("rpc", 0n, true, 1) }
  : await readNativeBalance(dispatcher, rpc, effectiveEndpoints, normalizedAddress, errors, key);

const nativeVotes: BalanceVote[] = [nativeRead.vote];
const nativeCacheKey = `native:${key.toLowerCase()}:${normalizedAddress}`;
if (nativeRead.consensusFailed && !disableNative && cache) {
  const cached = await cache.get<BalanceCacheEntry>(nativeCacheKey);
  const vote = cacheVote(cached);
  if (vote) nativeVotes.push(vote);
}

const nativeDecision = resolveBalance(nativeVotes);
let nativeBalance = nativeDecision.raw;
pushBalanceDecisionError(errors, String(chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE"), nativeDecision);

if (!disableNative && cache && nativeDecision.source !== "cache" && nativeDecision.confidence >= 0.65) {
  cache.set(nativeCacheKey, cacheEntry(nativeDecision), 3600_000).catch(() => {});
}
```

Keep the existing call to `priceNative(chain, nativeBalance, ...)` after this block.

- [ ] **Step 3: Run core tests**

Run: `rtk pnpm --filter @wcore/core test`

Expected: existing tests pass. If an existing native fallback test expects the old exact error string only, update it to include the new `[DEGRADED]` string while preserving the old consensus failure error.

- [ ] **Step 4: Commit native integration**

```powershell
rtk git add packages/core/src/engines/evm.ts packages/core/src/engines/evm.test.ts
rtk git commit -m "feat: resolve evm native balances with consensus votes"
```

### Task 5: Integrate ERC-20 Balance Decisions

**Files:**
- Modify: `packages/core/src/engines/evm.ts:404-453`
- Modify: `packages/core/src/engines/evm.ts:626-665`
- Modify: `packages/core/src/engines/evm.test.ts`

- [ ] **Step 1: Extend ERC-20 read result**

Change `readErc20Balance` return type:

```typescript
): Promise<{ balance: bigint; consensusFailed: boolean; skipped?: boolean; vote: BalanceVote }> {
```

Change skip return before RPC:

```typescript
if (skip) return { balance: 0n, consensusFailed: false, skipped: true, vote: failedLiveVote("rpc", "non-erc20 skip cache") };
```

Change success return:

```typescript
const decoded = decodeUint256(res.value);
return { balance: decoded, consensusFailed: false, vote: liveVote("rpc", decoded, true, 1, winner?.endpoint) };
```

Change all-reverted return:

```typescript
return { balance: 0n, consensusFailed: false, skipped: true, vote: failedLiveVote("rpc", "non-erc20") };
```

Change final failure return:

```typescript
return { balance: 0n, consensusFailed: true, vote: failedLiveVote("rpc", `${contract} balance consensus failed`) };
```

- [ ] **Step 2: Create multicall votes in balance loop**

Inside the `resolved = await Promise.all(group.map(...))` callback, replace raw assignment logic with this pattern:

```typescript
const votes: BalanceVote[] = [];
let skipped = false;

if (result?.success && result.returnData && result.returnData !== "0x") {
  try {
    const decoded = decodeUint256(result.returnData);
    votes.push(liveVote("multicall", decoded, true, 0.95));
  } catch {
    const ercRead = await readErc20Balance(dispatcher, rpc, effectiveEndpoints, known.contract, normalizedAddress, errors, key, cache);
    votes.push(ercRead.vote);
    skipped = ercRead.skipped === true;
  }
} else {
  votes.push(failedLiveVote("multicall", "multicall miss"));
  const ercRead = await readErc20Balance(dispatcher, rpc, effectiveEndpoints, known.contract, normalizedAddress, errors, key, cache);
  votes.push(ercRead.vote);
  skipped = ercRead.skipped === true;
}

if (skipped) return null;

const tokenCacheKey = `token:${key.toLowerCase()}:${known.contract.toLowerCase()}:${normalizedAddress}`;
if (cache) {
  const cached = await cache.get<BalanceCacheEntry>(tokenCacheKey);
  const vote = cacheVote(cached);
  if (vote) votes.push(vote);
}

const decision = resolveBalance(votes);
pushBalanceDecisionError(errors, known.symbol, decision);
const raw = decision.raw;

if (raw > 0n && cache && decision.source !== "cache" && decision.confidence >= 0.65) {
  cache.set(tokenCacheKey, cacheEntry(decision), 3600_000).catch(() => {});
}
if (raw === 0n && cache && decision.source !== "cache" && decision.confidence >= 0.65) {
  cache.set(tokenCacheKey, cacheEntry(decision), 3600_000).catch(() => {});
}
```

Keep existing decimals and `formatUnits(raw, effectiveDecimals)` code after this block.

- [ ] **Step 3: Add EVM regression test for cache fallback**

In `packages/core/src/engines/evm.test.ts`, add a test using `MemoryCacheStore` that preloads:

```typescript
await cache.set(`token:test:0x0000000000000000000000000000000000000001:${OWNER}`, {
  balance: "1000000000000000000",
  ts: Date.now(),
  source: "rpc",
  confidence: 1,
}, 3600_000);
```

The mocked RPC must make `balanceOf` fail consensus. Expected assertions:

```typescript
assert.equal(result.tokens.length, 1);
assert.equal(result.tokens[0]?.balance, 1);
assert.ok(result.errors.some((e) => e.includes("[DEGRADED]") && e.includes("cache_fallback_live_failed")));
```

- [ ] **Step 4: Add EVM regression test for confirmed zero**

In `packages/core/src/engines/evm.test.ts`, add a test with the same cached positive entry but mocked live `balanceOf` consensus returning encoded zero. Expected assertions:

```typescript
assert.equal(result.tokens.length, 0);
const cached = await cache.get<{ balance: string }>(`token:test:0x0000000000000000000000000000000000000001:${OWNER}`);
assert.equal(cached?.balance, "0");
```

- [ ] **Step 5: Run EVM tests**

Run: `rtk node --import tsx --test packages/core/src/engines/evm.test.ts packages/core/src/balances/consensus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit ERC-20 integration**

```powershell
rtk git add packages/core/src/engines/evm.ts packages/core/src/engines/evm.test.ts packages/core/src/balances
rtk git commit -m "feat: resolve evm token balances with cache-aware consensus"
```

### Task 6: Final Verification

**Files:**
- Verify only. No code changes expected.

- [ ] **Step 1: Run core test suite**

Run: `rtk pnpm --filter @wcore/core test`

Expected: PASS. Existing expected count may increase by new tests.

- [ ] **Step 2: Run core build**

Run: `rtk pnpm --filter @wcore/core build`

Expected: PASS.

- [ ] **Step 3: Run API type/build check if available**

Run: `rtk pnpm --filter @wcore/api build`

Expected: PASS. If the package has no `build` script, record the exact package-manager output and run `rtk pnpm typecheck` instead.

- [ ] **Step 4: Inspect git status and recent commits**

Run: `rtk git status`

Expected: only intended files changed or clean after commits.

Run: `rtk git log --oneline -5`

Expected: recent commits include resolver tests, resolver implementation, native integration, ERC-20 integration.

- [ ] **Step 5: Final commit for any test-only adjustments**

If verification required changes, commit them:

```powershell
rtk git add packages/core/src/balances packages/core/src/engines/evm.ts packages/core/src/engines/evm.test.ts packages/core/src/index.ts
rtk git commit -m "test: verify evm balance consensus integration"
```

If no files changed, do not create an empty commit.
