import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PortfolioEnrichmentInput,
  PortfolioEnrichmentProvider,
  PortfolioEnrichmentResult,
  ProviderId,
  ProviderPortfolioSnapshot,
  ProviderRequestContext,
} from "./types.js";
import type { WalletAssets } from "@wcore/core";

import {
  createEnrichmentBreaker,
  createPortfolioEnrichmentService,
  createSlidingWindowBudget,
  type EnrichmentCache,
  type EnrichmentCacheEntry,
  type ProviderPolicy,
} from "./service.js";

function makeProvider(id: ProviderId, loadImpl: (ctx: ProviderRequestContext) => Promise<ProviderPortfolioSnapshot>, supportsImpl = (_addr: string) => true): PortfolioEnrichmentProvider {
  return {
    id,
    capabilities: { requestScope: "wallet", purposes: ["complex-positions", "wallet-hints", "diagnostics"], maxRequests: 5 },
    supports: supportsImpl,
    load: loadImpl,
  };
}
function makeSnapshot(provider: ProviderId, positions = 1, hints = 0): ProviderPortfolioSnapshot {
  return {
    provider,
    walletHints: Array.from({ length: hints }, (_, i) => ({ chain: "ETHEREUM", contract: `0x${"0".repeat(39)}${i}` })),
    positions: Array.from({ length: positions }, (_, i) => ({
      provider,
      chain: "ETHEREUM",
      protocol: `protocol-${i}`,
      type: "vault_share" as const,
      positionId: `${provider}-pos-${i}`,
      balance: 1,
      priceEur: null,
      valueEur: 1,
      liquidity: "liquid" as const,
      providerVerified: true as const,
    })),
    derivedPositionValueEur: positions,
    observedAt: "2026-01-01T00:00:00.000Z",
    diagnostics: {},
  };
}
const defaultPolicy: ProviderPolicy = { enabled: true, timeoutMs: 1_000, maxPositions: 1_000, allowStale: true, staleTtlMs: 60_000, purposes: ["complex-positions", "wallet-hints", "diagnostics"] };
const testClock = () => { let t = 0; return { now: () => t, advance: (ms: number) => (t += ms) }; };
const testInput = (address = "0xABCDEF0123456789012345678901234567890123", chains = ["ETHEREUM"]): PortfolioEnrichmentInput => ({ address, requestedChains: chains, assetsByChain: new Map<string, WalletAssets>() });

test("SUCCESS: positions stored in per-provider cache namespace", async () => {
  const clock = testClock();
  const cache = new Map<string, EnrichmentCacheEntry>();
  const store: EnrichmentCache = {
    get: async (k) => cache.get(k) ?? null,
    set: async (k, v) => { cache.set(k, v); },
  };
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => makeSnapshot("zerion", 2))],
    policyFor: () => defaultPolicy,
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
    cache: store,
    now: clock.now,
  });
  const out = await svc.run(testInput());
  assert.equal(out[0]?.status, "SUCCESS");
  assert.equal(out[0]?.stale, false);
  assert.equal(out[0]?.snapshot?.positions.length, 2);
  assert.ok([...cache.keys()].every((k) => k.includes("zerion")), "cache must be namespaced per provider");
});

test("EMPTY: zero positions and zero hints is not SUCCESS and not an error", async () => {
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("helius", async () => makeSnapshot("helius", 0, 0))],
    policyFor: () => defaultPolicy,
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const [o] = await svc.run(testInput());
  assert.equal(o?.status, "EMPTY");
  assert.equal(o?.stale, false);
});

test("TIMEOUT: bounded even if provider never settles", async () => {
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", () => new Promise(() => {}))],
    policyFor: () => ({ ...defaultPolicy, timeoutMs: 5, allowStale: false }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const [o] = await svc.run(testInput());
  assert.equal(o?.status, "TIMEOUT");
  assert.equal(o?.errorKind, "timeout");
});

test("PROVIDER_ERROR: provider throwing never rejects run/enrich", async () => {
  const boom = Object.assign(new Error("boom"), { kind: "server" });
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => { throw boom; })],
    policyFor: () => ({ ...defaultPolicy, allowStale: false }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const r = await svc.enrich(testInput());
  assert.ok(r && typeof r === "object", "enrich must never throw");
  const [o] = await svc.run(testInput());
  assert.equal(o?.status, "PROVIDER_ERROR");
});

test("DISABLED by policy or unsupported address: no provider call", async () => {
  let calls = 0;
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("etherscan", async () => { calls++; return makeSnapshot("etherscan"); })],
    policyFor: () => ({ ...defaultPolicy, enabled: false }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const [o] = await svc.run(testInput());
  assert.equal(o?.status, "DISABLED");
  assert.equal(calls, 0);

  const svc2 = createPortfolioEnrichmentService({
    providers: [makeProvider("etherscan", async () => { calls++; return makeSnapshot("etherscan"); }, () => false)],
    policyFor: () => defaultPolicy,
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const [o2] = await svc2.run(testInput());
  assert.equal(o2?.status, "DISABLED");
  assert.equal(calls, 0);
});

test("single-flight: identical concurrent wallet loads share one provider call", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => { calls++; await gate; return makeSnapshot("zerion"); })],
    policyFor: () => defaultPolicy,
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const input = testInput("0x1111111111111111111111111111111111111111", ["ETHEREUM", "BASE"]);
  const a = svc.run(input);
  const b = svc.run(input);
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls, 1, "second concurrent identical call must reuse the in-flight promise");
  assert.equal(ra[0]?.status, "SUCCESS");
  assert.equal(rb[0]?.status, "SUCCESS");
});

test("STALE: failure with a cached healthy snapshot serves it as stale=true", async () => {
  const clock = testClock();
  let fail = false;
  const cache = new Map<string, EnrichmentCacheEntry>();
  const store: EnrichmentCache = {
    get: async (k) => cache.get(k) ?? null,
    set: async (k, v) => { cache.set(k, v); },
  };
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => {
      if (fail) throw Object.assign(new Error("rate"), { kind: "rate" });
      return makeSnapshot("zerion", 3);
    })],
    policyFor: () => defaultPolicy,
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
    cache: store,
    now: clock.now,
  });
  const ok = await svc.run(testInput("0x2222222222222222222222222222222222222222"));
  assert.equal(ok[0]?.status, "SUCCESS");
  fail = true;
  const stale = await svc.run(testInput("0x2222222222222222222222222222222222222222"));
  assert.equal(stale[0]?.status, "STALE");
  assert.equal(stale[0]?.stale, true);
  assert.equal(stale[0]?.errorKind, "rate");
});

test("budget_exhausted: independent per-provider budget blocks the second call", async () => {
  const clock = testClock();
  const budget = createSlidingWindowBudget({ limit: 1, windowMs: 1_000, now: clock.now });
  let calls = 0;
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => { calls++; return makeSnapshot("zerion"); })],
    policyFor: () => defaultPolicy,
    budget,
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
    now: clock.now,
  });
  await svc.run(testInput("0x3333333333333333333333333333333333333333"));
  const blocked = await svc.run(testInput("0x3333333333333333333333333333333333333333"));
  assert.equal(blocked[0]?.status, "DISABLED");
  assert.equal(blocked[0]?.errorKind, "budget_exhausted");
  assert.equal(calls, 1, "provider must not be called when the budget is exhausted");
});

test("circuit_open: after N consecutive failures the provider stops being called", async () => {
  const clock = testClock();
  const breaker = createEnrichmentBreaker({ failureThreshold: 2, openMs: 60_000, now: clock.now });
  let calls = 0;
  const svc = createPortfolioEnrichmentService({
    providers: [makeProvider("zerion", async () => { calls++; throw Object.assign(new Error("x"), { kind: "network" }); })],
    policyFor: () => ({ ...defaultPolicy, allowStale: false }),
    budget: { tryConsume: () => true },
    breaker,
    now: clock.now,
  });
  await svc.run(testInput("0x4444444444444444444444444444444444444444"));
  await svc.run(testInput("0x4444444444444444444444444444444444444444"));
  assert.equal(calls, 2);
  const o = (await svc.run(testInput("0x4444444444444444444444444444444444444444")))[0];
  assert.equal(o?.status, "DISABLED");
  assert.equal(o?.errorKind, "circuit_open");
  assert.equal(calls, 2, "no provider call once circuit is open");
  clock.advance(61_000);
  await svc.run(testInput("0x4444444444444444444444444444444444444444"));
  assert.equal(calls, 3, "half-open after cooldown, one probe call allowed");
});

test("provider error never opens a chain breaker and never mutates assetsByChain (WCORE authority)", async () => {
  let chainCalls = 0;
  const assets = new Map<string, WalletAssets>();
  assets.set("ETHEREUM", { native: 123456789n, tokens: [] } as unknown as WalletAssets);
  const svc = createPortfolioEnrichmentService({
    providers: [
      makeProvider("zerion", async () => { throw Object.assign(new Error("boom"), { kind: "server" }); }),
      makeProvider("helius", async () => makeSnapshot("helius", 7)),
    ],
    policyFor: (id) => ({ ...defaultPolicy, enabled: true, timeoutMs: id === "zerion" ? 10 : defaultPolicy.timeoutMs }),
    budget: { tryConsume: () => { chainCalls++; return true; } },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const result: PortfolioEnrichmentResult = await svc.enrich({ address: "0x5555555555555555555555555555555555555555", requestedChains: ["ETHEREUM"], assetsByChain: assets });
  assert.equal(chainCalls, 2, "both providers must be attempted independently");
  assert.equal(result.assetsByChain.get("ETHEREUM"), assets.get("ETHEREUM"), "assets unchanged: one provider fault can't touch WCORE data");
  assert.ok(result.diagnostics.enrich_zerion, "diagnostics report per provider");
  assert.ok(result.diagnostics.enrich_helius);
});

test("timeout budget for one provider does not block another (independent)", async () => {
  const svc = createPortfolioEnrichmentService({
    providers: [
      makeProvider("etherscan", () => new Promise(() => {})), // hangs
      makeProvider("lifi-earn", async () => makeSnapshot("lifi-earn", 1)),
    ],
    policyFor: (id) => ({ ...defaultPolicy, timeoutMs: id === "etherscan" ? 10 : 200, allowStale: false }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
  });
  const out = await svc.run(testInput("0x6666666666666666666666666666666666666666"));
  const byId = Object.fromEntries(out.map((o) => [o.provider, o]));
  assert.equal(byId.etherscan?.status, "TIMEOUT");
  assert.equal(byId["lifi-earn"]?.status, "SUCCESS", "a hanging provider must not starve another");
});
