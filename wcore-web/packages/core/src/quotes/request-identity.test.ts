import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, quoteCacheKey } from "./index.js";
import { createOfflineQuoteControlPlane as createQuoteControlPlane } from "./offline-testing.js";
import type { ProviderContract, ProviderQuote, QuoteRequest } from "./index.js";

const req: QuoteRequest = {
  fromChainId: 1, toChainId: 2, fromAsset: "IN", toAsset: "OUT",
  amountInRaw: 900719925474099300000n, maxSlippageBps: 50, minAmountOutRaw: 100n,
  route: {}, preferences: {}, feePolicy: "ADDITIONAL", providerParams: {},
};
const contract = (providerId = "a"): ProviderContract => ({
  providerId, displayName: providerId, quoteCapability: "KNOWN", activation: "ACTIVE",
  availability: "FIXTURE", chains: [1, 2].map(chainId => ({ chainId, assets: ["IN", "OUT"], routable: true, source: "FIXTURE" })),
  fees: { policy: "ADDITIONAL", amountOutBasis: "GROSS", costUnit: "OUTPUT_RAW" },
  validitySeconds: 60, steps: [], signatureFree: true,
});
const quote = (provider = "a", request = req): ProviderQuote => ({
  provider, routeId: "route", fromChainId: request.fromChainId, toChainId: request.toChainId,
  fromToken: request.fromAsset, toToken: request.toAsset, amountInRaw: request.amountInRaw,
  amountOutRaw: 200n, minAmountOutRaw: 150n, slippageBps: 10, steps: 1, path: ["hop"],
  estimatedDurationSec: 1, costs: {}, costUnit: "OUTPUT_RAW", feePolicy: "ADDITIONAL", riskScore: 0.1,
});
function harness(fetch: (id: string, request: QuoteRequest, signal?: AbortSignal) => Promise<unknown>, extra = {}) {
  let now = 1000;
  let calls = 0;
  const plane = createQuoteControlPlane({
    registry: createRegistry([contract(), contract("b")]), budget: { capacity: 100 }, quotaPerProvider: 100,
    cacheTtlMs: 1000, breaker: { failureThreshold: 1, cooldownMs: 1000 }, clock: { now: () => now },
    telemetry: { record: () => {} }, transport: { fetchQuote: (id, request, signal) => { calls++; return fetch(id, request, signal); } },
    ...extra,
  });
  return { plane, advance: (seconds: number) => { now += seconds; }, calls: () => calls };
}

test("A-C identité : montant exact bigint, slippage, minimum et route isolent le cache", async () => {
  const h = harness(async (id, request) => quote(id, request));
  const variants = [req, { ...req, amountInRaw: req.amountInRaw + 1n }, { ...req, maxSlippageBps: 51 },
    { ...req, minAmountOutRaw: 101n }, { ...req, route: { maxSteps: 2 } },
    { ...req, preferences: { speed: "fast" } }, { ...req, providerParams: { mode: "fast" } }];
  assert.equal(new Set(variants.map(r => quoteCacheKey("a", r))).size, variants.length);
  for (const variant of variants) assert.equal((await h.plane.request("a", variant)).outcome, "SERVED");
  assert.equal(h.calls(), variants.length);
  assert.notEqual(quoteCacheKey("a", req), quoteCacheKey("b", req));
});

test("D clé canonique non ambiguë, objets triés et arrays ordonnés", () => {
  const a = { ...req, providerParams: { z: ["a", "b"], a: { y: 1, x: true } } };
  const b = { ...req, providerParams: { a: { x: true, y: 1 }, z: ["a", "b"] } };
  assert.equal(quoteCacheKey("a", a), quoteCacheKey("a", b));
  assert.notEqual(quoteCacheKey("a|1", req), quoteCacheKey("a", { ...req, fromAsset: "1|IN" }));
  assert.notEqual(quoteCacheKey("a", a), quoteCacheKey("a", { ...a, providerParams: { z: ["b", "a"], a: { x: true, y: 1 } } }));
});

test("E invalides : zéro transport/budget/cache, champs inconnus et JSON non sûr refusés", async () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const invalid = [null, {}, { ...req, amountInRaw: 1 }, { ...req, amountInRaw: 0n }, { ...req, amountInRaw: -1n },
    { ...req, maxSlippageBps: NaN }, { ...req, maxSlippageBps: 10001 }, { ...req, minAmountOutRaw: -1n },
    { ...req, unknown: true }, { ...req, providerParams: cycle }, { ...req, providerParams: { x: undefined } },
    { ...req, providerParams: { x: 1n } }, { ...req, preferences: { x: () => 1 } },
    { ...req, preferences: new Date() }, { ...req, providerParams: { x: Infinity } },
    { ...req, route: { maxSteps: 0 } }, { ...req, fromChainId: 1.5 }, { ...req, feePolicy: "UNDOCUMENTED" }];
  const h = harness(async () => quote());
  for (const value of invalid) {
    const r = await h.plane.request("a", value as QuoteRequest);
    assert.equal(r.outcome, "REFUSED_INVALID_REQUEST");
    assert.throws(() => quoteCacheKey("a", value as QuoteRequest));
  }
  assert.equal(h.calls(), 0); assert.equal(h.plane.budgetUsed(), 0); assert.equal(h.plane.cacheEntries(), 0);
});

test("F-H réponse liée au provider, chaînes, tokens, montant et contraintes", async () => {
  const mismatches: Partial<ProviderQuote>[] = [
    { provider: "b" }, { fromChainId: 2 }, { toChainId: 1 }, { fromToken: "OTHER" }, { toToken: "OTHER" },
    { outputToken: "OTHER" }, { amountInRaw: req.amountInRaw + 1n }, { slippageBps: 51 },
    { amountOutRaw: 99n }, { minAmountOutRaw: 99n }, { feePolicy: "INCLUDED" },
    { routeId: "other" }, { steps: 2 }, { path: ["other"] },
  ];
  const constrained = { ...req, route: { routeId: "route", maxSteps: 1, path: ["hop"] } };
  for (const mismatch of mismatches) {
    const h = harness(async () => ({ ...quote(), ...mismatch }));
    assert.equal((await h.plane.request("a", constrained)).served, false, JSON.stringify(mismatch, (_, v) => typeof v === "bigint" ? v.toString() : v));
    assert.equal(h.plane.cacheEntries(), 0);
  }
});

test("réponse malformée : coûts, minimum, durée et hops non typés refusés", async () => {
  for (const invalid of [{ costs: { gasRaw: "1" } }, { minAmountOutRaw: "150" }, { path: [null] },
    { estimatedDurationSec: NaN }, { expectedOutRaw: 200 }, { minAmountOutRaw: -1n }]) {
    const h = harness(async () => ({ ...quote(), ...invalid }));
    assert.equal((await h.plane.request("a", req)).served, false);
    assert.equal(h.plane.cacheEntries(), 0);
  }
});

test("I cache hit : télémétrie fail-closed", async () => {
  let fail = false;
  const h = harness(async () => quote(), { telemetry: { record: () => { if (fail) throw Error("down"); } } });
  assert.equal((await h.plane.request("a", req)).served, true);
  fail = true;
  const result = await h.plane.request("a", req);
  assert.equal(result.outcome, "REFUSED_TELEMETRY_FAILURE"); assert.equal(result.quote, null); assert.equal(h.calls(), 1);
});

test("J TTL exact et post-await; expiration exacte refusée", async () => {
  const h = harness(async () => { h.advance(2); return quote(); });
  await h.plane.request("a", req);
  h.advance(0.999);
  assert.equal((await h.plane.request("a", req)).outcome, "CACHE_HIT");
  h.advance(0.001);
  assert.equal((await h.plane.request("a", req)).outcome, "SERVED");
  const expired = harness(async () => ({ ...quote(), expiresAt: 1000 }));
  assert.equal((await expired.plane.request("a", req)).outcome, "REFUSED_EXPIRED_QUOTE");
});

test("K HALF_OPEN N=3 : un seul probe avant await, provider B indépendant", async () => {
  let fail = true;
  let release!: (value: unknown) => void;
  const h = harness(async (id) => {
    if (id === "b") return quote("b");
    if (fail) throw Error("fixture");
    return new Promise(resolve => { release = resolve; });
  });
  await h.plane.request("a", req); h.advance(1); fail = false;
  const first = h.plane.request("a", req);
  const others = [h.plane.request("a", req), h.plane.request("a", req)];
  assert.equal(h.calls(), 2, "un seul probe A doit démarrer avant await");
  assert.equal((await h.plane.request("b", req)).served, true);
  release(quote()); assert.equal((await first).served, true);
  assert.ok((await Promise.all(others)).every(r => r.outcome === "REFUSED_BREAKER_OPEN"));
  assert.equal(h.calls(), 3); assert.equal(h.plane.breakerState("a"), "CLOSED");
});

test("L HALF_OPEN : refus avant transport libère le lease", async () => {
  const budget = { capacity: 1 };
  let fail = true;
  const h = harness(async () => { if (fail) throw Error("fixture"); return quote(); }, { budget });
  await h.plane.request("a", req); h.advance(1);
  assert.equal((await h.plane.request("a", req)).outcome, "REFUSED_BUDGET_EXHAUSTED");
  budget.capacity = 10; fail = false;
  assert.equal((await h.plane.request("a", req)).outcome, "SERVED");
});

test("M timeout injecté : abort, aucun cache tardif et recovery HALF_OPEN", async () => {
  let fire!: () => void;
  let cleared = 0;
  let late!: (value: unknown) => void;
  let observedSignal: AbortSignal | undefined;
  let hanging = true;
  const h = harness(async (_id, _req, signal) => {
    observedSignal = signal;
    if (!hanging) return quote();
    return new Promise(resolve => { late = resolve; });
  }, {
    transportTimeoutMs: 50,
    timer: { setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 50); fire = callback; return 1; }, clearTimeout: () => { cleared++; } },
  });
  const pending = h.plane.request("a", req);
  fire();
  assert.equal((await pending).outcome, "REFUSED_TRANSPORT_TIMEOUT");
  assert.equal(observedSignal?.aborted, true);
  late(quote()); await Promise.resolve();
  assert.equal(h.plane.cacheEntries(), 0);
  hanging = false; h.advance(1);
  assert.equal((await h.plane.request("a", req)).outcome, "SERVED");
  assert.equal(h.plane.breakerState("a"), "CLOSED"); assert.equal(cleared, 2);
});

test("N timeout post-await via horloge même si le timer n'a pas tiré", async () => {
  const h = harness(async () => { h.advance(1); return quote(); }, { transportTimeoutMs: 100 });
  assert.equal((await h.plane.request("a", req)).outcome, "REFUSED_TRANSPORT_TIMEOUT");
  assert.equal(h.plane.cacheEntries(), 0);
});

test("O exception et malformed HALF_OPEN récupèrent sans lease bloqué", async () => {
  let mode = 0;
  const h = harness(async () => { if (mode === 0) throw Error("fixture"); if (mode === 1) return {}; return quote(); });
  await h.plane.request("a", req); h.advance(1); mode = 1;
  assert.equal((await h.plane.request("a", req)).served, false);
  h.advance(1); mode = 2;
  assert.equal((await h.plane.request("a", req)).served, true);
});

test("P snapshot : mutations appelant et réponse ne polluent pas le cache; portfolio absent", async () => {
  let release!: (value: unknown) => void;
  const h = harness(async () => new Promise(resolve => { release = resolve; }));
  const input = { ...req, preferences: { speed: "fast" } };
  const pending = h.plane.request("a", input); input.amountInRaw++;
  const raw = quote(); release(raw);
  const result = await pending; assert.equal(result.served, true);
  raw.amountOutRaw = 1n; result.quote!.amountOutRaw = 2n;
  const hit = await h.plane.request("a", { ...req, preferences: { speed: "fast" } });
  assert.equal(hit.quote?.amountOutRaw, 200n);
  assert.equal("portfolio" in h.plane, false);
});
