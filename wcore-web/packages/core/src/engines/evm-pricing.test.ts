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
