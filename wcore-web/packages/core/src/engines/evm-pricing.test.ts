import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryPricingCache, type PricingSourceSet, type PricingToken } from "../pricing/index.js";
import { roundUnitPrice } from "../pricing/rounding.js";
import type { ChainConfig } from "../types.js";
import type { DiscoveredToken } from "../tokens/index.js";
import { priceNative, priceToken } from "./evm-pricing.js";

test("roundUnitPrice rounds beyond 12 decimal places", () => {
  assert.equal(roundUnitPrice(0.1234567890126), 0.123456789013);
});

test("roundUnitPrice preserves a finite value when scaling would overflow", () => {
  const result = roundUnitPrice(Number.MAX_VALUE);

  assert.equal(result, Number.MAX_VALUE);
  assert.equal(Number.isFinite(result), true);
});

test("priceNative preserves a sub-cent CAMP unit price", async () => {
  const sources: PricingSourceSet = {
    defillama: {
      getTokenPriceUsd: async () => null,
      getNativePriceUsd: async () => 0.000456763,
    },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const chain = {
    key: "CAMP",
    CHAIN: {
      NAME: "Camp Network",
      NATIVE_SYMBOL: "CAMP",
      NATIVE_NAME: "Camp",
      NATIVE_DECIMALS: 18,
    },
  } as ChainConfig;

  const result = await priceNative(
    chain,
    10_000n * 10n ** 18n,
    1,
    sources,
    new MemoryPricingCache(),
    [],
  );

  assert.equal(result.priceEur, 0.000456763);
  assert.equal(result.valueEur, 4.57);
});

test("registry EUR stablecoins bypass external pricing at one euro", async () => {
  let pricingCalls = 0;
  const miss = async () => { pricingCalls += 1; return null; };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: miss, getNativePriceUsd: miss },
    dexscreener: { getTokenPriceUsd: miss },
    geckoterminal: { getTokenPriceUsd: miss },
    coingecko: { getNativePriceUsd: miss, getTokenPriceUsd: miss },
    jupiter: { getTokenPriceUsd: miss },
    onchainV3: { getTokenPriceUsd: miss },
  };
  const chain = {
    key: "ETHEREUM",
    CHAIN: { NAME: "Ethereum", CHAIN_ID: 1, NATIVE_SYMBOL: "ETH", NATIVE_NAME: "Ether", NATIVE_DECIMALS: 18 },
  } as ChainConfig;

  for (const [index, symbol] of ["EURC", "EURS", "EURE"].entries()) {
    const known = {
      contract: `0x${String(index + 1).padStart(40, "0")}`,
      symbol,
      name: symbol,
      decimals: 18,
      source: "registry",
    } as DiscoveredToken;
    const result = await priceToken(chain, known, 2, 0.86, sources, new MemoryPricingCache(), undefined, []);
    assert.equal(result.priceEur, 1, symbol);
    assert.equal(result.valueEur, 2, symbol);
  }

  assert.equal(pricingCalls, 0, "known EUR stables must not call external pricing sources");
});

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
