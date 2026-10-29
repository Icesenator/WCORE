import { test } from "node:test";
import assert from "node:assert/strict";
import * as offline from "./offline-fee-comparison.js";
import type { ProviderQuote } from "./types.js";
import type { FeeConversionInput, FeeLine } from "./fee-conversion.js";

const source = { chainId: 1, token: "SRC", decimals: 6, role: "SOURCE" } as const;
const native = { chainId: 1, token: "ETH", decimals: 18, role: "NATIVE" } as const;
const output = { chainId: 2, token: "OUT", decimals: 8, role: "OUTPUT" } as const;
const line = (asset = output as FeeLine["asset"], amountRaw = 10n, included = false): FeeLine => ({ asset, amountRaw, included, provenance: "SYNTHETIC_FIXTURE" });
function fixture(): offline.OfflineFeeFixture {
  const quote: ProviderQuote = { provider: "A", routeId: "a", fromChainId: 1, toChainId: 2, fromToken: "SRC", toToken: "OUT", amountInRaw: 100n, amountOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costs: { gasRaw: 10n, bridgeFeeRaw: 0n, protocolFeeRaw: 0n }, costUnit: "OUTPUT_RAW", slippageBps: 0, estimatedDurationSec: 10, steps: 1, path: ["hop-a"], riskScore: "UNKNOWN", expiresAt: 200 };
  const conversion: FeeConversionInput = { source, native, output, fees: [line(), line(output, 0n), line(output, 0n)], rates: [], now: 100, includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT" };
  return { quote, conversion, contract: { provenance: "SYNTHETIC_FIXTURE", completeness: "COMPLETE", source, output, amountInRaw: 100n, amountOutRaw: 1000n, amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costUnit: "OUTPUT_RAW", feeFields: ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"] } };
}
const run = (f = fixture()) => offline.compareOfflineFees([f], { now: 100 });

test("wrapper offline disponible et coût OUTPUT séparé du net promis", () => {
  assert.equal(typeof offline.compareOfflineFees, "function");
  const f = fixture(); const result = run(f);
  assert.equal(result.provenance, "SYNTHETIC_FIXTURE");
  assert.equal(result.ranked[0].comparisonObjectiveRaw, 990n);
  assert.equal(result.ranked[0].totalAdditionalOutputRaw, 10n);
  assert.equal(result.ranked[0].quote, f.quote);
  assert.equal("netReceivedRaw" in result.ranked[0], false);
});
for (const role of ["SOURCE", "NATIVE"] as const) test(`conversion ${role}`, () => {
  const f = fixture(); const asset = role === "SOURCE" ? source : native;
  f.quote.costUnit = role === "SOURCE" ? "INPUT_RAW" : "UNKNOWN"; f.contract.costUnit = f.quote.costUnit;
  f.conversion = { ...f.conversion, fees: [line(asset), line(asset, 0n), line(asset, 0n)], rates: [{ source: asset, output, numerator: 3n, denominator: 2n, observedAt: 90, expiresAt: 110, provenance: "SYNTHETIC_FIXTURE" }] };
  assert.equal(run(f).ranked[0].comparisonObjectiveRaw, 985n);
});
test("mélange explicite et ceil par ligne", () => {
  const f = fixture(); f.quote.costUnit = "UNKNOWN"; f.contract.costUnit = "UNKNOWN"; f.quote.costs.bridgeFeeRaw = 1n;
  f.conversion = { ...f.conversion, fees: [line(output), line(source, 1n), line(native, 0n)], rates: [{ source, output, numerator: 1n, denominator: 3n, observedAt: 90, expiresAt: 110, provenance: "SYNTHETIC_FIXTURE" }] };
  assert.equal(run(f).ranked[0].comparisonObjectiveRaw, 989n);
});
test("included exclu une fois", () => { const f = fixture(); f.conversion = { ...f.conversion, fees: [line(output, 10n, true), line(output, 0n), line(output, 0n)] }; assert.equal(run(f).ranked[0].comparisonObjectiveRaw, 1000n); });
for (const mode of ["missing", "expired", "future", "ambiguous"] as const) test(`ratio ${mode} refuse`, () => {
  const f = fixture(); f.quote.costUnit = "INPUT_RAW"; f.contract.costUnit = "INPUT_RAW";
  const rate = { source, output, numerator: 1n, denominator: 1n, observedAt: mode === "future" ? 101 : 90, expiresAt: mode === "expired" ? 100 : 110, provenance: "SYNTHETIC_FIXTURE" as const };
  f.conversion = { ...f.conversion, fees: [line(source), line(source, 0n), line(source, 0n)], rates: mode === "missing" ? [] : mode === "ambiguous" ? [rate, rate] : [rate] };
  assert.equal(run(f).ranked.length, 0); assert.equal(run(f).unrankable[0].totalAdditionalOutputRaw, null);
});
for (const field of ["chainId", "token", "decimals"] as const) test(`liaison ${field} stricte`, () => {
  const f = fixture(); f.conversion = { ...f.conversion, output: { ...output, [field]: field === "token" ? "OTHER" : 9 } };
  assert.equal(run(f).ranked.length, 0);
});
test("zéro explicite accepté, poste absent refusé", () => { const f = fixture(); f.quote.costs.gasRaw = 0n; f.conversion = { ...f.conversion, fees: [line(output, 0n), line(output, 0n), line(output, 0n)] }; assert.equal(run(f).ranked.length, 1); delete f.quote.costs.bridgeFeeRaw; assert.equal(run(f).ranked.length, 0); });
test("contrat partiel refusé", () => { const f = fixture(); f.contract.completeness = "PARTIAL" as "COMPLETE"; assert.equal(run(f).ranked.length, 0); });
test("NET ne double pas les coûts", () => { const f = fixture(); f.quote.amountOutBasis = "NET"; f.contract.amountOutBasis = "NET"; assert.equal(run(f).ranked[0].comparisonObjectiveRaw, 1000n); });
test("GROSS additionnel déduit une fois", () => assert.equal(run().ranked[0].comparisonObjectiveRaw, 990n));
for (const [name, change, blocker] of [
  ["expired", (q: ProviderQuote) => { q.expiresAt = 100; }, "QUOTE_EXPIRED"],
  ["signed", (q: ProviderQuote) => { q.signed = true; }, "SIGNED_QUOTE_FORBIDDEN"],
  ["incomplete", (q: ProviderQuote) => { q.pathCompleteness = "INCOMPLETE"; }, "PATH_INCOMPLETE"],
] as const) test(`garde ${name} préservée`, () => { const f = fixture(); change(f.quote); assert.equal(run(f).unrankable[0].blocker, blocker); });
test("deux providers déterministes et risque inconnu conservé", () => { const a = fixture(); const b = fixture(); b.quote.provider = "B"; b.quote.routeId = "b"; b.quote.path = ["hop-b"]; b.quote.riskScore = 0; const r = offline.compareOfflineFees([a, b], { now: 100 }); assert.deepEqual(r.ranked.map(x => x.quote.provider), ["A", "B"]); assert.equal(r.ranked[0].quote.riskScore, "UNKNOWN"); assert.ok(r.ranked[0].warnings.includes("RISK_UNKNOWN")); });
test("pas de mutation de fixture ni permission implicite", () => { const f = fixture(); const before = structuredClone(f); run(f); assert.deepEqual(f, before); assert.equal("signed" in f.quote, false); });
for (const field of ["amountInRaw", "amountOutRaw", "amountOutBasis", "feePolicy", "costUnit"] as const) test(`binding ${field}`, () => { const f = fixture(); Object.assign(f.contract, { [field]: "mismatch" }); assert.equal(run(f).ranked.length, 0); });
test("INPUT_RAW ne permet pas de frais OUTPUT", () => { const f = fixture(); f.quote.costUnit = "INPUT_RAW"; f.contract.costUnit = "INPUT_RAW"; assert.equal(run(f).ranked.length, 0); });
test("mélange de requêtes interdit", () => { const a = fixture(); const b = fixture(); b.quote.amountInRaw = 101n; b.contract.amountInRaw = 101n; const r = offline.compareOfflineFees([a, b], { now: 100 }); assert.equal(r.ranked.length, 0); assert.equal(r.unrankable.length, 2); });
test("coût économique ne viole pas une promesse min provider", () => { const f = fixture(); f.quote.minAmountOutRaw = 1000n; assert.equal(run(f).ranked[0].comparisonObjectiveRaw, 990n); });
test("horloge de conversion différente refusée", () => { const f = fixture(); f.conversion = { ...f.conversion, now: 99 }; assert.equal(run(f).ranked.length, 0); });
for (const side of ["source", "output"] as const) for (const field of ["chainId", "token", "decimals"] as const) test(`groupe mixte ${side}.${field} refusé`, () => {
  const a = fixture(); const b = fixture();
  const changed = { ...b.conversion[side], [field]: field === "token" ? "OTHER" : 9 };
  b.conversion = { ...b.conversion, [side]: changed }; b.contract[side] = changed;
  if (side === "source" && field === "chainId") b.quote.fromChainId = 9;
  if (side === "source" && field === "token") b.quote.fromToken = "OTHER";
  if (side === "output" && field === "chainId") b.quote.toChainId = 9;
  if (side === "output" && field === "token") b.quote.toToken = "OTHER";
  const r = offline.compareOfflineFees([a, b], { now: 100 });
  assert.equal(r.ranked.length, 0); assert.ok(r.unrankable.every(x => x.blocker === "MIXED_REQUEST"));
});
test("rôles SOURCE/NATIVE non interchangeables", () => { const f = fixture(); f.conversion = { ...f.conversion, source: { ...source, role: "NATIVE" } as unknown as typeof source }; assert.equal(run(f).ranked.length, 0); });
test("frais non reliés ou doublons refusés", () => { const f = fixture(); f.contract.feeFields = ["gasRaw", "gasRaw", "protocolFeeRaw"]; assert.equal(run(f).ranked.length, 0); });
