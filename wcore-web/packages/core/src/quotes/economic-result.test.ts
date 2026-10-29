import { test } from "node:test";
import assert from "node:assert/strict";
import * as economic from "./economic-result.js";
import { compareOfflineFees } from "./offline-fee-comparison.js";
import type { OfflineFeeFixture } from "./offline-fee-comparison.js";

function fixture(): OfflineFeeFixture {
  const source = { chainId: 1, token: "SRC", decimals: 6, role: "SOURCE" } as const;
  const output = { chainId: 2, token: "OUT", decimals: 8, role: "OUTPUT" } as const;
  return {
    quote: { provider: "A", routeId: "a", fromChainId: 1, toChainId: 2, fromToken: "SRC", toToken: "OUT", amountInRaw: 100n, amountOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costs: { gasRaw: 10n, bridgeFeeRaw: 0n, protocolFeeRaw: 0n }, costUnit: "OUTPUT_RAW", slippageBps: 0, estimatedDurationSec: 10, steps: 1, path: ["hop"], riskScore: "UNKNOWN", expiresAt: 200 },
    conversion: { source, output, native: { chainId: 1, token: "ETH", decimals: 18, role: "NATIVE" }, fees: [10n, 0n, 0n].map(amountRaw => ({ asset: output, amountRaw, included: false, provenance: "SYNTHETIC_FIXTURE" })), rates: [], now: 100, includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT" },
    contract: { provenance: "SYNTHETIC_FIXTURE", completeness: "COMPLETE", source, output, amountInRaw: 100n, amountOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costUnit: "OUTPUT_RAW", feeFields: ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"] },
  };
}
const run = (f = fixture()) => economic.compareOfflineEconomicResults([f], { now: 100 });

test("projection interne disponible, bigint et réserves explicites", () => {
  assert.equal(typeof economic.compareOfflineEconomicResults, "function");
  const r = run().ranked[0];
  assert.equal(r.provider, "A"); assert.equal(r.source.token, "SRC"); assert.equal(r.output.token, "OUT");
  assert.equal(r.amountInRaw, 100n); assert.equal(r.amountOutRaw, 1000n); assert.equal(r.amountOutBasis, "GROSS");
  assert.equal(r.totalAdditionalOutputRaw, 10n); assert.equal(r.comparisonObjectiveRaw, 990n);
  assert.equal(r.objectiveStatus, "PROVISIONAL"); assert.equal(r.temporalStatus, "CURRENT");
  assert.equal(r.pathCompleteness, "COMPLETE"); assert.equal(r.riskScore, "UNKNOWN");
  assert.ok(r.warnings.includes("RISK_UNKNOWN")); assert.deepEqual(r.blockers, []);
  assert.equal(r.provenance, "SYNTHETIC_FIXTURE"); assert.equal(r.realAvailability, "NON_ATTESTED");
  assert.equal(r.guaranteedNet, "NOT_CLAIMED"); assert.deepEqual(r.providerMinimum, { status: "UNKNOWN", amountRaw: null });
});
for (const mode of ["NET", "INCLUDED", "LINE_INCLUDED"] as const) test(`convention ${mode} sans double déduction`, () => {
  const f = fixture();
  if (mode !== "LINE_INCLUDED") { f.quote.amountOutBasis = "NET"; f.contract.amountOutBasis = "NET"; }
  if (mode === "INCLUDED") { f.quote.feePolicy = "INCLUDED"; f.contract.feePolicy = "INCLUDED"; }
  if (mode !== "NET") f.conversion = { ...f.conversion, fees: f.conversion.fees.map(line => ({ ...line, included: true })) };
  const r = run(f).ranked[0];
  assert.equal(r.comparisonObjectiveRaw, 1000n); assert.equal(r.totalAdditionalOutputRaw, 0n);
  assert.equal(r.declaredFees.costs.gasRaw, 10n); assert.equal(r.declaredFees.policy, f.quote.feePolicy);
});
test("ratio manquant conserve null et blocker, jamais zéro", () => {
  const f = fixture(); f.quote.costUnit = "INPUT_RAW"; f.contract.costUnit = "INPUT_RAW";
  f.conversion = { ...f.conversion, fees: f.conversion.fees.map(line => ({ ...line, asset: f.conversion.source })) };
  const r = run(f).unrankable[0];
  assert.equal(r.totalAdditionalOutputRaw, null); assert.equal(r.comparisonObjectiveRaw, null);
  assert.equal(r.objectiveStatus, null); assert.deepEqual(r.blockers, ["RATE_MISSING"]);
});
for (const [mode, blocker] of [["identity", "FIXTURE_BINDING_MISMATCH"], ["expiry", "QUOTE_EXPIRED"], ["invalid-expiry", "INVALID_EXPIRY"], ["path", "PATH_INCOMPLETE"], ["risk", "INVALID_RISK"]] as const) test(`refus ${mode} conservé`, () => {
  const f = fixture();
  if (mode === "identity") f.quote.toToken = "OTHER";
  if (mode === "expiry") f.quote.expiresAt = 100;
  if (mode === "invalid-expiry") f.quote.expiresAt = NaN;
  if (mode === "path") f.quote.pathCompleteness = "INCOMPLETE";
  if (mode === "risk") f.quote.riskScore = 2;
  const r = run(f).unrankable[0]; assert.deepEqual(r.blockers, [blocker]); assert.equal(r.comparisonObjectiveRaw, null);
  if (mode === "expiry") assert.equal(r.temporalStatus, "EXPIRED");
  if (mode === "invalid-expiry") assert.equal(r.temporalStatus, "UNKNOWN");
});
test("minimum provider connu distinct de l'objectif économique non garanti", () => {
  const f = fixture(); f.quote.minAmountOutRaw = 1000n; delete f.quote.expiresAt;
  const r = run(f).ranked[0];
  assert.deepEqual(r.providerMinimum, { status: "KNOWN", amountRaw: 1000n });
  assert.equal(r.comparisonObjectiveRaw, 990n); assert.equal(r.guaranteedNet, "NOT_CLAIMED");
  assert.equal(r.temporalStatus, "UNKNOWN");
});
test("projection détachée : mutations profondes du résultat sans mutation d'entrée", () => {
  const f = fixture(); const before = structuredClone(f); const r = run(f).ranked[0];
  (r.path as string[]).push("changed");
  Object.assign(r.source, { token: "changed" }); Object.assign(r.output, { decimals: 99 });
  r.declaredFees.costs.gasRaw = 999n;
  Object.assign(r.declaredFees.lines[0].asset, { token: "changed-fee" });
  (r.warnings as string[]).push("changed");
  assert.deepEqual(f, before);
});
test("ordre et best exactement issus du comparateur, groupe mixte refusé", () => {
  const a = fixture(); const b = fixture(); b.quote.provider = "B"; b.quote.estimatedDurationSec = 1;
  const inputs = [a, b]; const expected = compareOfflineFees(inputs, { now: 100 });
  const actual = economic.compareOfflineEconomicResults(inputs, { now: 100 });
  assert.deepEqual(actual.ranked.map(r => r.provider), expected.ranked.map(r => r.quote.provider));
  assert.equal(actual.best, actual.ranked[0]);
  b.quote.amountInRaw = 101n; b.contract.amountInRaw = 101n;
  const mixed = economic.compareOfflineEconomicResults(inputs, { now: 100 });
  assert.equal(mixed.best, null); assert.ok(mixed.unrankable.every(r => r.blockers[0] === "MIXED_REQUEST"));
  assert.deepEqual(economic.compareOfflineEconomicResults([], { now: 100 }).ranked, []);
});
