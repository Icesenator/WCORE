/** WC12_OFFLINE_MULTI_PROVIDER_PIPELINE : intégration locale, jamais preuve LIVE.
 * Aucun nouvel orchestrateur : canned harness -> admission -> compareQuotes,
 * puis attestation économique synthétique distincte -> compareOfflineFees.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "./registry.js";
import type { ProviderContract, QuoteRequest } from "./registry.js";
import { createCannedOfflineQuoteControlPlane, createOfflineQuoteControlPlane } from "./offline-testing.js";
import type { QuoteAdmission, QuoteControlPlaneConfig } from "./control-plane.js";
import { quoteCacheKey } from "./control-plane.js";
import { compareQuotes } from "./compare.js";
import { normalizeQuote } from "./normalize.js";
import { compareOfflineFees } from "./offline-fee-comparison.js";
import type { OfflineFeeFixture } from "./offline-fee-comparison.js";
import type { FeeAssetIdentity, FeeRate } from "./fee-conversion.js";
import { LIFI_CONTRACT_REFERENCE, mapLifiStep } from "./adapters/lifi.js";
import type { LifiStep } from "./adapters/lifi.js";
import type { ProviderQuote } from "./types.js";

const NOW = 100;
const BIG = 900719925474099312345n;
const source = { chainId: 1, token: "SRC", decimals: 6, role: "SOURCE" } as const;
const native = { chainId: 1, token: "ETH", decimals: 18, role: "NATIVE" } as const;
const output = { chainId: 2, token: "OUT", decimals: 8, role: "OUTPUT" } as const;
const request = (): QuoteRequest => ({ fromChainId: 1, toChainId: 2, fromAsset: "SRC", toAsset: "OUT", amountInRaw: BIG, minAmountOutRaw: BIG - 100n, maxSlippageBps: 50, feePolicy: "ADDITIONAL", route: { maxSteps: 3 }, preferences: { speed: false }, providerParams: { fixture: true } });
function contract(providerId: string, patch: Partial<ProviderContract> = {}): ProviderContract {
  return { providerId, displayName: providerId, availability: "FIXTURE", activation: "ACTIVE", quoteCapability: "KNOWN", signatureFree: true, validitySeconds: 60,
    chains: [{ chainId: 1, assets: ["SRC"], routable: true, source: "FIXTURE" }, { chainId: 2, assets: ["OUT"], routable: true, source: "FIXTURE" }],
    fees: { policy: "ADDITIONAL", amountOutBasis: "GROSS", costUnit: "OUTPUT_RAW" }, steps: [{ kind: "bridge", chainId: 1, from: "SRC", to: "OUT" }], ...patch };
}
function quote(provider = "synthetic-a", patch: Partial<ProviderQuote> = {}): ProviderQuote {
  return { provider, routeId: `${provider}-route`, fromChainId: 1, toChainId: 2, fromToken: "SRC", toToken: "OUT", amountInRaw: BIG, amountOutRaw: BIG,
    minAmountOutRaw: BIG - 50n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costUnit: "OUTPUT_RAW", costs: { gasRaw: 3n, bridgeFeeRaw: 2n, protocolFeeRaw: 0n },
    slippageBps: 20, estimatedDurationSec: 10, steps: 2, path: ["pool-source", "bridge", "pool-destination"], pathCompleteness: "COMPLETE", riskScore: "UNKNOWN", expiresAt: 150, ...patch };
}
function config(patch: Partial<QuoteControlPlaneConfig> = {}): QuoteControlPlaneConfig {
  return { registry: createRegistry([contract("synthetic-a"), contract("synthetic-b")]), budget: { capacity: 20 }, quotaPerProvider: 10, cacheTtlMs: 10000,
    breaker: { failureThreshold: 1, cooldownMs: 5000 }, telemetry: { record() {} }, clock: { now: () => NOW }, ...patch };
}
async function admit(raw: unknown, req = request(), cfg = config(), id = "synthetic-a") {
  const plane = createCannedOfflineQuoteControlPlane(cfg, [raw]);
  return { plane, admission: await plane.request(id, req) };
}
function served(a: QuoteAdmission): ProviderQuote {
  assert.equal(a.outcome, "SERVED"); assert.equal(a.served, true); assert.ok(a.quote);
  return a.quote;
}
const rate = (asset: FeeAssetIdentity): FeeRate => ({ source: asset, output, numerator: 3n, denominator: 2n, observedAt: 90, expiresAt: 110, provenance: "SYNTHETIC_FIXTURE" });
/** Lien explicite : identité/montants/path/min proviennent de l'admission.
 * Le seul changement est la convention des coûts d'une NOUVELLE attestation
 * économique offline. Cette projection n'est jamais réadmise ni dite net garanti.
 */
function economic(admitted: ProviderQuote, asset: FeeAssetIdentity = output): OfflineFeeFixture {
  const q = structuredClone(admitted);
  q.costUnit = asset.role === "SOURCE" ? "INPUT_RAW" : asset.role === "NATIVE" ? "UNKNOWN" : "OUTPUT_RAW";
  return { quote: q, contract: { provenance: "SYNTHETIC_FIXTURE", completeness: "COMPLETE", source, output, amountInRaw: q.amountInRaw, amountOutRaw: q.amountOutRaw,
    amountOutBasis: q.amountOutBasis!, feePolicy: q.feePolicy!, costUnit: q.costUnit, feeFields: ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"] },
    conversion: { source, native, output, now: NOW, includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT", rates: asset === output ? [] : [rate(asset)],
      fees: [q.costs.gasRaw!, q.costs.bridgeFeeRaw!, q.costs.protocolFeeRaw!].map(amountRaw => ({ asset, amountRaw, included: q.feePolicy === "INCLUDED", provenance: "SYNTHETIC_FIXTURE" })) } };
}
const runEconomic = (f: OfflineFeeFixture) => compareOfflineFees([f], { now: NOW });

test("deux providers canned : admission économique bigint, normalisation, comparaison, cache, aucune mutation", async () => {
  const a = quote(); const b = quote("synthetic-b", { amountOutRaw: BIG + 1n, path: ["pool-other", "bridge", "pool-destination"], riskScore: 0 });
  const req = request(); const before = structuredClone({ a, b, req });
  const plane = createCannedOfflineQuoteControlPlane(config(), [a, b]);
  const qa = served(await plane.request(a.provider, req)); const qb = served(await plane.request(b.provider, req));
  const comparison = compareQuotes([qa, qb], { now: NOW });
  assert.equal(normalizeQuote(qa, { now: NOW }).netReceivedRaw, BIG - 5n);
  assert.equal(comparison.best?.quote.provider, b.provider); assert.equal(comparison.ranked.length, 2);
  assert.ok(comparison.ranked.find(x => x.quote.provider === a.provider)?.warnings.includes("RISK_UNKNOWN"));
  const fixtures = [economic(qa), economic(qb)]; const snapshots = structuredClone(fixtures);
  const econ = compareOfflineFees(fixtures, { now: NOW });
  assert.equal(econ.best?.comparisonObjectiveRaw, BIG - 4n); assert.equal("netReceivedRaw" in econ.best!, false);
  assert.deepEqual(fixtures, snapshots); assert.equal(qa.riskScore, "UNKNOWN");
  qa.path[0] = "caller-mutation";
  const cached = await plane.request(a.provider, req); assert.equal(cached.outcome, "CACHE_HIT");
  assert.equal(cached.quote?.path[0], "pool-source"); assert.equal(plane.budgetUsed(), 2); assert.equal(plane.quotaUsed(a.provider), 1);
  assert.deepEqual({ a, b, req }, before);
});

for (const asset of [source, native, output]) test(`admission liée à conversion ${asset.role}, ratio brut et ceil par ligne`, async () => {
  const q = served((await admit(quote())).admission); const before = structuredClone(q);
  const f = economic(q, asset); const result = runEconomic(f).best;
  assert.ok(result); assert.equal(result.totalAdditionalOutputRaw, asset === output ? 5n : 8n);
  assert.equal(result.comparisonObjectiveRaw, BIG - (asset === output ? 5n : 8n));
  assert.equal(result.quote.routeId, q.routeId); assert.equal(result.quote.minAmountOutRaw, q.minAmountOutRaw);
  assert.deepEqual(q, before);
  if (asset !== output) {
    const refused = await admit(f.quote);
    assert.equal(refused.admission.blocker, "COST_UNIT_NOT_NORMALIZED"); assert.equal(refused.plane.cacheEntries(), 0);
  }
});
test("admission liée à coûts mixtes SOURCE/NATIVE/OUTPUT : wrapper seul, control plane fermé", async () => {
  const q = served((await admit(quote("synthetic-a", { costs: { gasRaw: 3n, bridgeFeeRaw: 2n, protocolFeeRaw: 1n } }))).admission);
  const f = economic(q); f.quote.costUnit = "UNKNOWN"; f.contract.costUnit = "UNKNOWN";
  f.conversion = { ...f.conversion, rates: [rate(source), rate(native)], fees: f.conversion.fees.map((fee, i) => ({ ...fee, asset: [source, native, output][i] })) };
  assert.equal(runEconomic(f).best?.comparisonObjectiveRaw, BIG - 9n);
  assert.equal((await admit(f.quote)).admission.blocker, "COST_UNIT_NOT_NORMALIZED");
});
for (const mode of ["GROSS", "NET", "INCLUDED"] as const) test(`admission puis wrapper ${mode} : déduction unique`, async () => {
  const included = mode === "INCLUDED";
  const req = request(); req.feePolicy = included ? "INCLUDED" : "ADDITIONAL";
  const q = served((await admit(quote("synthetic-a", { amountOutBasis: mode === "GROSS" ? "GROSS" : "NET", feePolicy: req.feePolicy }), req)).admission);
  const f = economic(q); assert.equal(runEconomic(f).best?.comparisonObjectiveRaw, BIG - (mode === "GROSS" ? 5n : 0n));
  assert.equal(normalizeQuote(q, { now: NOW }).netReceivedRaw, BIG - (mode === "GROSS" ? 5n : 0n));
});
for (const [mode, expected] of [["missing", "RATE_MISSING"], ["stale", "RATE_EXPIRED"], ["future", "INVALID_RATE_TIME"], ["ambiguous", "RATE_AMBIGUOUS"]] as const) test(`admission valide, conversion ${mode} refusée séparément`, async () => {
  const f = economic(served((await admit(quote())).admission), source); const r = rate(source);
  f.conversion = { ...f.conversion, rates: mode === "missing" ? [] : mode === "ambiguous" ? [r, r] : [{ ...r, ...(mode === "stale" ? { expiresAt: NOW } : { observedAt: NOW + 1 }) }] };
  assert.equal(runEconomic(f).unrankable[0].blocker, expected); assert.equal(runEconomic(f).best, null);
});
for (const different of [false, true]) test(`paths complets ${different ? "distincts conservés" : "dupliqués meilleur conservé"}`, async () => {
  const a = served((await admit(quote())).admission);
  const b = served((await admit(quote("synthetic-b", { amountOutRaw: BIG + 1n, ...(different ? { path: ["different-pool", "bridge", "pool-destination"] } : {}) }), request(), config(), "synthetic-b")).admission);
  const result = compareQuotes([a, b], { now: NOW }); assert.equal(result.ranked.length, different ? 2 : 1);
  assert.equal(result.duplicates.length, different ? 0 : 1); assert.equal(result.best?.quote.provider, "synthetic-b");
});
for (const [name, patch, blocker] of [
  ["signed", { signed: true }, "SIGNED_QUOTE_FORBIDDEN"], ["no-route", { path: [] }, "MISSING_PATH"],
  ["incomplete", { pathCompleteness: "INCOMPLETE" }, "PATH_INCOMPLETE"], ["wrong-token", { toToken: "WRONG" }, "REQUEST_MISMATCH"],
  ["min-unknown", { minAmountOutRaw: undefined }, "REQUEST_MISMATCH"], ["min-violated", { costs: { gasRaw: 60n } }, "BELOW_MIN_AMOUNT_OUT"],
  ["mixed-cost", { costUnit: "UNKNOWN" }, "COST_UNIT_NOT_NORMALIZED"],
] as const) test(`raw canned -> control plane refuse ${name}`, async () => {
  const { admission, plane } = await admit(quote("synthetic-a", patch));
  assert.equal(admission.blocker, blocker); assert.equal(admission.quote, null); assert.equal(plane.cacheEntries(), 0);
});
for (const raw of [null, [], {}, { ...quote(), costs: null }, { ...quote(), path: null }]) test(`raw malformé ${raw === null ? "null" : Array.isArray(raw) ? "array" : Object.keys(raw).join(",")} : control plane`, async () => {
  const result = await admit(raw); assert.equal(result.admission.outcome, "REFUSED_MALFORMED_QUOTE"); assert.equal(result.plane.cacheEntries(), 0);
});

function lifi(): LifiStep {
  return { id: "synthetic-lifi", tool: "tool", action: { fromChainId: 1, toChainId: 2, fromToken: { address: "SRC", chainId: 1 }, toToken: { address: "OUT", chainId: 2 }, slippage: 0.002 },
    estimate: { fromAmount: BIG.toString(), toAmount: BIG.toString(), toAmountMin: (BIG - 50n).toString(), feeCosts: [], gasCosts: [] } };
}
for (const variant of ["absent", "null", "empty", "wrong-token", "min-unknown"] as const) test(`raw LI.FI ${variant} -> adapter puis control plane sans enrichissement`, async () => {
  const step = lifi();
  if (variant === "absent") delete step.estimate!.gasCosts;
  if (variant === "null") step.estimate!.gasCosts = null as never;
  if (variant === "wrong-token") step.action!.toToken!.address = "WRONG";
  if (variant === "min-unknown") delete step.estimate!.toAmountMin;
  const mapped = mapLifiStep(step);
  if (variant === "absent" || variant === "null") assert.equal(mapped.blocker, "LIFI_COST_COMPLETENESS_UNKNOWN");
  if (variant === "min-unknown") assert.equal(mapped.blocker, "LIFI_AMOUNT_UNPARSEABLE");
  // Contrat LI.FI-shaped FIXTURE artificiel : jamais LIFI_CONTRACT_REFERENCE,
  // jamais registre par défaut, aucune disponibilité du provider réel affirmée.
  // Il sert uniquement à atteindre le guard path après le mapper sans enrichir la quote.
  const cfg = config({ registry: createRegistry([contract("lifi")]) });
  const { admission } = await admit(mapped.quote, request(), cfg, "lifi");
  assert.equal(admission.served, false);
  if (variant === "empty") { assert.equal(mapped.quote?.costs.gasRaw, 0n); assert.equal(admission.blocker, "PATH_INCOMPLETE"); }
  if (variant === "wrong-token") assert.equal(admission.blocker, "REQUEST_MISMATCH");
});
test("objectif économique sous minimum provider : jamais une nouvelle garantie nette", async () => {
  const q = served((await admit(quote("synthetic-a", { amountOutBasis: "NET", minAmountOutRaw: BIG }))).admission);
  const f = economic(q, source);
  // Nouvelle attestation GROSS offline explicite, pas réécriture de l'admission NET.
  f.quote.amountOutBasis = "GROSS"; f.contract.amountOutBasis = "GROSS";
  assert.equal(runEconomic(f).best?.comparisonObjectiveRaw, BIG - 8n);
  assert.equal(q.amountOutBasis, "NET"); assert.equal(q.minAmountOutRaw, BIG);
  assert.equal("netReceivedRaw" in runEconomic(f).best!, false);
});
for (const variant of ["missing-provenance", "fee-provenance", "included-unknown", "empty-fees", "null-fees", "wrong-token"] as const) test(`fixture économique liée ${variant} : jamais de classement`, async () => {
  const f = economic(served((await admit(quote())).admission));
  if (variant === "missing-provenance") delete (f.contract as Partial<typeof f.contract>).provenance;
  if (variant === "fee-provenance") f.conversion = { ...f.conversion, fees: f.conversion.fees.map(fee => ({ ...fee, provenance: undefined as never })) };
  if (variant === "included-unknown") f.conversion = { ...f.conversion, fees: f.conversion.fees.map(fee => ({ ...fee, included: undefined as never })) };
  if (variant === "empty-fees") f.conversion = { ...f.conversion, fees: [] };
  if (variant === "null-fees") f.conversion = { ...f.conversion, fees: null as never };
  if (variant === "wrong-token") f.conversion = { ...f.conversion, fees: f.conversion.fees.map(x => ({ ...x, asset: { ...output, token: "WRONG" } })) };
  assert.equal(runEconomic(f).best, null);
});
test("LI.FI référence documentaire réellement inactive : zéro callback/budget/quota", async () => {
  assert.equal(LIFI_CONTRACT_REFERENCE.activation, "INACTIVE_UNVERIFIED");
  const registry = createRegistry([LIFI_CONTRACT_REFERENCE]);
  assert.equal(registry.contracts.has("lifi"), false);
  assert.ok(registry.invalid.some(entry => entry.providerId === "lifi"));
  let calls = 0;
  const plane = createOfflineQuoteControlPlane({ ...config({ registry }), transport: { fetchQuote: async () => { calls++; return mapLifiStep(lifi()).quote; } } });
  const result = await plane.request("lifi", request());
  assert.equal(result.outcome, "REFUSED_PROVIDER"); assert.equal(result.blocker, "PROVIDER_NOT_REGISTERED");
  assert.equal(calls, 0); assert.equal(plane.budgetUsed(), 0); assert.equal(plane.quotaUsed("lifi"), 0);
});
test("Relay inactif/nonregistered : zéro callback, zéro quota et budget", async () => {
  for (const contracts of [[], [contract("relay", { activation: "INACTIVE_UNVERIFIED" })]]) {
    let calls = 0;
    const plane = createOfflineQuoteControlPlane({ ...config({ registry: createRegistry(contracts) }), transport: { fetchQuote: async () => { calls++; return quote("relay"); } } });
    assert.equal((await plane.request("relay", request())).outcome, "REFUSED_PROVIDER"); assert.equal(calls, 0); assert.equal(plane.budgetUsed(), 0); assert.equal(plane.quotaUsed("relay"), 0);
  }
});
test("NETWORK_CAPABLE refusé avant callback même dans harness", async () => {
  let calls = 0; const plane = createOfflineQuoteControlPlane({ ...config(), transport: { mode: "NETWORK_CAPABLE", fetchQuote: async () => { calls++; return quote(); } } });
  assert.equal((await plane.request("synthetic-a", request())).outcome, "REFUSED_TRANSPORT_UNAUTHORIZED"); assert.equal(calls, 0); assert.equal(plane.budgetUsed(), 0);
});
test("expiry pendant await et isolation breaker entre providers", async () => {
  let now = NOW; let release!: (value: unknown) => void;
  const plane = createOfflineQuoteControlPlane({ ...config({ clock: { now: () => now } }), transport: { fetchQuote: async id => id === "synthetic-a" ? new Promise(resolve => { release = resolve; }) : quote(id) } });
  const pending = plane.request("synthetic-a", request()); now = 102; release(quote("synthetic-a", { expiresAt: 101 }));
  assert.equal((await pending).outcome, "REFUSED_EXPIRED_QUOTE"); assert.equal(plane.cacheEntries(), 0); assert.equal(plane.breakerState("synthetic-a"), "OPEN");
  assert.equal((await plane.request("synthetic-a", request())).outcome, "REFUSED_BREAKER_OPEN");
  served(await plane.request("synthetic-b", request())); assert.equal(plane.breakerState("synthetic-b"), "CLOSED");
});
test("HALF_OPEN : une seule sonde pending, concurrents refusés et B indépendant", async () => {
  let now = NOW; let aCalls = 0; let release!: (value: unknown) => void;
  const plane = createOfflineQuoteControlPlane({ ...config({ clock: { now: () => now } }), transport: { fetchQuote: async id => {
    if (id === "synthetic-b") return quote(id);
    aCalls++;
    if (aCalls === 1) throw new Error("synthetic-failure");
    return new Promise(resolve => { release = resolve; });
  } } });
  assert.equal((await plane.request("synthetic-a", request())).outcome, "REFUSED_TRANSPORT_ERROR");
  assert.equal(plane.breakerState("synthetic-a"), "OPEN");
  now += 5; // cooldown atteint exactement, horloge déterministe, aucun sleep.
  const probe = plane.request("synthetic-a", request());
  assert.equal(plane.breakerState("synthetic-a"), "HALF_OPEN");
  assert.equal(plane.quotaUsed("synthetic-a"), 2);
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => plane.request("synthetic-a", request())));
  assert.ok(concurrent.every(result => result.outcome === "REFUSED_BREAKER_OPEN"));
  assert.equal(aCalls, 2); assert.equal(plane.quotaUsed("synthetic-a"), 2);
  served(await plane.request("synthetic-b", request()));
  assert.equal(plane.breakerState("synthetic-b"), "CLOSED"); assert.equal(plane.breakerState("synthetic-a"), "HALF_OPEN");
  release(quote()); served(await probe);
  assert.equal(plane.breakerState("synthetic-a"), "CLOSED");
  assert.equal((await plane.request("synthetic-a", request())).outcome, "CACHE_HIT"); assert.equal(aCalls, 2);
});
test("quota réservé avant await et snapshot requête indépendant", async () => {
  let release!: (value: unknown) => void; let captured!: QuoteRequest; let calls = 0;
  const plane = createOfflineQuoteControlPlane({ ...config({ quotaPerProvider: 1 }), transport: { fetchQuote: async (_id, req) => { calls++; captured = req; return new Promise(resolve => { release = resolve; }); } } });
  const req = request(); const pending = plane.request("synthetic-a", req);
  assert.equal(plane.quotaUsed("synthetic-a"), 1); assert.equal(plane.budgetUsed(), 1);
  req.amountInRaw = 1n; req.route.maxSteps = 1;
  assert.equal(captured.amountInRaw, BIG); assert.equal(captured.route.maxSteps, 3);
  assert.equal((await plane.request("synthetic-a", request())).outcome, "REFUSED_QUOTA_EXCEEDED"); assert.equal(calls, 1);
  release(quote()); served(await pending);
});
test("cache identité économique exacte : chaque changement force nouvel appel", async () => {
  const initial = request();
  const variants: QuoteRequest[] = [
    { ...initial, amountInRaw: BIG + 1n }, { ...initial, minAmountOutRaw: BIG - 99n }, { ...initial, maxSlippageBps: 49 },
    { ...initial, preferences: { speed: true } }, { ...initial, providerParams: { fixture: false } }, { ...initial, route: { maxSteps: 2 } },
    { ...initial, feePolicy: "INCLUDED" }, { ...initial, fromAsset: "OTHER" }, { ...initial, toAsset: "OTHER" }, { ...initial, toChainId: 3 },
  ];
  assert.equal(new Set([initial, ...variants].map(req => quoteCacheKey("synthetic-a", req))).size, variants.length + 1);
  for (const req of variants) {
    const plane = createCannedOfflineQuoteControlPlane(config(), [quote(), null]);
    served(await plane.request("synthetic-a", initial));
    assert.equal((await plane.request("synthetic-a", initial)).outcome, "CACHE_HIT");
    const result = await plane.request("synthetic-a", req);
    const supported = req.fromAsset === "SRC" && req.toAsset === "OUT" && req.toChainId === 2;
    assert.equal(result.outcome, supported ? "REFUSED_MALFORMED_QUOTE" : "REFUSED_PROVIDER");
    assert.equal(plane.budgetUsed(), supported ? 2 : 1);
  }
  assert.notEqual(quoteCacheKey("synthetic-a", initial), quoteCacheKey("synthetic-b", initial));
});
