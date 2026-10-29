import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuotaWindow, quotaAuthorizesLive, validateQuotaPolicy } from "./quota.js";
import type { QuoteQuotaPolicy } from "./quota.js";
import { createRegistry } from "./registry.js";
import type { ProviderContract, ProviderQuote, QuoteRequest, QuoteTelemetryEvent } from "./index.js";
import { createOfflineQuoteControlPlane } from "./offline-testing.js";

const policy = (overrides: Partial<QuoteQuotaPolicy> = {}): QuoteQuotaPolicy => ({
  attestation: "SYNTHETIC", limit: 2, windowMs: 60_000, source: null, ...overrides,
});

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

const REQUEST: QuoteRequest = { fromChainId: 1, toChainId: 1, fromAsset: "A", toAsset: "B", amountInRaw: 1n, minAmountOutRaw: 0n, maxSlippageBps: 1, route: {}, preferences: {}, providerParams: {}, feePolicy: "ADDITIONAL" };
const CONTRACT: ProviderContract = { providerId: "prov", displayName: "Prov", activation: "ACTIVE", availability: "DOCUMENTED", quoteCapability: "KNOWN", signatureFree: true, validitySeconds: 60, chains: [{ chainId: 1, assets: ["A", "B"], routable: true, source: "DOCUMENTED" }], fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" }, steps: [] };
const QUOTE: ProviderQuote = { provider: "prov", routeId: "r", fromChainId: 1, toChainId: 1, fromToken: "A", toToken: "B", amountInRaw: 1n, amountOutRaw: 2n, costs: {}, costUnit: "OUTPUT_RAW", slippageBps: 0, estimatedDurationSec: 1, steps: 1, path: ["hop"], riskScore: 0.1 };

function planeHarness(opts: { quotaPolicy?: QuoteQuotaPolicy; quotaPerProvider?: number } = {}) {
  let t = 1_000;
  const calls: string[] = [];
  const events: QuoteTelemetryEvent[] = [];
  const plane = createOfflineQuoteControlPlane({
    registry: createRegistry([CONTRACT]),
    budget: { capacity: 100 },
    quotaPerProvider: opts.quotaPerProvider ?? 100,
    quotaPolicy: opts.quotaPolicy,
    cacheTtlMs: 1_000,
    breaker: { failureThreshold: 5, cooldownMs: 1_000 },
    telemetry: { record: (event) => { events.push(event); } },
    transport: { fetchQuote: async (providerId) => { calls.push(providerId); return QUOTE; } },
    clock: { now: () => t },
  });
  return { plane, calls, events, advance: (seconds: number) => { t += seconds; } };
}

test("A config malformée : limite/fenêtre/attestation invalides refusées", () => {
  const invalid: Partial<QuoteQuotaPolicy>[] = [
    { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: NaN }, { limit: Infinity },
    { windowMs: 0 }, { windowMs: -1 }, { windowMs: NaN },
    { attestation: "LIVE" as QuoteQuotaPolicy["attestation"] },
    { attestation: "AUTHENTIC" as QuoteQuotaPolicy["attestation"] },
  ];
  for (const value of invalid) {
    assert.throws(() => validateQuotaPolicy(policy(value)), /INVALID_QUOTA_POLICY/);
  }
  assert.equal(validateQuotaPolicy(policy()).attestation, "SYNTHETIC");
});

test("B aucune autorisation LIVE n'est implémentée, quelle que soit l'attestation", () => {
  for (const attestation of ["SYNTHETIC", "UNATTESTED"] as const) {
    const decision = quotaAuthorizesLive(policy({ attestation, source: "docs.li.fi" }));
    assert.equal(decision.authorized, false);
    assert.equal(decision.reason, "NO_LIVE_GRANT_IMPLEMENTED");
  }
});

test("C SYNTHETIC : fenêtre fixe locale par horloge injectée, jamais réseau", () => {
  const c = clock(1_000);
  const window = createQuotaWindow(policy({ limit: 2, windowMs: 60_000 }), { now: () => c.now() });
  assert.equal(window.admit("prov"), "ADMITTED");
  assert.equal(window.admit("prov"), "ADMITTED");
  assert.equal(window.admit("prov"), "REFUSED_QUOTA_EXCEEDED");
  assert.equal(window.used("prov"), 2);
  c.advance(60_000);
  assert.equal(window.admit("prov"), "ADMITTED");
  assert.equal(window.used("prov"), 1);
});

test("D fenêtres isolées par provider et par indépendance d'instance", () => {
  const c = clock();
  const a = createQuotaWindow(policy({ limit: 1 }), { now: () => c.now() });
  const b = createQuotaWindow(policy({ limit: 1 }), { now: () => c.now() });
  assert.equal(a.admit("x"), "ADMITTED");
  assert.equal(a.admit("x"), "REFUSED_QUOTA_EXCEEDED");
  assert.equal(a.admit("y"), "ADMITTED");
  assert.equal(b.admit("x"), "ADMITTED");
  assert.equal(a.used("y"), 1); assert.equal(b.used("y"), 0);
});

test("E UNATTESTED : fail-closed, n'autorise ni ne compte comme limite fournisseur", () => {
  const c = clock();
  const window = createQuotaWindow(policy({ attestation: "UNATTESTED", limit: 5 }), { now: () => c.now() });
  assert.equal(window.admit("prov"), "REFUSED_QUOTA_UNATTESTED");
  assert.equal(window.used("prov"), 0);
  assert.equal(window.admit("prov"), "REFUSED_QUOTA_UNATTESTED");
  c.advance(999_999);
  assert.equal(window.admit("prov"), "REFUSED_QUOTA_UNATTESTED");
});

test("F bornes exactes de fenêtre et réservation synchrone sans réseau", () => {
  const c = clock(10_000);
  const window = createQuotaWindow(policy({ limit: 1, windowMs: 5_000 }), { now: () => c.now() });
  assert.equal(window.admit("prov"), "ADMITTED");
  c.advance(4_999);
  assert.equal(window.admit("prov"), "REFUSED_QUOTA_EXCEEDED");
  c.advance(1);
  assert.equal(window.admit("prov"), "ADMITTED");
});

test("G intégration control plane : quotaPolicy SYNTHETIC fenêtré par horloge", async () => {
  const h = planeHarness({ quotaPolicy: policy({ limit: 1, windowMs: 60_000 }) });
  assert.equal((await h.plane.request("prov", REQUEST)).outcome, "SERVED");
  h.advance(50);
  assert.equal((await h.plane.request("prov", REQUEST)).outcome, "REFUSED_QUOTA_EXCEEDED");
  assert.equal(h.calls.length, 1);
  h.advance(10);
  assert.equal((await h.plane.request("prov", REQUEST)).outcome, "SERVED");
});

test("H intégration control plane : quotaPolicy UNATTESTED fail-closed, zéro transport", async () => {
  const h = planeHarness({ quotaPolicy: policy({ attestation: "UNATTESTED", limit: 5 }) });
  const r = await h.plane.request("prov", REQUEST);
  assert.equal(r.outcome, "REFUSED_QUOTA_UNATTESTED");
  assert.equal(r.served, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.plane.budgetUsed(), 0);
});

test("horloge quota invalide : motif explicite propagé sans budget ni transport", async () => {
  const h = planeHarness({ quotaPolicy: policy() });
  h.advance(NaN);
  const result = await h.plane.request("prov", REQUEST);
  assert.equal(result.outcome, "REFUSED_QUOTA_CLOCK_INVALID");
  assert.equal(result.served, false);
  assert.equal(h.plane.quotaUsed("prov"), 0);
  assert.equal(h.plane.budgetUsed(), 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.events.at(-1)?.outcome, "REFUSED_QUOTA_CLOCK_INVALID");
});

test("I sans quotaPolicy : comportement per-instance préservé (non-régression)", async () => {
  const h = planeHarness({ quotaPerProvider: 1 });
  assert.equal((await h.plane.request("prov", REQUEST)).outcome, "SERVED");
  h.advance(3_600_000);
  assert.equal((await h.plane.request("prov", REQUEST)).outcome, "REFUSED_QUOTA_EXCEEDED");
});
