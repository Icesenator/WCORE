import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryPricingCache, type PricingSourceSet, type PricingToken } from "../pricing/index.js";
import type { ChainConfig } from "../types.js";
import type { DiscoveredToken } from "../tokens/index.js";
import { priceToken } from "./evm-pricing.js";

test("priceToken prices and displays a DeFi collateral by its asset contract", async () => {
  const comet = "0xe36a30d249f7761327fd973001a32010b521b6fd";
  const asset = "0x2222222222222222222222222222222222222222";
  let pricedContract = "";
  const sources: PricingSourceSet = {
    defillama: {
      getTokenPriceUsd: async (token: PricingToken) => {
        pricedContract = token.contract;
        return 2;
      },
      getNativePriceUsd: async () => null,
    },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const chain = {
    key: "OPTIMISM",
    CHAIN: { NAME: "Optimism", DEX_SLUG: "optimism" },
  } as ChainConfig;
  const collateral = {
    contract: comet,
    pricingContract: asset,
    symbol: "Comp USDC",
    name: "Compound V3 USDC Collateral",
    decimals: 6,
    source: "registry",
    balanceSelector: "0x5c2549ee",
    balanceSelectorExtraArgs: [`0x${asset.slice(2).padStart(64, "0")}`],
  } as DiscoveredToken & { pricingContract: string };

  const result = await priceToken(chain, collateral, 10, 1, sources, new MemoryPricingCache(), undefined, []);

  assert.equal(pricedContract, asset);
  assert.equal(result.contract, asset);
  assert.equal(result.priceEur, 2);
  assert.equal(result.valueEur, 20);
});

test("priceToken leaves mirrored DeFi positions for API post-processing without NO_PRICE errors", async () => {
  let pricingCalls = 0;
  const sources: PricingSourceSet = {
    defillama: {
      getTokenPriceUsd: async () => { pricingCalls++; return null; },
      getNativePriceUsd: async () => null,
    },
    dexscreener: { getTokenPriceUsd: async () => { pricingCalls++; return null; } },
    geckoterminal: { getTokenPriceUsd: async () => { pricingCalls++; return null; } },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => { pricingCalls++; return null; } },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const chain = { key: "OPTIMISM", CHAIN: { NAME: "Optimism" } } as ChainConfig;
  const debt: DiscoveredToken = {
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    symbol: "Comp Borrow",
    name: "Compound V3 Borrowed",
    decimals: 18,
    source: "registry",
    defi: {
      protocol: "compound-v3",
      type: "lending_debt",
      underlying: "native",
      liquidityStatus: "flex",
      confidence: "high",
      pricing: { mode: "mirror_native", sign: "debt" },
    },
  };
  const errors: string[] = [];

  const result = await priceToken(chain, debt, 1, 1, sources, new MemoryPricingCache(), undefined, errors);

  assert.equal(pricingCalls, 0);
  assert.deepEqual(errors, []);
  assert.equal(result.priceEur, null);
  assert.equal(result.valueEur, null);
});

test("priceToken does not degrade a scan when a long-tail token has no market price", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const chain = { key: "OPTIMISM", CHAIN: { NAME: "Optimism" } } as ChainConfig;
  const token: DiscoveredToken = {
    contract: "0x1111111111111111111111111111111111111111",
    symbol: "NFT",
    name: "Long-tail NFT",
    decimals: 0,
  };
  const errors: string[] = [];

  const result = await priceToken(chain, token, 1, 1, sources, new MemoryPricingCache(), undefined, errors);

  assert.equal(result.priceEur, null);
  assert.deepEqual(errors, []);
});
