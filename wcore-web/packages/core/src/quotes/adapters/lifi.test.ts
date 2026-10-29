// Run: node --import tsx --test packages/core/src/quotes/adapters/lifi.test.ts
//
// Fixture ATTESTÉE PAR DOCUMENTATION : champs repris de l'exemple de réponse
// officiel LI.FI « Get a quote for a token transfer »
// (https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer, consulté
// 2026-10-18). Aucune donnée inventée : les valeurs absentes de la doc ne sont
// pas testées.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFI_CONTRACT_REFERENCE, mapLifiStep, slippageRatioToBps } from "./lifi.js";
import type { LifiStep } from "./lifi.js";
import { createQuoteControlPlane, createRegistry, normalizeQuote, providerEligibility } from "../index.js";
import type { ProviderContract, QuoteRequest, QuoteTelemetryEvent } from "../index.js";

// Exemple documenté (extrait exact) : xDAI -> MIVA sur chainId 100.
function documentedStep(overrides: Partial<LifiStep> = {}): LifiStep {
  return {
    id: "docstep",
    type: "swap",
    tool: "doc-tool",
    action: {
      fromChainId: 100,
      toChainId: 100,
      fromToken: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", symbol: "xDAI", decimals: 18, chainId: 100 },
      toToken: { address: "0x63e62989d9eb2d37dfdb1f93a22f063635b07d51", symbol: "MIVA", decimals: 18, chainId: 100 },
      fromAmount: "1000000000000000000",
      slippage: 0.003,
    },
    estimate: {
      fromAmount: "1000000000000000000",
      toAmount: "21922914496086353975",
      toAmountMin: "21265227061203763356",
      feeCosts: [],
      gasCosts: [
        {
          type: "SEND",
          amount: "252364000000000",
          amountUSD: "0.00",
          token: { address: "0x0000000000000000000000000000000000000000", symbol: "xDai", decimals: 18, chainId: 100 },
        },
      ],
    },
    ...overrides,
  };
}

test("l exemple documente se mappe fidelement", () => {
  const { quote, blocker } = mapLifiStep(documentedStep());
  assert.equal(blocker, null);
  assert.ok(quote);
  assert.equal(quote.amountInRaw, 1_000_000_000_000_000_000n);
  assert.equal(quote.amountOutRaw, 21_922_914_496_086_353_975n);
  assert.equal(quote.minAmountOutRaw, 21_265_227_061_203_763_356n);
  assert.equal(quote.fromChainId, 100);
  assert.equal(quote.toChainId, 100);
  assert.equal(quote.slippageBps, 30);
});

// Variantes synthétiques de frontière, distinctes de l'exemple documentaire.
for (const field of ["gasCosts", "feeCosts"] as const) {
  for (const amount of [undefined, "invalid", "-1"] as const) {
    test(`${field} montant ${String(amount)} : refus explicite, jamais zéro`, () => {
      const step = documentedStep();
      step.estimate![field] = [{ amount, included: true }];
      assert.deepEqual(mapLifiStep(step), {
        quote: null,
        blocker: "LIFI_COST_AMOUNT_UNPARSEABLE",
      });
    });
  }
  test(`${field} zéro explicite valide et montant positif conservé`, () => {
    const step = documentedStep();
    step.estimate!.gasCosts = [];
    step.estimate!.feeCosts = [];
    step.estimate![field] = [{ amount: "0", included: false }, { amount: "7", included: false }];
    const { quote, blocker } = mapLifiStep(step);
    assert.equal(blocker, null);
    assert.ok(quote);
    assert.equal(quote.costs[field === "gasCosts" ? "gasRaw" : "protocolFeeRaw"], 7n);
    assert.equal(quote.pathCompleteness, "INCOMPLETE");
    assert.equal(quote.riskScore, "UNKNOWN");
    assert.equal(quote.expiresAt, undefined);
  });
}

// Le schéma documentaire déclare `feeCosts`/`gasCosts` facultatifs : l'absence
// n'est PAS une preuve de zéro. Toute absence, nullité ou forme non-tableau
// reste un refus explicite de complétude, jamais un tableau vide implicite.
test("tableau de coûts absent : refus COMPLETENESS_UNKNOWN, jamais zéro implicite", () => {
  for (const field of ["feeCosts", "gasCosts"] as const) {
    const step = documentedStep();
    delete step.estimate![field];
    assert.deepEqual(mapLifiStep(step), {
      quote: null,
      blocker: "LIFI_COST_COMPLETENESS_UNKNOWN",
    });
  }
  const both = documentedStep();
  delete both.estimate!.feeCosts;
  delete both.estimate!.gasCosts;
  assert.deepEqual(mapLifiStep(both), {
    quote: null,
    blocker: "LIFI_COST_COMPLETENESS_UNKNOWN",
  });
});

test("tableau de coûts null ou mal typé : refus sans throw", () => {
  for (const field of ["feeCosts", "gasCosts"] as const) {
    for (const value of [null, "not-an-array", 42, {}, { 0: { amount: "0" } }] as unknown[]) {
      const step = documentedStep();
      step.estimate![field] = value as never;
      let result: ReturnType<typeof mapLifiStep> | undefined;
      assert.doesNotThrow(() => {
        result = mapLifiStep(step);
      }, `${field}=${JSON.stringify(value)} ne doit jamais lever`);
      assert.deepEqual(result, {
        quote: null,
        blocker: "LIFI_COST_COMPLETENESS_UNKNOWN",
      });
    }
  }
});

test("ligne de coût mal typée : refus de montant sans throw", () => {
  for (const field of ["feeCosts", "gasCosts"] as const) {
    for (const row of [null, "row", 7, [], undefined] as unknown[]) {
      const step = documentedStep();
      step.estimate![field] = [row] as never;
      let result: ReturnType<typeof mapLifiStep> | undefined;
      assert.doesNotThrow(() => {
        result = mapLifiStep(step);
      }, `${field} ligne ${JSON.stringify(row)} ne doit jamais lever`);
      assert.deepEqual(result, {
        quote: null,
        blocker: "LIFI_COST_AMOUNT_UNPARSEABLE",
      });
    }
  }
});

test("tableaux vides explicitement déclarés : zéro accepté comme fixture, jamais comme preuve LIVE", () => {
  const step = documentedStep();
  step.estimate!.feeCosts = [];
  step.estimate!.gasCosts = [];
  const { quote, blocker } = mapLifiStep(step);
  assert.equal(blocker, null);
  assert.ok(quote);
  assert.equal(quote.costs.gasRaw, 0n);
  assert.equal(quote.costs.protocolFeeRaw, 0n);
  assert.equal(quote.feePolicy, "ADDITIONAL");
  assert.equal(quote.costUnit, "OUTPUT_RAW");
});

test("doublons de coûts : sommés tels que déclarés, aucune déduplication inventée", () => {
  const step = documentedStep();
  const miva = { address: "0x63e62989d9eb2d37dfdb1f93a22f063635b07d51", symbol: "MIVA", decimals: 18, chainId: 100 };
  const native = { address: "0x0000000000000000000000000000000000000000", symbol: "xDai", decimals: 18, chainId: 100 };
  step.estimate!.feeCosts = [
    { amount: "100", included: false, token: miva },
    { amount: "100", included: false, token: miva },
  ];
  step.estimate!.gasCosts = [
    { amount: "5", included: false, token: native },
    { amount: "5", included: false, token: native },
  ];
  const { quote, blocker } = mapLifiStep(step);
  assert.equal(blocker, null);
  assert.ok(quote);
  // Aucune inférence de doublon : deux lignes identiques restent deux coûts.
  assert.equal(quote.costs.protocolFeeRaw, 200n);
  assert.equal(quote.costs.gasRaw, 10n);
  assert.equal(quote.amountOutBasis, "GROSS");
});

test("slippage ratio vers points de base", () => {
  assert.equal(slippageRatioToBps(0.003), 30);
  assert.equal(slippageRatioToBps(0.01), 100);
  assert.equal(slippageRatioToBps(undefined), 0);
});

test("le gaz natif n est jamais assimile a OUTPUT_RAW", () => {
  const { quote } = mapLifiStep(documentedStep());
  assert.ok(quote);
  // Le gas est en token natif (0x0000...), distinct de l input declaré et de
  // l output : l unite reste inconnue, jamais supposée égale à la sortie.
  assert.equal(quote.costUnit, "UNKNOWN");
  const normalized = normalizeQuote(quote, { now: 1000 });
  assert.equal(normalized.comparable, false);
  assert.equal(normalized.blocker, "COST_UNIT_NOT_NORMALIZED");
});

test("transactionRequest est ignore, aucune transaction produite", () => {
  const step = { ...documentedStep(), transactionRequest: { to: "0xdead", data: "0xabcdef", value: "0x0" } } as unknown as LifiStep;
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  const record = quote as unknown as Record<string, unknown>;
  assert.equal("transaction" in record, false);
  assert.equal("transactionRequest" in record, false);
  assert.equal("signedTransaction" in record, false);
});

test("frais additionnels declares : politique ADDITIONAL", () => {
  const step = documentedStep();
  step.estimate!.feeCosts = [{ amount: "100", included: false, token: { address: "0x63e62989d9eb2d37dfdb1f93a22f063635b07d51", symbol: "MIVA", decimals: 18, chainId: 100 } }];
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.feePolicy, "ADDITIONAL");
  assert.equal(quote.amountOutBasis, "GROSS");
});

test("frais deja inclus : jamais soustraits une seconde fois", () => {
  const step = documentedStep();
  step.estimate!.gasCosts = [];
  step.includedSteps = [{ tool: "oneinch" }];
  step.estimate!.feeCosts = [{ amount: "100", included: true, token: { address: "0x63e62989d9eb2d37dfdb1f93a22f063635b07d51", symbol: "MIVA", decimals: 18, chainId: 100 } }];
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.feePolicy, "INCLUDED");
  assert.equal(quote.amountOutBasis, "NET");
  const normalized = normalizeQuote(quote, { now: 1000 });
  // Le mapping des frais est net, mais les tools ne prouvent pas les pools.
  assert.equal(normalized.comparable, false);
  assert.equal(normalized.blocker, "PATH_INCOMPLETE");
});

test("frais mixtes non documentes : politique UNDOCUMENTED", () => {
  const step = documentedStep();
  step.estimate!.gasCosts = [];
  const miva = { address: "0x63e62989d9eb2d37dfdb1f93a22f063635b07d51", symbol: "MIVA", decimals: 18, chainId: 100 };
  step.estimate!.feeCosts = [
    { amount: "100", included: true, token: miva },
    { amount: "200", included: false, token: miva },
  ];
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.feePolicy, "UNDOCUMENTED");
  assert.equal(quote.costUnit, "OUTPUT_RAW");
  assert.equal(normalizeQuote(quote, { now: 1000 }).blocker, "FEES_UNDOCUMENTED");
});

test("chemin incomplet : refuse, jamais fusionne", () => {
  const step = documentedStep();
  step.estimate!.gasCosts = [];
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.pathCompleteness, "INCOMPLETE");
  assert.equal(normalizeQuote(quote, { now: 1000 }).blocker, "PATH_INCOMPLETE");
});

test("includedSteps mal formé ou non-tableau ne lève jamais, chemin reste INCOMPLETE", () => {
  const cases: unknown[] = [[null], "not-an-array", 42, [undefined], [{ tool: 7 }], [{}, null]];
  for (const value of cases) {
    const step = documentedStep();
    step.includedSteps = value as LifiStep["includedSteps"];
    assert.doesNotThrow(() => mapLifiStep(step), `case ${JSON.stringify(value)}`);
    const { quote } = mapLifiStep(step);
    assert.ok(quote, `case ${JSON.stringify(value)}`);
    assert.equal(quote.pathCompleteness, "INCOMPLETE");
    assert.ok(quote.path.every((entry) => typeof entry === "string"));
  }
});

test("adresse de token non textuelle ne lève pas et ne devient jamais OUTPUT_RAW", () => {
  const step = documentedStep();
  step.estimate!.feeCosts = [{ amount: "1", token: { address: 123 as unknown as string } }];
  step.estimate!.gasCosts = [];
  assert.doesNotThrow(() => mapLifiStep(step));
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.costUnit, "UNKNOWN");
  assert.equal(quote.pathCompleteness, "INCOMPLETE");
});

test("includedSteps expose des outils, pas un chemin de pools attesté", () => {
  const step = documentedStep();
  step.estimate!.gasCosts = [];
  step.includedSteps = [{ tool: "oneinch" }, { tool: "relay" }];
  const { quote } = mapLifiStep(step);
  assert.ok(quote);
  assert.equal(quote.pathCompleteness, "INCOMPLETE");
  assert.equal(normalizeQuote(quote).blocker, "PATH_INCOMPLETE");
  assert.deepEqual(quote.path, ["oneinch", "relay"]);
  assert.equal(quote.steps, 2);
});

test("contrat de reference LI.FI : validation fail-closed, non enregistrable actif", () => {
  assert.equal(LIFI_CONTRACT_REFERENCE.activation, "INACTIVE_UNVERIFIED");
  const registry = createRegistry([LIFI_CONTRACT_REFERENCE]);
  assert.equal(registry.contracts.has("lifi"), false);
  assert.ok(registry.invalid[0]?.blockers.includes("FEES_UNDOCUMENTED"));
  assert.ok(registry.invalid[0]?.blockers.includes("COST_UNIT_NOT_NORMALIZED"));
});

test("contrat LI.FI inactif mais bien forme : refus et zero transport", async () => {
  const inactiveLifi: ProviderContract = {
    ...LIFI_CONTRACT_REFERENCE,
    fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" },
    chains: [
      { chainId: 100, assets: ["xDAI", "MIVA"], routable: true, source: "DOCUMENTED" },
    ],
    validitySeconds: undefined,
  };
  const registry = createRegistry([inactiveLifi]);
  assert.equal(registry.contracts.has("lifi"), true, "le contrat bien forme est enregistre mais inactif");

  const req: QuoteRequest = { fromChainId: 100, toChainId: 100, fromAsset: "xDAI", toAsset: "MIVA", amountInRaw: 1000n, maxSlippageBps: 100, minAmountOutRaw: 0n, route: {}, preferences: {}, feePolicy: "ADDITIONAL", providerParams: {} };
  const denied = providerEligibility(registry, "lifi", req);
  assert.equal(denied.eligible, false);
  assert.equal(denied.blocker, "PROVIDER_INACTIVE_UNVERIFIED");

  let calls = 0;
  const events: QuoteTelemetryEvent[] = [];
  const plane = createQuoteControlPlane({
    registry,
    budget: { capacity: 10 },
    quotaPerProvider: 10,
    cacheTtlMs: 30_000,
    breaker: { failureThreshold: 2, cooldownMs: 5_000 },
    telemetry: { record: (e) => { events.push(e); } },
    transport: { fetchQuote: async () => { calls += 1; return documentedStep(); } },
    clock: { now: () => 1000 },
  });
  const admission = await plane.request("lifi", req);
  assert.equal(admission.outcome, "REFUSED_PROVIDER");
  assert.equal(calls, 0, "aucun transport declenche");
});

test("contrat active-equivalent sans TTL : refus par validite inconnue", () => {
  const activeLifi: ProviderContract = {
    ...LIFI_CONTRACT_REFERENCE,
    activation: "ACTIVE",
    fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" },
    chains: [{ chainId: 100, assets: ["xDAI", "MIVA"], routable: true, source: "DOCUMENTED" }],
    validitySeconds: undefined,
  };
  const registry = createRegistry([activeLifi]);
  const req: QuoteRequest = { fromChainId: 100, toChainId: 100, fromAsset: "xDAI", toAsset: "MIVA", amountInRaw: 1000n, maxSlippageBps: 100, minAmountOutRaw: 0n, route: {}, preferences: {}, feePolicy: "ADDITIONAL", providerParams: {} };
  assert.equal(providerEligibility(registry, "lifi", req).blocker, "PROVIDER_VALIDITY_UNKNOWN");
});
