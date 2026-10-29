import { test } from "node:test";
import assert from "node:assert/strict";
import { compareOfflineEconomicResults } from "./economic-result.js";
import type { OfflineFeeFixture } from "./offline-fee-comparison.js";

// Import dynamique : le premier RED est une assertion de contrat absent, pas
// une erreur de résolution ni un stub d'implémentation rétrospectif.
const modulePath = "./economic-result-json.js";
const boundary: typeof import("./economic-result-json.js") | null = await import(modulePath).catch(() => null);
const serialize = (r: ReturnType<typeof compareOfflineEconomicResults>["ranked"][number]) => {
  assert.equal(typeof boundary?.economicResultToJson, "function", "contrat JSON interne absent");
  return boundary!.economicResultToJson(r);
};
function fixture(): OfflineFeeFixture {
  const source = { chainId: 1, token: "SRC", decimals: 6, role: "SOURCE" } as const;
  const output = { chainId: 2, token: "OUT", decimals: 8, role: "OUTPUT" } as const;
  return {
    quote: { provider: "A", routeId: "a", fromChainId: 1, toChainId: 2, fromToken: "SRC", toToken: "OUT", amountInRaw: 100n, amountOutRaw: 1000n, expectedOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costs: { gasRaw: 10n, bridgeFeeRaw: 0n, protocolFeeRaw: 0n }, costUnit: "OUTPUT_RAW", slippageBps: 0, estimatedDurationSec: 10, steps: 1, path: ["hop"], riskScore: "UNKNOWN", expiresAt: 200 },
    conversion: { source, output, native: { chainId: 1, token: "ETH", decimals: 18, role: "NATIVE" }, fees: [10n, 0n, 0n].map(amountRaw => ({ asset: output, amountRaw, included: false, provenance: "SYNTHETIC_FIXTURE" })), rates: [], now: 100, includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT" },
    contract: { provenance: "SYNTHETIC_FIXTURE", completeness: "COMPLETE", source, output, amountInRaw: 100n, amountOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costUnit: "OUTPUT_RAW", feeFields: ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"] },
  };
}
function project(f = fixture()) {
  const c = compareOfflineEconomicResults([f], { now: 100 });
  return c.best ?? c.unrankable[0];
}
test("risque non fini et montant attendu corrompu ne deviennent pas données JSON connues", () => {
  const invalidRisk = fixture(); invalidRisk.quote.riskScore = NaN;
  const risk = serialize(project(invalidRisk));
  assert.equal(risk.riskScore, "UNKNOWN");
  assert.ok(risk.blockers.includes("INVALID_RISK"));
  assert.equal(JSON.parse(JSON.stringify(risk)).riskScore, "UNKNOWN");
});

test("montant attendu corrompu refusé en amont et inconnu en JSON", () => {
  const invalidAmount = fixture();
  invalidAmount.quote.expectedOutRaw = "not-an-atomic-amount" as unknown as bigint;
  const result = project(invalidAmount);
  assert.ok(result.blockers.includes("INVALID_EXPECTED_AMOUNT_OUT"));
  const json = serialize(result);
  assert.equal(json.expectedOut.raw, null);
  assert.equal(json.expectedOut.status, "UNKNOWN");
});

test("contrat JSON interne explicite et montants atomiques exacts", () => {
  const r = project(); const j = serialize(r);
  assert.equal(j.amountIn.raw, "100"); assert.equal(j.amountOut.raw, "1000");
  assert.equal(j.expectedOut.raw, "1000"); assert.equal(j.comparisonObjective.raw, "990");
  assert.deepEqual(j.amountIn, { status: "KNOWN", raw: "100", unit: "ATOMIC", asset: r.source });
  for (const key of ["amountOut", "expectedOut", "providerMinimum", "totalAdditionalOutput", "comparisonObjective"]) assert.deepEqual(j[key].asset, r.output);
  assert.equal(j.objectiveStatus, "PROVISIONAL"); assert.equal(j.realAvailability, "NON_ATTESTED");
  assert.equal(j.guaranteedNet, "NOT_CLAIMED"); assert.equal(j.context, "INTERNAL_OFFLINE_PROJECTION");
  assert.equal(j.sourceAuthority, "NOT_PROVIDER_AUTHENTICATION");
  assert.deepEqual(j.temporal, { status: "CURRENT", expiresAt: 200, unit: "EPOCH_SECONDS" });
  assert.deepEqual(j.warnings, r.warnings); assert.deepEqual(j.blockers, []);
});
test("bigints immenses : JSON sans résidu et roundtrip décimal exact", () => {
  const f = fixture(); const huge = 10n ** 100n + 123456789n;
  f.quote.amountInRaw = huge; f.contract.amountInRaw = huge;
  f.quote.amountOutRaw = huge; f.contract.amountOutRaw = huge;
  f.quote.expectedOutRaw = huge; f.quote.minAmountOutRaw = huge;
  const j = serialize(project(f)); const parsed = JSON.parse(JSON.stringify(j));
  assert.deepEqual(parsed, j);
  for (const key of ["amountIn", "amountOut", "expectedOut", "providerMinimum"]) assert.equal(BigInt(parsed[key].raw), huge);
  assert.equal(BigInt(parsed.comparisonObjective.raw), huge - 10n);
  assert.equal(parsed.declaredFees.lines[0].amount.raw, "10");
});
test("minimum absent UNKNOWN, minimum zéro KNOWN et attendu absent distincts", () => {
  const f = fixture(); delete f.quote.expectedOutRaw;
  const absent = serialize(project(f));
  assert.equal(absent.providerMinimum.status, "UNKNOWN"); assert.equal(absent.providerMinimum.raw, null);
  assert.equal(absent.expectedOut.status, "UNKNOWN"); assert.equal(absent.expectedOut.raw, null);
  f.quote.minAmountOutRaw = 0n;
  const zero = serialize(project(f)); assert.equal(zero.providerMinimum.status, "KNOWN"); assert.equal(zero.providerMinimum.raw, "0");
});
for (const invalid of [-1n, 0 as unknown as bigint]) test(`minimum invalide ${typeof invalid} refusé en amont`, () => {
  const f = fixture(); f.quote.minAmountOutRaw = invalid;
  const r = project(f); assert.deepEqual(r.blockers, ["INVALID_MIN_AMOUNT_OUT"]);
  const j = serialize(r); assert.deepEqual(j.blockers, r.blockers); assert.equal(j.providerMinimum.raw, null);
});
test("coût absent et conversion inconnue ne deviennent pas zéro", () => {
  const f = fixture(); delete f.quote.costs.gasRaw;
  const j = serialize(project(f));
  assert.equal(j.declaredFees.costs.gas.status, "UNKNOWN"); assert.equal(j.declaredFees.costs.gas.raw, null);
  assert.equal(j.declaredFees.costs.bridgeFee.raw, "0");
  assert.equal(j.comparisonObjective.raw, null); assert.equal(j.totalAdditionalOutput.status, "UNKNOWN");
  assert.deepEqual(j.blockers, ["FEE_AMOUNT_BINDING_MISMATCH"]);
});
for (const included of [false, true]) test(`frais visibles inclus=${included}, déduction au plus une fois`, () => {
  const f = fixture();
  f.conversion = { ...f.conversion, fees: f.conversion.fees.map(line => ({ ...line, included })) };
  const j = serialize(project(f));
  assert.equal(j.declaredFees.lines[0].amount.raw, "10");
  assert.deepEqual(j.declaredFees.lines[0].amount.asset, f.conversion.output);
  assert.equal(j.declaredFees.lines[0].included, included);
  assert.equal(j.totalAdditionalOutput.raw, included ? "0" : "10");
  assert.equal(j.comparisonObjective.raw, included ? "1000" : "990");
});
for (const mode of ["expires", "path", "unknown-time"] as const) test(`statut ${mode} et blockers préservés`, () => {
  const f = fixture();
  if (mode === "expires") f.quote.expiresAt = 100;
  if (mode === "path") f.quote.pathCompleteness = "INCOMPLETE";
  if (mode === "unknown-time") delete f.quote.expiresAt;
  const r = project(f); const j = serialize(r);
  assert.deepEqual(j.blockers, r.blockers); assert.deepEqual(j.warnings, r.warnings);
  assert.equal(j.temporal.status, mode === "expires" ? "EXPIRED" : mode === "unknown-time" ? "UNKNOWN" : "CURRENT");
  if (mode === "unknown-time") assert.equal(j.temporal.expiresAt, null);
  if (mode === "path") assert.equal(j.pathCompleteness, "INCOMPLETE");
});
test("identités mixtes non classées restent distinctes dans le JSON", () => {
  const a = fixture(); const b = fixture();
  b.conversion = { ...b.conversion, output: { ...b.conversion.output, decimals: 18 } };
  const c = compareOfflineEconomicResults([a, b], { now: 100 });
  assert.equal(c.best, null);
  const j = c.unrankable.map(serialize);
  assert.deepEqual(j.map(r => r.amountOut.asset.decimals), [8, 18]);
  assert.ok(j.every(r => r.blockers.includes("MIXED_REQUEST") && r.comparisonObjective.raw === null));
});
test("sortie défensive allowlistée : aucun champ interne ni toJSON de la source", () => {
  const r = project(); const before = structuredClone(r);
  Object.assign(r, { internalSecret: 999n, toJSON() { throw new Error("source callback interdit"); } });
  Object.assign(r.source, { internal: 999n }); Object.assign(r.declaredFees.costs, { internal: 999n });
  const j = serialize(r); const json = JSON.stringify(j);
  assert.ok(!json.includes("internal")); assert.ok(!json.includes("toJSON"));
  assert.deepEqual(Object.keys(j).sort(), ["context", "sourceAuthority", "provider", "routeId", "source", "output", "amountIn", "amountOut", "amountOutBasis", "expectedOut", "providerMinimum", "declaredFees", "totalAdditionalOutput", "comparisonObjective", "objectiveStatus", "temporal", "path", "pathCompleteness", "riskScore", "warnings", "blockers", "provenance", "realAvailability", "guaranteedNet"].sort());
  j.source.token = "changed"; j.amountOut.asset.decimals = 77;
  j.declaredFees.lines[0].amount.asset.token = "changed";
  j.path.push("changed"); j.warnings.push("changed"); j.blockers.push("changed");
  assert.equal(r.source.token, before.source.token); assert.equal(r.output.decimals, before.output.decimals);
  assert.deepEqual(r.path, before.path); assert.deepEqual(r.warnings, before.warnings); assert.deepEqual(r.blockers, before.blockers);
});
