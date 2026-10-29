import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuoteControlPlane, createRegistry, DEFAULT_PROVIDER_CONTRACTS, CANDIDATE_PROVIDERS } from "./index.js";
import type { ProviderContract, ProviderQuote, QuoteRequest, QuoteTransport } from "./index.js";
import * as publicApi from "./index.js";
import { createOfflineBoundControlPlane } from "./control-plane.js";
import { createOfflineQuoteControlPlane, createCannedOfflineQuoteControlPlane, resolveOfflineTransport } from "./offline-testing.js";
import { LIFI_CONTRACT_REFERENCE } from "./adapters/lifi.js";

const request: QuoteRequest = { fromChainId: 1, toChainId: 1, fromAsset: "A", toAsset: "B", amountInRaw: 1n, minAmountOutRaw: 0n, maxSlippageBps: 1, route: {}, preferences: {}, providerParams: {}, feePolicy: "ADDITIONAL" };
const provider: ProviderContract = { providerId: "test", displayName: "Test", activation: "ACTIVE", availability: "DOCUMENTED", quoteCapability: "KNOWN", signatureFree: true, validitySeconds: 60, chains: [{ chainId: 1, assets: ["A", "B"], routable: true, source: "DOCUMENTED" }], fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" }, steps: [] };
const config = () => ({ registry: createRegistry([provider]), budget: { capacity: 10 }, quotaPerProvider: 10, cacheTtlMs: 1000, breaker: { failureThreshold: 1, cooldownMs: 1000 }, telemetry: { record: () => {} }, clock: { now: () => 1000 } });
const canned: ProviderQuote = { provider: "test", routeId: "r", fromChainId: 1, toChainId: 1, fromToken: "A", toToken: "B", amountInRaw: 1n, amountOutRaw: 2n, costs: {}, costUnit: "OUTPUT_RAW", slippageBps: 0, estimatedDurationSec: 1, steps: 1, path: ["hop"], riskScore: 0.1 };

test("NETWORK_CAPABLE injecté sans autorité : zéro invocation avant toute réservation", async () => {
  let calls = 0;
  const plane = createQuoteControlPlane({ ...config(), transport: { mode: "NETWORK_CAPABLE", fetchQuote: async () => { calls++; return {}; } } } as Parameters<typeof createQuoteControlPlane>[0]);
  const result = await plane.request("test", request);
  assert.equal(calls, 0);
  assert.equal(result.outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
  assert.equal(plane.budgetUsed(), 0);
  assert.equal(plane.quotaUsed("test"), 0);
});

for (const [name, registry] of [
  ["A registre vide", createRegistry([])],
  ["B inactif", createRegistry([{ ...provider, activation: "INACTIVE_UNVERIFIED" }])],
  ["C UNKNOWN", createRegistry([{ ...provider, quoteCapability: "UNKNOWN" }])],
] as const) test(`${name} : zéro callback même dans le harness`, async () => {
  let calls = 0;
  const plane = createOfflineQuoteControlPlane({ ...config(), registry, transport: { fetchQuote: async () => { calls++; return canned; } } });
  assert.equal((await plane.request("test", request)).outcome, "REFUSED_PROVIDER");
  assert.equal(calls, 0);
});

for (const mode of [undefined, "SYNTHETIC_OFFLINE", "NETWORK_CAPABLE"] as const) {
  test(`D-F public mode ${mode} : déclaration et DOCUMENTED ne donnent aucune autorité`, async () => {
    let calls = 0;
    const plane = createQuoteControlPlane({ ...config(), transport: { mode, fetchQuote: async () => { calls++; return canned; } } });
    assert.equal((await plane.request("test", request)).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
    assert.equal(calls, 0);
    assert.equal(plane.budgetUsed(), 0);
  });
}

test("G grants malformés, marqueurs, booléens et copies sont sans autorité", async () => {
  let calls = 0;
  const callback = async () => { calls++; return canned; };
  for (const grant of [true, false, "LIVE", {}, Object.create(null), { authorized: true }, { mode: "SYNTHETIC_OFFLINE", fetchQuote: callback }, { grant: "LIVE", context: "offline" }]) {
    const plane = createQuoteControlPlane({ ...config(), transport: grant as QuoteTransport });
    assert.equal((await plane.request("test", request)).served, false);
    assert.equal(resolveOfflineTransport({}, grant), undefined);
  }
  assert.equal(calls, 0);
});

test("H contexte offline valide : réponses canned et cache", async () => {
  const plane = createCannedOfflineQuoteControlPlane(config(), [canned]);
  assert.equal((await plane.request("test", request)).outcome, "SERVED");
  assert.equal((await plane.request("test", request)).outcome, "CACHE_HIT");
  assert.equal(plane.budgetUsed(), 1);
});

test("I NETWORK_CAPABLE reste refusé dans le harness de confiance", async () => {
  let calls = 0;
  const plane = createOfflineQuoteControlPlane({ ...config(), transport: { mode: "NETWORK_CAPABLE", fetchQuote: async () => { calls++; return canned; } } });
  assert.equal((await plane.request("test", request)).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
  assert.equal(calls, 0);
});

test("J faux contexte et copie d'objet ne correspondent pas à une identité WeakMap", async () => {
  let calls = 0;
  const forged = Object.freeze({ mode: "SYNTHETIC_OFFLINE", fetchQuote: async () => { calls++; return canned; } });
  const context = Object.freeze({ offline: true });
  for (const transport of [forged, { ...forged }, structuredClone({ mode: "SYNTHETIC_OFFLINE" })]) {
    const plane = createOfflineBoundControlPlane({ ...config(), transport: transport as QuoteTransport }, context);
    assert.equal((await plane.request("test", request)).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
  }
  assert.equal(calls, 0);
});

test("K barrel public : aucune factory, résolution ou contexte offline exporté", () => {
  for (const name of ["createOfflineQuoteControlPlane", "createCannedOfflineQuoteControlPlane", "resolveOfflineTransport", "createOfflineBoundControlPlane"]) assert.equal(name in publicApi, false);
});

test("L transport sans callback reconnu et grant additionnel ne sont jamais exécutés", async () => {
  let getterCalls = 0;
  const transport = { get fetchQuote() { getterCalls++; throw Error("ne pas lire"); } };
  const plane = createQuoteControlPlane({ ...config(), transport } as Parameters<typeof createQuoteControlPlane>[0]);
  assert.equal((await plane.request("test", request)).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
  assert.equal(getterCalls, 0);
});

test("M public n'accepte pas le second argument contexte, même si ajouté en JavaScript", async () => {
  let calls = 0;
  const factory = createQuoteControlPlane as (...args: unknown[]) => ReturnType<typeof createQuoteControlPlane>;
  const plane = factory({ ...config(), transport: { fetchQuote: async () => { calls++; return canned; } } }, { offline: true });
  assert.equal((await plane.request("test", request)).served, false);
  assert.equal(calls, 0);
});

test("N modes inconnus refusés également par le harness", async () => {
  let calls = 0;
  const plane = createOfflineQuoteControlPlane({ ...config(), transport: { mode: "LIVE", fetchQuote: async () => { calls++; return canned; } } as unknown as QuoteTransport });
  assert.equal((await plane.request("test", request)).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED");
  assert.equal(calls, 0);
});

test("O-Q aucun fetch/HTTP réel : spies non appelés sur les chemins publics et canned", async (t) => {
  let calls = 0;
  const denied = () => { calls++; throw Error("NETWORK_FORBIDDEN_TEST"); };
  t.mock.method(globalThis, "fetch", denied);
  const http = await import("node:http");
  const https = await import("node:https");
  t.mock.method(http.default, "request", denied);
  t.mock.method(http.default, "get", denied);
  t.mock.method(https.default, "request", denied);
  t.mock.method(https.default, "get", denied);
  const plane = createQuoteControlPlane({ ...config(), transport: { mode: "NETWORK_CAPABLE", fetchQuote: async () => { await fetch("https://invalid.invalid"); return {}; } } });
  assert.equal((await plane.request("test", request)).served, false);
  assert.equal((await createCannedOfflineQuoteControlPlane(config(), [canned]).request("test", request)).served, true);
  assert.equal(calls, 0);
});

test("P registre par défaut vide : aucun provider activé, candidats inertes", () => {
  assert.deepEqual(DEFAULT_PROVIDER_CONTRACTS, []);
  assert.equal(createRegistry(DEFAULT_PROVIDER_CONTRACTS).contracts.size, 0);
  assert.ok(CANDIDATE_PROVIDERS.length > 0);
  assert.equal(CANDIDATE_PROVIDERS.every(id => !createRegistry(DEFAULT_PROVIDER_CONTRACTS).contracts.has(id)), true);
});

test("Q LI.FI reste inactif et non enregistrable comme provider actif", () => {
  assert.equal(LIFI_CONTRACT_REFERENCE.activation, "INACTIVE_UNVERIFIED");
  assert.equal(createRegistry([LIFI_CONTRACT_REFERENCE]).contracts.has(LIFI_CONTRACT_REFERENCE.providerId), false);
});
