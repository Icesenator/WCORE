// Run: node --import tsx --test packages/core/src/quotes/control-plane.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, quoteCacheKey } from "./index.js";
import { createOfflineQuoteControlPlane as createQuoteControlPlane } from "./offline-testing.js";
import type {
  ProviderContract,
  ProviderQuote,
  QuoteAdmission,
  QuoteRequest,
  QuoteTelemetryEvent,
} from "./index.js";

const REQ: QuoteRequest = { fromChainId: 1, toChainId: 8453, fromAsset: "USDC", toAsset: "WETH", amountInRaw: 1000n, maxSlippageBps: 100, minAmountOutRaw: 0n, route: {}, preferences: {}, feePolicy: "ADDITIONAL", providerParams: {} };

function contract(overrides: Partial<ProviderContract> = {}): ProviderContract {
  return {
    providerId: "prov-a",
    displayName: "Provider A",
    quoteCapability: "KNOWN",
    availability: "FIXTURE",
    activation: "ACTIVE",
    chains: [
      { chainId: 1, assets: ["USDC", "WETH"], routable: true, source: "FIXTURE" },
      { chainId: 8453, assets: ["USDC", "WETH"], routable: true, source: "FIXTURE" },
    ],
    fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" },
    validitySeconds: 60,
    steps: [{ kind: "swap", chainId: 1, from: "USDC", to: "WETH" }],
    signatureFree: true,
    ...overrides,
  };
}

function quote(overrides: Partial<ProviderQuote> = {}): ProviderQuote {
  return {
    provider: "prov-a",
    routeId: "r1",
    fromChainId: 1,
    toChainId: 8453,
    fromToken: "USDC",
    toToken: "WETH",
    amountInRaw: 1_000n,
    amountOutRaw: 1_000n,
    costs: {},
    costUnit: "OUTPUT_RAW",
    slippageBps: 10,
    estimatedDurationSec: 20,
    steps: 1,
    path: ["hop"],
    riskScore: 0.1,
    ...overrides,
  };
}

function harness(opts: {
  contracts?: ProviderContract[];
  budget?: { capacity: number } | undefined;
  quotaPerProvider?: number;
  transport?: ((providerId: string, request: QuoteRequest) => Promise<unknown>) | null;
  telemetry?: (event: QuoteTelemetryEvent) => void;
} = {}) {
  let t = 1000;
  const clock = { now: () => t };
  const calls: string[] = [];
  const events: QuoteTelemetryEvent[] = [];
  const transport = opts.transport === undefined
    ? { fetchQuote: async (providerId: string, req: QuoteRequest) => { calls.push(providerId); return quote({ provider: providerId, fromToken: req.fromAsset, toToken: req.toAsset }); } }
    : (opts.transport === null ? null : { fetchQuote: async (providerId: string, req: QuoteRequest) => { calls.push(providerId); return opts.transport!(providerId, req); } });
  const telemetry = {
    record: (event: QuoteTelemetryEvent) => {
      events.push(event);
      if (opts.telemetry) opts.telemetry(event);
    },
  };
  const plane = createQuoteControlPlane({
    registry: createRegistry(opts.contracts ?? [contract()]),
    budget: "budget" in opts ? opts.budget : { capacity: 100 },
    quotaPerProvider: opts.quotaPerProvider ?? 100,
    cacheTtlMs: 30_000,
    breaker: { failureThreshold: 2, cooldownMs: 5_000 },
    telemetry,
    transport,
    clock,
  });
  return { plane, calls, events, advance: (ms: number) => { t += ms; }, now: () => t };
}

test("A. registre vide : zero transport", async () => {
  const h = harness({ contracts: [] });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_PROVIDER");
  assert.equal(h.calls.length, 0);
});

test("B. provider inactif : zero transport", async () => {
  const h = harness({ contracts: [contract({ activation: "INACTIVE_UNVERIFIED" })] });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_PROVIDER");
  assert.equal(h.calls.length, 0);
});

test("C. capacites UNKNOWN : refus", async () => {
  const h = harness({ contracts: [contract({ quoteCapability: "UNKNOWN" })] });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_PROVIDER");
  assert.equal(r.blocker, "PROVIDER_CAPABILITIES_UNKNOWN");
  assert.equal(h.calls.length, 0);
});

test("D. budget indisponible : refus", async () => {
  const h = harness({ budget: undefined });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_BUDGET_UNAVAILABLE");
  assert.equal(h.calls.length, 0);
});

test("E. quota atteint : zero transport", async () => {
  const h = harness({ quotaPerProvider: 1 });
  await h.plane.request("prov-a", REQ);
  h.advance(60_000); // au-delà du cache TTL
  const second = await h.plane.request("prov-a", REQ);
  assert.equal(second.outcome, "REFUSED_QUOTA_EXCEEDED");
  assert.equal(h.calls.length, 1);
});

test("F. deux demandes concurrentes ne depassent pas le meme quota", async () => {
  const h = harness({ quotaPerProvider: 1 });
  const [a, b] = await Promise.all([h.plane.request("prov-a", REQ), h.plane.request("prov-a", REQ)]);
  const served = [a, b].filter((r) => r.outcome === "SERVED").length;
  const refused = [a, b].filter((r) => r.outcome === "REFUSED_QUOTA_EXCEEDED").length;
  assert.equal(served, 1);
  assert.equal(refused, 1);
  assert.equal(h.calls.length, 1);
});

test("G. erreur provider A n invalide pas B", async () => {
  const h = harness({
    contracts: [contract({ providerId: "prov-a" }), contract({ providerId: "prov-b" })],
    transport: async (providerId) => {
      if (providerId === "prov-a") throw new Error("boom");
      return quote({ provider: providerId });
    },
  });
  const a = await h.plane.request("prov-a", REQ);
  const b = await h.plane.request("prov-b", REQ);
  assert.equal(a.outcome, "REFUSED_TRANSPORT_ERROR");
  assert.equal(b.outcome, "SERVED");
});

test("H. breaker A ouvert n affecte pas B, puis recovery", async () => {
  let failA = true;
  const h = harness({
    contracts: [contract({ providerId: "prov-a" }), contract({ providerId: "prov-b" })],
    transport: async (providerId) => {
      if (providerId === "prov-a" && failA) throw new Error("boom");
      return quote({ provider: providerId });
    },
  });
  await h.plane.request("prov-a", REQ);
  await h.plane.request("prov-a", REQ); // threshold atteint -> OPEN
  assert.equal(h.plane.breakerState("prov-a"), "OPEN");
  const blocked = await h.plane.request("prov-a", REQ);
  assert.equal(blocked.outcome, "REFUSED_BREAKER_OPEN");
  const b = await h.plane.request("prov-b", REQ);
  assert.equal(b.outcome, "SERVED");
  failA = false;
  h.advance(6_000); // cooldown écoulé -> HALF_OPEN puis CLOSED au succès
  const recovered = await h.plane.request("prov-a", REQ);
  assert.equal(recovered.outcome, "SERVED");
  assert.equal(h.plane.breakerState("prov-a"), "CLOSED");
});

test("I. reponse expiree non servie comme quote actuelle", async () => {
  const h = harness({ transport: async () => quote({ expiresAt: 500 }) });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_EXPIRED_QUOTE");
  assert.equal(r.served, false);
  assert.equal(h.plane.cacheEntries(), 0);
});

test("J. cache isole par provider, chaines, actifs", async () => {
  const h = harness({ contracts: [contract({ providerId: "prov-a" }), contract({ providerId: "prov-b" })] });
  await h.plane.request("prov-a", REQ);
  await h.plane.request("prov-b", REQ);
  await h.plane.request("prov-a", { ...REQ, fromAsset: "WETH", toAsset: "USDC" });
  assert.equal(h.plane.cacheEntries(), 3);
  assert.equal(h.calls.length, 3);
  assert.notEqual(quoteCacheKey("prov-a", REQ), quoteCacheKey("prov-b", REQ));
});

test("K. quote malformee : rejet sans pollution du cache", async () => {
  const h = harness({ transport: async () => ({ provider: "prov-a" }) });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_MALFORMED_QUOTE");
  assert.equal(h.plane.cacheEntries(), 0);
});

test("L. echec de telemetrie : aucun faux succes d admission", async () => {
  const h = harness({ telemetry: () => { throw new Error("telemetry down"); } });
  const r = await h.plane.request("prov-a", REQ);
  assert.equal(r.outcome, "REFUSED_TELEMETRY_FAILURE");
  assert.equal(r.served, false);
  assert.equal(h.plane.cacheEntries(), 0);
});

test("M. aucune ressource du scan portfolio n est partagee", async () => {
  const first = harness();
  const second = harness();
  await first.plane.request("prov-a", REQ);
  assert.equal(first.plane.budgetUsed(), 1);
  assert.equal(second.plane.budgetUsed(), 0);
  assert.equal(first.plane.quotaUsed("prov-a"), 1);
  assert.equal(second.plane.quotaUsed("prov-a"), 0);
  assert.equal(typeof (first.plane as unknown as Record<string, unknown>).portfolio, "undefined");
});

test("N. signature et transaction impossibles", async () => {
  const h = harness();
  const r = await h.plane.request("prov-a", REQ);
  assert.equal("transaction" in (r as unknown as Record<string, unknown>), false);
  assert.equal("signedTransaction" in (r as unknown as Record<string, unknown>), false);
  const unsafe = harness({ contracts: [contract({ signatureFree: false })] });
  const denied = await unsafe.plane.request("prov-a", REQ);
  assert.equal(denied.outcome, "REFUSED_PROVIDER");
  assert.equal(denied.blocker, "PROVIDER_EXECUTION_FORBIDDEN");
});

test("O. appel repete sans changement : idempotent, un seul transport", async () => {
  const h = harness();
  const first = await h.plane.request("prov-a", REQ);
  const second: QuoteAdmission = await h.plane.request("prov-a", REQ);
  assert.equal(first.outcome, "SERVED");
  assert.equal(second.outcome, "CACHE_HIT");
  assert.equal(second.fromCache, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.plane.budgetUsed(), 1);
});

test("cooldown millisecondes respecte une horloge en secondes", async () => {
  let now = 1000;
  let fails = true;
  const plane = createQuoteControlPlane({
    registry: createRegistry([contract()]), budget: { capacity: 10 },
    quotaPerProvider: 10, cacheTtlMs: 30000,
    breaker: { failureThreshold: 1, cooldownMs: 5000 },
    telemetry: { record: () => {} }, clock: { now: () => now },
    transport: { fetchQuote: async () => { if (fails) throw new Error("fixture"); return quote(); } },
  });
  await plane.request("prov-a", REQ);
  now = 1004.999;
  assert.equal((await plane.request("prov-a", REQ)).outcome, "REFUSED_BREAKER_OPEN");
  fails = false;
  now = 1005;
  assert.equal((await plane.request("prov-a", REQ)).outcome, "SERVED");
});

test("une réponse expirée pendant le transport est refusée", async () => {
  let now = 1000;
  const plane = createQuoteControlPlane({
    registry: createRegistry([contract()]),
    budget: { capacity: 10 }, quotaPerProvider: 10, cacheTtlMs: 30000,
    breaker: { failureThreshold: 2, cooldownMs: 5000 },
    telemetry: { record: () => {} }, clock: { now: () => now },
    transportTimeoutMs: 120_000, // expiration testée indépendamment du timeout local
    transport: { fetchQuote: async () => { now = 1061; return quote({ expiresAt: 1060 }); } },
  });
  const result = await plane.request("prov-a", REQ);
  assert.equal(result.outcome, "REFUSED_EXPIRED_QUOTE");
  assert.equal(result.served, false);
  assert.equal(plane.cacheEntries(), 0);
});

test("budget global epuise : refus apres consommation", async () => {
  const h = harness({ budget: { capacity: 1 } });
  await h.plane.request("prov-a", REQ);
  h.advance(60_000);
  const r = await h.plane.request("prov-a", { ...REQ, fromAsset: "WETH", toAsset: "USDC" });
  assert.equal(r.outcome, "REFUSED_BUDGET_EXHAUSTED");
});
