// Run: node --import tsx --test packages/core/src/quotes/registry.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANDIDATE_PROVIDERS,
  DEFAULT_PROVIDER_CONTRACTS,
  compareQuotes,
  createRegistry,
  eligibleProviders,
  normalizeQuote,
  providerEligibility,
  validateProviderContract,
} from "./index.js";
import type { ProviderContract, QuoteRequest } from "./index.js";

function contract(overrides: Partial<ProviderContract> = {}): ProviderContract {
  return {
    providerId: "test-provider",
    displayName: "Test Provider",
    quoteCapability: "KNOWN",
    availability: "FIXTURE",
    activation: "ACTIVE",
    chains: [
      { chainId: 1, assets: ["USDC", "WETH"], routable: true, source: "FIXTURE" },
      { chainId: 8453, assets: ["USDC", "WETH"], routable: true, source: "FIXTURE" },
    ],
    fees: { policy: "ADDITIONAL", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" },
    validitySeconds: 60,
    steps: [{ kind: "swap", chainId: 1, from: "USDC", to: "WETH" }],
    signatureFree: true,
    ...overrides,
  };
}

const REQ: QuoteRequest = { fromChainId: 1, toChainId: 8453, fromAsset: "USDC", toAsset: "WETH", amountInRaw: 1000n, maxSlippageBps: 100, minAmountOutRaw: 0n, route: {}, preferences: {}, feePolicy: "ADDITIONAL", providerParams: {} };

test("le registre par defaut n active aucun provider", () => {
  const registry = createRegistry(DEFAULT_PROVIDER_CONTRACTS);
  assert.equal(registry.contracts.size, 0);
  assert.equal(eligibleProviders(registry, REQ).length, 0);
  assert.ok(CANDIDATE_PROVIDERS.includes("lifi"), "lifi reste un candidat inerte");
});

test("provider non enregistre : refuse", () => {
  const registry = createRegistry([contract()]);
  assert.equal(providerEligibility(registry, "ghost", REQ).blocker, "PROVIDER_NOT_REGISTERED");
});

test("capacites UNKNOWN : refuse", () => {
  const registry = createRegistry([contract({ quoteCapability: "UNKNOWN" })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "PROVIDER_CAPABILITIES_UNKNOWN");
});

test("activation INACTIVE_UNVERIFIED : refuse", () => {
  const registry = createRegistry([contract({ activation: "INACTIVE_UNVERIFIED" })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "PROVIDER_INACTIVE_UNVERIFIED");
});

test("disponibilite UNVERIFIED : refuse", () => {
  const registry = createRegistry([contract({ availability: "UNVERIFIED" })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "PROVIDER_AVAILABILITY_UNVERIFIED");
});

test("chaine annoncee mais non routable : refuse", () => {
  const registry = createRegistry([contract({
    chains: [
      { chainId: 1, assets: ["USDC"], routable: true, source: "FIXTURE" },
      { chainId: 8453, assets: ["WETH"], routable: false, source: "FIXTURE" },
    ],
  })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "CHAIN_DECLARED_NOT_ROUTABLE");
});

test("chaine non declaree : refuse", () => {
  const registry = createRegistry([contract()]);
  const other = { ...REQ, toChainId: 10 };
  assert.equal(providerEligibility(registry, "test-provider", other).blocker, "CHAIN_NOT_DECLARED");
});

test("token de sortie non declare : refuse", () => {
  const registry = createRegistry([contract()]);
  const req = { ...REQ, toAsset: "DAI" };
  assert.equal(providerEligibility(registry, "test-provider", req).blocker, "OUTPUT_ASSET_NOT_DECLARED");
});

test("token d entree non declare : refuse", () => {
  const registry = createRegistry([contract()]);
  const req = { ...REQ, fromAsset: "DAI" };
  assert.equal(providerEligibility(registry, "test-provider", req).blocker, "INPUT_ASSET_NOT_DECLARED");
});

test("contrat avec execution/signature : refuse", () => {
  const registry = createRegistry([contract({ signatureFree: false })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "PROVIDER_EXECUTION_FORBIDDEN");
});

test("validite inconnue : refuse", () => {
  const registry = createRegistry([contract({ validitySeconds: undefined })]);
  assert.equal(providerEligibility(registry, "test-provider", REQ).blocker, "PROVIDER_VALIDITY_UNKNOWN");
});

test("unite de cout incompatible : contrat invalide", () => {
  assert.ok(validateProviderContract(contract({ fees: { policy: "ADDITIONAL", costUnit: "INPUT_RAW", amountOutBasis: "GROSS" } }))
    .includes("COST_UNIT_NOT_NORMALIZED"));
});

test("frais non documentes : contrat invalide", () => {
  assert.ok(validateProviderContract(contract({ fees: { policy: "UNDOCUMENTED", costUnit: "OUTPUT_RAW", amountOutBasis: "GROSS" } }))
    .includes("FEES_UNDOCUMENTED"));
});

test("identite non stable : contrat invalide", () => {
  assert.ok(validateProviderContract(contract({ providerId: "Test Provider!" })).includes("STABLE_IDENTITY_MISSING"));
});

test("identite dupliquee : second contrat invalide, premier conserve", () => {
  const registry = createRegistry([contract(), contract()]);
  assert.equal(registry.contracts.size, 1);
  assert.equal(registry.invalid.length, 1);
  assert.ok(registry.invalid[0]?.blockers.includes("DUPLICATE_PROVIDER_ID"));
});

test("frais inclus : jamais soustraits deux fois", () => {
  const quote = {
    provider: "test-provider",
    routeId: "a",
    fromChainId: 1,
    toChainId: 8453,
    fromToken: "USDC",
    toToken: "WETH",
    amountInRaw: 1_000n,
    amountOutRaw: 1_000n,
    amountOutBasis: "NET" as const,
    costs: { gasRaw: 10n },
    feePolicy: "INCLUDED" as const,
    costUnit: "OUTPUT_RAW" as const,
    slippageBps: 10,
    estimatedDurationSec: 20,
    steps: 1,
    path: ["p"],
    riskScore: 0.1,
  };
  assert.equal(normalizeQuote(quote, { now: 0 }).netReceivedRaw, 1_000n);
});

test("frais additionnels : coûts deduits une fois", () => {
  const quote = {
    provider: "test-provider",
    routeId: "a",
    fromChainId: 1,
    toChainId: 8453,
    fromToken: "USDC",
    toToken: "WETH",
    amountInRaw: 1_000n,
    amountOutRaw: 1_000n,
    amountOutBasis: "GROSS" as const,
    costs: { gasRaw: 10n, bridgeFeeRaw: 5n },
    feePolicy: "ADDITIONAL" as const,
    costUnit: "OUTPUT_RAW" as const,
    slippageBps: 10,
    estimatedDurationSec: 20,
    steps: 1,
    path: ["p"],
    riskScore: 0.1,
  };
  assert.equal(normalizeQuote(quote, { now: 0 }).netReceivedRaw, 985n);
});

test("deux providers, meme chemin : dedup, meilleur net conserve", () => {
  const shared = { path: ["hop"], fromChainId: 1, toChainId: 8453, fromToken: "USDC", toToken: "WETH" };
  const base = {
    amountInRaw: 1_000n,
    costs: {},
    costUnit: "OUTPUT_RAW" as const,
    feePolicy: "ADDITIONAL" as const,
    amountOutBasis: "GROSS" as const,
    slippageBps: 10,
    estimatedDurationSec: 20,
    steps: 1,
    riskScore: 0.1,
  };
  const a = { ...shared, ...base, provider: "prov-a", routeId: "a", amountOutRaw: 1_000n };
  const b = { ...shared, ...base, provider: "prov-b", routeId: "b", amountOutRaw: 990n };
  const result = compareQuotes([a, b], { now: 0 });
  assert.equal(result.ranked.length, 1);
  assert.equal(result.best?.quote.routeId, "a");
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0]?.quote.routeId, "b");
});

test("meme chemin, conditions economiques differentes : le meilleur net reste retenu", () => {
  const shared = { path: ["hop"], fromChainId: 1, toChainId: 8453, fromToken: "USDC", toToken: "WETH", provider: "p", amountInRaw: 1_000n, costUnit: "OUTPUT_RAW" as const, feePolicy: "ADDITIONAL" as const, amountOutBasis: "GROSS" as const, slippageBps: 10, estimatedDurationSec: 20, steps: 1, riskScore: 0.1 };
  const expensive = { ...shared, routeId: "expensive", amountOutRaw: 1_000n, costs: { gasRaw: 50n } };
  const cheap = { ...shared, routeId: "cheap", amountOutRaw: 990n, costs: { gasRaw: 1n } };
  const result = compareQuotes([expensive, cheap], { now: 0 });
  assert.equal(result.ranked.length, 1);
  assert.equal(result.best?.quote.routeId, "cheap");
  assert.equal(result.best?.netReceivedRaw, 989n);
});

test("echec d un provider sans effet sur les autres", () => {
  const good = contract({ providerId: "good" });
  const broken = contract({ providerId: "broken", quoteCapability: "UNKNOWN" });
  const registry = createRegistry([good, broken]);
  const results = eligibleProviders(registry, REQ);
  const byId = Object.fromEntries(results.map((r) => [r.providerId, r]));
  assert.equal(byId.good?.eligible, true);
  assert.equal(byId.broken?.eligible, false);
  assert.equal(byId.broken?.blocker, "PROVIDER_CAPABILITIES_UNKNOWN");
  assert.equal(registry.invalid.length, 0, "un provider desactive n invalide pas le registre");
});
