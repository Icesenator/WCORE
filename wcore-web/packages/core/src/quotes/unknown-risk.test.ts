// WC-12 : absence de preuve != risque moyen ; outils != chemin de pools.
// Exécution prévue après checkpoint identité/cache ; tests offline uniquement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLifiStep } from "./adapters/lifi.js";
import type { LifiStep } from "./adapters/lifi.js";
import { compareQuotes } from "./compare.js";
import { normalizeQuote } from "./normalize.js";
import type { ProviderQuote } from "./types.js";

function complete(routeId: string, riskScore: ProviderQuote["riskScore"]): ProviderQuote {
  return {
    provider: "synthetic", routeId, fromChainId: 1, toChainId: 2,
    fromToken: "IN", toToken: "OUT", amountInRaw: 10n, amountOutRaw: 20n,
    costs: {}, costUnit: "OUTPUT_RAW", feePolicy: "ADDITIONAL", amountOutBasis: "GROSS",
    slippageBps: 0, estimatedDurationSec: 1, steps: 1,
    path: [routeId], pathCompleteness: "COMPLETE", riskScore,
  };
}

function syntheticStep(includedSteps?: LifiStep["includedSteps"]): LifiStep {
  // Fixture synthétique de forme documentée, jamais une réponse LIVE attestée.
  return {
    id: "synthetic-lifi", type: "swap", tool: "same-tool",
    action: {
      fromChainId: 1, toChainId: 2, slippage: 0.001,
      fromToken: { address: "IN", chainId: 1 },
      toToken: { address: "OUT", chainId: 2 },
    },
    estimate: { fromAmount: "10", toAmount: "20", toAmountMin: "19", feeCosts: [], gasCosts: [] },
    includedSteps,
  };
}

test("LI.FI sans preuve de risque ne reçoit pas un score artificiel", () => {
  const mapped = mapLifiStep(syntheticStep());
  assert.ok(mapped.quote);
  assert.equal(mapped.quote.riskScore, "UNKNOWN");
});

test("risque UNKNOWN explicite : warning sans conversion numérique", () => {
  // Cast uniquement pour le RED avant évolution du contrat public.
  const q = complete("unknown", "UNKNOWN");
  const result = normalizeQuote(q, { now: 1000 });
  assert.equal(result.comparable, true);
  assert.ok(result.warnings.includes("RISK_UNKNOWN"));
});

test("UNKNOWN ne gagne ni ne perd un tie-break de risque attesté", () => {
  for (const score of [0.2, 0.8]) {
    const unknown = complete("u", "UNKNOWN");
    const known = complete("k", score);
    assert.deepEqual(compareQuotes([unknown, known]).ranked.map(r => r.quote.routeId), ["u", "k"]);
    assert.deepEqual(compareQuotes([known, unknown]).ranked.map(r => r.quote.routeId), ["k", "u"]);
  }
});

test("groupe mixte à trois routes : pas de comparateur de risque non transitif", () => {
  const high = complete("high", 0.8);
  const unknown = complete("unknown", "UNKNOWN");
  const low = complete("low", 0.2);
  assert.deepEqual(compareQuotes([high, unknown, low]).ranked.map(r => r.quote.routeId), ["high", "unknown", "low"]);
  assert.deepEqual(compareQuotes([low, unknown, high]).ranked.map(r => r.quote.routeId), ["low", "unknown", "high"]);
});

test("deux risques connus conservent le départage numérique", () => {
  assert.deepEqual(compareQuotes([complete("high", 0.8), complete("low", 0.2)])
    .ranked.map(r => r.quote.routeId), ["low", "high"]);
});

test("risques numériques invalides restent refusés", () => {
  for (const score of [NaN, Infinity, -0.1, 1.1]) {
    assert.equal(normalizeQuote(complete("invalid", score)).blocker, "INVALID_RISK");
  }
});

test("noms de tools LI.FI ne prouvent jamais un chemin complet", () => {
  for (const steps of [undefined, [], [{}], [{ tool: "oneinch" }], [{ tool: "oneinch" }, { tool: "relay" }]]) {
    const mapped = mapLifiStep(syntheticStep(steps));
    assert.ok(mapped.quote);
    assert.equal(mapped.quote.pathCompleteness, "INCOMPLETE");
    assert.equal(normalizeQuote(mapped.quote).blocker, "PATH_INCOMPLETE");
  }
});

test("mêmes tools, pools inconnus : les deux routes restent hors déduplication", () => {
  const a = mapLifiStep(syntheticStep([{ tool: "same" }])).quote;
  const b = mapLifiStep({ ...syntheticStep([{ tool: "same" }]), id: "synthetic-other" }).quote;
  assert.ok(a); assert.ok(b);
  const result = compareQuotes([a, b]);
  assert.equal(result.ranked.length, 0);
  assert.equal(result.duplicates.length, 0);
  assert.equal(result.unrankable.length, 2);
});
