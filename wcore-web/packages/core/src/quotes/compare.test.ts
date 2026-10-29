// Run: node --import tsx --test packages/core/src/quotes/compare.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareQuotes, normalizeQuote, pathKey } from "./index.js";
import type { ProviderQuote } from "./types.js";

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

test("chemins complets distincts contenant > ne sont jamais fusionnés", () => {
  const a = quote({ routeId: "separator-a", path: ["pool>A", "poolB"], amountOutRaw: 100n });
  const b = quote({ routeId: "separator-b", path: ["pool", "A>poolB"], amountOutRaw: 101n });
  assert.notEqual(pathKey(a), pathKey(b));
  const result = compareQuotes([a, b], { now: 0 });
  assert.equal(result.duplicates.length, 0);
  assert.equal(result.ranked.length, 2);
});

test("minimum provider négatif ou non bigint est refusé, jamais classé", () => {
  for (const minimum of [-1n, NaN, 0, "1"] as const) {
    const item = quote({ minAmountOutRaw: minimum as unknown as bigint });
    const result = compareQuotes([item], { now: 0 });
    assert.equal(result.best, null, String(minimum));
    assert.equal(result.unrankable[0]?.blocker, "INVALID_MIN_AMOUNT_OUT");
  }
  assert.equal(compareQuotes([quote({ minAmountOutRaw: 0n })], { now: 0 }).ranked.length, 1);
});

test("le montant NET reçu classe la route, pas le montant brut", () => {
  const greedy = quote({
    routeId: "greedy",
    amountOutRaw: 1_000n,
    costs: { gasRaw: 50n, bridgeFeeRaw: 10n },
    path: ["greedy-hop"],
  });
  const cheaper = quote({
    routeId: "cheaper",
    amountOutRaw: 980n,
    costs: { gasRaw: 5n, bridgeFeeRaw: 5n },
    path: ["cheaper-hop"],
  });
  const result = compareQuotes([greedy, cheaper]);
  assert.equal(result.best?.quote.routeId, "cheaper");
  assert.equal(result.best?.netReceivedRaw, 970n);
  assert.equal(result.ranked[1]?.quote.routeId, "greedy");
  assert.equal(result.ranked[1]?.netReceivedRaw, 940n);
});

test("un coût dans une unité non normalisable rend la route non classable", () => {
  const item = quote({ routeId: "unknown-unit", costUnit: "INPUT_RAW" });
  const result = compareQuotes([item]);
  assert.equal(result.ranked.length, 0);
  assert.equal(result.unrankable.length, 1);
  assert.equal(result.unrankable[0]?.blocker, "COST_UNIT_NOT_NORMALIZED");
});

test("une quote signée est refusée, jamais classée", () => {
  const result = compareQuotes([quote({ routeId: "signed", signed: true })]);
  assert.equal(result.best, null);
  assert.equal(result.unrankable[0]?.blocker, "SIGNED_QUOTE_FORBIDDEN");
});

test("les routes partageant le même chemin sous-jacent sont dédupliquées", () => {
  const first = quote({ routeId: "via-a", amountOutRaw: 1_000n });
  const second = quote({ routeId: "via-b", amountOutRaw: 990n });
  const result = compareQuotes([first, second]);
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0]?.quote.routeId, "via-a");
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0]?.quote.routeId, "via-b");
  assert.equal(result.duplicates[0]?.duplicateOf, "via-a");
});

test("le meilleur net est conservé lors d'une déduplication", () => {
  const worse = quote({ routeId: "worse-net", amountOutRaw: 1_000n, costs: { gasRaw: 100n } });
  const better = quote({ routeId: "better-net", amountOutRaw: 990n, costs: { gasRaw: 1n } });
  const result = compareQuotes([worse, better]);
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0]?.quote.routeId, "better-net");
  assert.equal(result.duplicates[0]?.quote.routeId, "worse-net");
});

test("un net non positif est rejeté explicitement", () => {
  const result = compareQuotes([quote({ amountOutRaw: 100n, costs: { gasRaw: 100n } })]);
  assert.equal(result.best, null);
  assert.equal(result.unrankable[0]?.blocker, "NON_POSITIVE_NET");
});

test("les gardes de validation restent fail-closed", () => {
  assert.equal(normalizeQuote(quote({ amountInRaw: 0n })).blocker, "INVALID_AMOUNT_IN");
  assert.equal(normalizeQuote(quote({ amountOutRaw: 0n })).blocker, "INVALID_AMOUNT_OUT");
  assert.equal(normalizeQuote(quote({ slippageBps: 10_001 })).blocker, "INVALID_SLIPPAGE");
  assert.equal(normalizeQuote(quote({ steps: 0 })).blocker, "INVALID_STEPS");
  assert.equal(normalizeQuote(quote({ riskScore: 1.5 })).blocker, "INVALID_RISK");
  assert.equal(normalizeQuote(quote({ path: [] })).blocker, "MISSING_PATH");
  assert.equal(normalizeQuote(quote({ costs: { gasRaw: -1n } })).blocker, "NEGATIVE_COST");
});

test("la comparaison est déterministe et ne produit aucune transaction", () => {
  const a = quote({ routeId: "a", amountOutRaw: 1_000n });
  const b = quote({ routeId: "b", amountOutRaw: 1_000n, path: ["other"] });
  const first = compareQuotes([a, b]);
  const second = compareQuotes([b, a]);
  assert.deepEqual(
    first.ranked.map((r) => r.quote.routeId).sort(),
    second.ranked.map((r) => r.quote.routeId).sort(),
  );
  assert.equal("transaction" in (first.best ?? {}), false);
  assert.equal("signedTransaction" in (first.best ?? {}), false);
});

test("pathKey est stable et inclut la paire, les tokens et le chemin", () => {
  const item = quote({ path: ["x", "y"] });
  assert.deepEqual(JSON.parse(pathKey(item)), [1, 8453, item.fromToken, item.toToken, ["x", "y"]]);
  assert.equal(pathKey({ ...item, path: ["x", "y"] }), pathKey(item));
  assert.notEqual(pathKey({ ...item, path: ["y", "x"] }), pathKey(item));
});
