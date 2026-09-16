import assert from "node:assert/strict";
import { test } from "node:test";

import type { WalletAssets } from "@wcore/core";

import { createPortfolioEnrichmentService, type EnrichmentCache } from "./service.js";
import { createPortfolioEnrichmentScanStep, type PortfolioEnrichmentScanStep } from "./scan-step.js";
import { createEnrichmentScanStepIfConfigured, runEnrichmentDiagnostics } from "./scan-enrichment.js";
import { createRpcContractVerifier } from "./rpc-verifier.js";
import type { PortfolioEnrichmentProvider, ProviderPortfolioSnapshot } from "./types.js";

const WCORE_TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const WALLET = "0x1111111111111111111111111111111111111111";

function walletAssets(chain: string, contracts: string[] = []): WalletAssets {
  return {
    chain, chainName: chain,
    native: { symbol: "ETH", balance: 1, priceEur: 1, valueEur: 1 },
    tokens: contracts.map((contract, i) => ({ symbol: `T${i}`, balance: 5, priceEur: 1, valueEur: 5, contract, name: `T${i}`, decimals: 18 })),
    errors: [], totalValueEur: 1, scanMs: 1,
  } as unknown as WalletAssets;
}
function snapshot(hints: string[] = [], positions: string[] = [], chain = "ETHEREUM"): ProviderPortfolioSnapshot {
  return {
    provider: "zerion",
    walletHints: hints.map((contract) => ({ chain, contract })),
    positions: positions.map((contract, i) => ({ provider: "zerion", chain, protocol: "aave-v3", type: "collateral" as const, contract, positionId: `p${i}`, balance: 999, priceEur: 1, valueEur: 999, liquidity: "liquid" as const, providerVerified: true as const })),
    derivedPositionValueEur: positions.length, observedAt: "2026-01-01T00:00:00.000Z", diagnostics: {},
  };
}
function provider(load: () => Promise<ProviderPortfolioSnapshot>): PortfolioEnrichmentProvider {
  return { id: "zerion", capabilities: { requestScope: "wallet", purposes: ["complex-positions", "wallet-hints", "diagnostics"], maxRequests: 1 }, supports: () => true, load };
}
function memoryCache(): EnrichmentCache {
  const m = new Map<string, { snapshot: ProviderPortfolioSnapshot; storedAt: number }>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } };
}
function stepWith(load: () => Promise<ProviderPortfolioSnapshot>, verify: (a: { chain: string; address: string; contract: string }) => Promise<{ contract: string; balance: number } | null>): PortfolioEnrichmentScanStep {
  const framework = createPortfolioEnrichmentService({
    providers: [provider(load)],
    policyFor: () => ({ enabled: true, timeoutMs: 50, maxPositions: 100, allowStale: true, staleTtlMs: 60_000, purposes: ["complex-positions", "wallet-hints", "diagnostics"] }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
    cache: memoryCache(),
  });
  return createPortfolioEnrichmentScanStep({ framework, verifyContract: verify, enabled: true });
}
test("defined step but enabled=false: no call even with chain assets", async () => {
  let called = 0;
  const step = stepWith(async () => { called += 1; return snapshot([NEW_TOKEN]); }, async () => null);
  const r = await runEnrichmentDiagnostics({ enabled: false, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map([["ETHEREUM", walletAssets("ETHEREUM")]]) });
  assert.equal(r, null);
  assert.equal(called, 0);
});

test("defined step but enabled=false: no call", async () => {
  let called = 0;
  const step = stepWith(async () => { called += 1; return snapshot(); }, async () => null);
  const r = await runEnrichmentDiagnostics({ enabled: false, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map() });
  assert.equal(r, null);
  assert.equal(called, 0);
});

test("provider timeout does not degrade anything and yields no candidate", async () => {
  const step = stepWith(() => new Promise(() => {}), async () => null);
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map([["ETHEREUM", walletAssets("ETHEREUM")]]) });
  assert.equal(r?.enrich_zerion, "TIMEOUT");
  assert.equal(r?.candidates, 0);
  assert.equal(r?.mutatedAssets, false);
});

test("provider throw is swallowed -> PROVIDER_ERROR, no candidate", async () => {
  const step = stepWith(async () => { throw Object.assign(new Error("boom"), { kind: "server" }); }, async () => null);
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map() });
  assert.equal(r?.enrich_zerion, "PROVIDER_ERROR");
  assert.equal(r?.candidates, 0);
});

test("collision: WCORE-owned contract wins, verifier not called for it", async () => {
  let verifyCalls = 0;
  const step = stepWith(async () => snapshot([WCORE_TOKEN]), async () => { verifyCalls += 1; return { contract: WCORE_TOKEN, balance: 9 }; });
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map([["ETHEREUM", walletAssets("ETHEREUM", [WCORE_TOKEN])]]) });
  assert.equal(r?.collisions, 1);
  assert.equal(r?.candidates, 0);
  assert.equal(verifyCalls, 0);
});

test("non-colliding + RPC-verified => candidate with RPC balance (provider value ignored)", async () => {
  const step = stepWith(async () => snapshot([], [NEW_TOKEN]), async () => ({ contract: NEW_TOKEN, balance: 3 }));
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map([["ETHEREUM", walletAssets("ETHEREUM")]]) });
  assert.equal(r?.candidates, 1);
  assert.equal(r?.enrichment, "ran");
  assert.equal(r?.mutatedAssets, false);
});

test("RPC balance = 0 => rejected", async () => {
  const step = stepWith(async () => snapshot([NEW_TOKEN]), async () => ({ contract: NEW_TOKEN, balance: 0 }));
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map() });
  assert.equal(r?.candidates, 0);
  assert.equal(r?.unverified, 1);
});

test("verifier error => rejected, never thrown", async () => {
  const step = stepWith(async () => snapshot([NEW_TOKEN]), async () => { throw new Error("rpc down"); });
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map() });
  assert.equal(r?.candidates, 0);
  assert.equal(r?.unverified, 1);
});

test("real verifier: unsupported chain => UNVERIFIED, no candidate", async () => {
  const verifier = createRpcContractVerifier({ endpointsFor: () => ["https://rpc.invalid.test"], multicallFn: async () => [{ success: true, returnData: "0x" + "1".padStart(64, "0") }] });
  const chainAssets = new Map<string, WalletAssets>();
  const r = await runEnrichmentDiagnostics({ enabled: true, step: stepWith(async () => snapshot([], ["0x0000000000000000000000000000000000000000"], "SOLANA"), verifier), address: WALLET, chains: ["SOLANA"], chainAssets });
  assert.equal(r?.candidates, 0);
});

test("source WCORE collection is never mutated", async () => {
  const assets = walletAssets("ETHEREUM", [WCORE_TOKEN]);
  const tokensRef = assets.tokens;
  const map = new Map([["ETHEREUM", assets]]);
  const step = stepWith(async () => snapshot([NEW_TOKEN]), async () => ({ contract: NEW_TOKEN, balance: 3 }));
  await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: map });
  assert.equal(map.get("ETHEREUM"), assets);
  assert.equal(assets.tokens, tokensRef);
  assert.equal(assets.tokens.length, 1);
});

test("builder: gated on config (disabled / blank key => undefined; enabled+key => step)", () => {
  const store = { get: async () => null, set: async () => {} } as unknown as Parameters<typeof createEnrichmentScanStepIfConfigured>[0]["store"];
  const base = { enabled: true, timeoutMs: 500, cacheTtlMs: 1, lastGoodTtlMs: 1, dailyBudget: 1, maxResponseBytes: 1, maxPositions: 1 };
  assert.equal(createEnrichmentScanStepIfConfigured({ zerion: { ...base, enabled: false, apiKey: "k" }, store }), undefined);
  assert.equal(createEnrichmentScanStepIfConfigured({ zerion: { ...base, apiKey: "   " }, store }), undefined);
  const step = createEnrichmentScanStepIfConfigured({ zerion: { ...base, apiKey: "test-key" }, store, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch });
  assert.ok(step && typeof step.run === "function");
});
test("builder with a valid config only ever registers zerion (secondary providers stay disabled)", async () => {
  const store = { get: async () => null, set: async () => {} } as unknown as Parameters<typeof createEnrichmentScanStepIfConfigured>[0]["store"];
  const emptyEnvelope = JSON.stringify({ links: { self: "x", next: null, prev: null }, meta: { total: 0 }, data: [] });
  const step = createEnrichmentScanStepIfConfigured({
    zerion: { enabled: true, apiKey: "test-key", timeoutMs: 200, cacheTtlMs: 1, lastGoodTtlMs: 1, dailyBudget: 5, maxResponseBytes: 100000, maxPositions: 100 },
    store,
    fetchImpl: (async () => new Response(emptyEnvelope)) as unknown as typeof fetch,
  });
  const r = await runEnrichmentDiagnostics({ enabled: true, step, address: WALLET, chains: ["ETHEREUM"], chainAssets: new Map() });
  assert.equal(r?.enrich_zerion, "EMPTY");
  assert.equal(r?.enrich_helius, undefined);
  assert.equal(r?.enrich_etherscan, undefined);
  assert.equal(r?.["enrich_lifi-earn"], undefined);
});
