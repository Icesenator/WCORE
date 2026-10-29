// Run: node --import tsx --test packages/core/src/quotes/conventions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareQuotes, normalizeQuote } from "./index.js";
import type { ProviderQuote } from "./types.js";

const NOW = 1_800_000_000;

function quote(overrides: Partial<ProviderQuote> = {}): ProviderQuote {
  return {
    provider: "TestProvider",
    routeId: "route-a",
    fromChainId: 1,
    toChainId: 8453,
    fromToken: "0x0000000000000000000000000000000000000001",
    toToken: "0x0000000000000000000000000000000000000002",
    amountInRaw: 1_000_000n,
    amountOutRaw: 1_000n,
    costs: {},
    costUnit: "OUTPUT_RAW",
    slippageBps: 50,
    estimatedDurationSec: 30,
    steps: 2,
    path: ["hop-1", "hop-2"],
    riskScore: 0.2,
    ...overrides,
  };
}

test("amountOut brut + frais additionnels : coûts déduits une seule fois", () => {
  const item = quote({ amountOutBasis: "GROSS", feePolicy: "ADDITIONAL", costs: { gasRaw: 10n, bridgeFeeRaw: 5n } });
  const result = normalizeQuote(item, { now: NOW });
  assert.equal(result.comparable, true);
  assert.equal(result.totalCostRaw, 15n);
  assert.equal(result.netReceivedRaw, 985n);
});

test("amountOut déjà net : aucun coût re-soustrait", () => {
  const item = quote({ amountOutBasis: "NET", feePolicy: "ADDITIONAL", costs: { gasRaw: 10n, bridgeFeeRaw: 5n } });
  const result = normalizeQuote(item, { now: NOW });
  assert.equal(result.totalCostRaw, 0n);
  assert.equal(result.netReceivedRaw, 1_000n);
});

test("frais inclus : jamais soustraits une seconde fois", () => {
  const item = quote({ amountOutBasis: "NET", feePolicy: "INCLUDED", costs: { gasRaw: 10n, bridgeFeeRaw: 5n } });
  const result = normalizeQuote(item, { now: NOW });
  assert.equal(result.totalCostRaw, 0n);
  assert.equal(result.netReceivedRaw, 1_000n);
});

test("frais inclus sur montant brut : conflit refusé", () => {
  const item = quote({ amountOutBasis: "GROSS", feePolicy: "INCLUDED" });
  assert.equal(normalizeQuote(item, { now: NOW }).blocker, "FEE_POLICY_CONFLICT");
});

test("frais non documentés : refus, jamais assimilés à zéro", () => {
  const item = quote({ feePolicy: "UNDOCUMENTED" });
  assert.equal(normalizeQuote(item, { now: NOW }).blocker, "FEES_UNDOCUMENTED");
});

test("coûts en unité source : non classables, jamais zéro", () => {
  const item = quote({ costUnit: "INPUT_RAW", costs: { gasRaw: 10n } });
  const result = normalizeQuote(item, { now: NOW });
  assert.equal(result.comparable, false);
  assert.equal(result.blocker, "COST_UNIT_NOT_NORMALIZED");
  assert.equal(result.netReceivedRaw, null);
});

test("coûts OUTPUT_RAW : classables", () => {
  const item = quote({ costUnit: "OUTPUT_RAW", costs: { protocolFeeRaw: 2n } });
  assert.equal(normalizeQuote(item, { now: NOW }).netReceivedRaw, 998n);
});

test("tokens de sortie différents : buckets séparés, pas de comparaison croisée", () => {
  const usdc = quote({ routeId: "usdc", toToken: "0x0000000000000000000000000000000000000002", amountOutRaw: 1_000n });
  const dai = quote({ routeId: "dai", toToken: "0x00000000000000000000000000000000000000ff", amountOutRaw: 900n });
  const result = compareQuotes([usdc, dai], { now: NOW });
  assert.equal(Object.keys(result.bestByBucket).length, 2);
  assert.equal(result.bestByBucket["1:8453:0x0000000000000000000000000000000000000002"]?.quote.routeId, "usdc");
  assert.equal(result.bestByBucket["1:8453:0x00000000000000000000000000000000000000ff"]?.quote.routeId, "dai");
});

test("slippage de source inconnue : avertissement, pas une valeur inventée", () => {
  const result = normalizeQuote(quote({ slippageSource: "UNKNOWN" }), { now: NOW });
  assert.ok(result.warnings.includes("SLIPPAGE_SOURCE_UNKNOWN"));
  assert.equal(result.comparable, true);
});

test("chemin sous-jacent incomplet : non dédupliqué, refusé", () => {
  const result = normalizeQuote(quote({ pathCompleteness: "INCOMPLETE" }), { now: NOW });
  assert.equal(result.comparable, false);
  assert.equal(result.blocker, "PATH_INCOMPLETE");
});

test("quote expirée : refusée", () => {
  const result = normalizeQuote(quote({ expiresAt: NOW - 1 }), { now: NOW });
  assert.equal(result.comparable, false);
  assert.equal(result.blocker, "QUOTE_EXPIRED");
});

test("quote non expirée : acceptée", () => {
  const result = normalizeQuote(quote({ expiresAt: NOW + 60 }), { now: NOW });
  assert.equal(result.comparable, true);
});

test("expectedOut vs minAmountOut : min supérieur au maximum = incohérence", () => {
  const result = normalizeQuote(quote({ expectedOutRaw: 1_000n, minAmountOutRaw: 1_001n }), { now: NOW });
  assert.equal(result.blocker, "INVALID_MIN_AMOUNT_OUT");
});

test("net inférieur au minAmountOut garanti : refusé", () => {
  const result = normalizeQuote(
    quote({ amountOutRaw: 1_000n, costs: { gasRaw: 100n }, minAmountOutRaw: 950n }),
    { now: NOW },
  );
  assert.equal(result.blocker, "BELOW_MIN_AMOUNT_OUT");
  assert.equal(result.netReceivedRaw, 900n);
});

test("net supérieur ou égal au minAmountOut : accepté", () => {
  const result = normalizeQuote(
    quote({ amountOutRaw: 1_000n, costs: { gasRaw: 100n }, minAmountOutRaw: 900n }),
    { now: NOW },
  );
  assert.equal(result.comparable, true);
});

test("la déduplication ne fusionne pas deux chemins différents du même provider", () => {
  const a = quote({ routeId: "a", provider: "Same", path: ["x"] });
  const b = quote({ routeId: "b", provider: "Same", path: ["y"] });
  const result = compareQuotes([a, b], { now: NOW });
  assert.equal(result.ranked.length, 2);
  assert.equal(result.duplicates.length, 0);
});

test("le net le plus élevé gagne malgré un montant brut inférieur", () => {
  const greedy = quote({ routeId: "greedy", amountOutRaw: 1_000n, costs: { gasRaw: 60n }, path: ["g"] });
  const cheaper = quote({ routeId: "cheaper", amountOutRaw: 970n, costs: { gasRaw: 1n }, path: ["c"] });
  const result = compareQuotes([greedy, cheaper], { now: NOW });
  assert.equal(result.best?.quote.routeId, "cheaper");
  assert.equal(result.best?.netReceivedRaw, 969n);
});
