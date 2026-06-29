// Run: node --import tsx --test packages/core/src/pricing/sources/source-adapters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CoinGeckoPriceSource } from "./coingecko.js";
import { DefiLlamaPriceSource } from "./defillama.js";
import { DexScreenerPriceSource } from "./dexscreener.js";
import { GeckoTerminalPriceSource } from "./geckoterminal.js";
import { JupiterPriceSource } from "./jupiter.js";
import { RealTPriceSource } from "./realt.js";
import { MemoryPricingCache } from "../types.js";
import type { PricingToken, SourcePrice } from "../types.js";
import { MemoryCacheStore } from "../../cache/memory-cache.js";
import type { ChainConfig } from "../../types.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const evmChain: ChainConfig = {
  key: "BASE",
  vm: "EVM",
  CHAIN: {
    CHAIN_ID: 8453,
    DEX_SLUG: "base",
    GT_NETWORK: "base",
    LLAMA_CHAIN_SLUG: "base",
  },
};

const gnosisChain: ChainConfig = {
  key: "GNOSIS",
  vm: "EVM",
  CHAIN: {
    CHAIN_ID: 100,
    DEX_SLUG: "gnosis",
    GT_NETWORK: "xdai",
    LLAMA_CHAIN_SLUG: "gnosis",
  },
};

const svmChain: ChainConfig = {
  key: "SOLANA",
  vm: "SVM",
  CHAIN: {
    DEX_SLUG: "solana",
    GT_NETWORK: "solana",
  },
};

function token(chain = evmChain, key = CONTRACT): PricingToken {
  return {
    key,
    contract: key,
    symbol: "TEST",
    chain,
  };
}

function realtToken(contract: string, symbol: string, name: string): PricingToken {
  return {
    key: contract,
    contract,
    symbol,
    name,
    chain: gnosisChain,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchMock(handler: (url: string) => unknown | Response): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const value = handler(url);
    return value instanceof Response ? value : jsonResponse(value);
  }) as typeof fetch;
}

test("DefiLlama contract source ignores confidence below 0.6", async () => {
  const source = new DefiLlamaPriceSource(
    fetchMock(() => ({
      coins: {
        [`base:${CONTRACT}`]: { price: 10, confidence: 0.59 },
      },
    })),
  );

  const result = await source.getTokenPriceUsd(token());

  assert.equal(result, null);
});

test("DefiLlama contract source accepts confidence at 0.6", async () => {
  const source = new DefiLlamaPriceSource(
    fetchMock(() => ({
      coins: {
        [`base:${CONTRACT}`]: { price: 10, confidence: 0.6 },
      },
    })),
  );

  const result = await source.getTokenPriceUsd(token());

  assert.deepEqual(result, { priceUsd: 10, source: "llama-coins" });
});

test("DexScreener picks highest liquidity pair and infers quote token price", async () => {
  const source = new DexScreenerPriceSource(
    fetchMock(() => [
      {
        baseToken: { address: OTHER, symbol: "WETH", name: "Wrapped Ether" },
        quoteToken: { address: CONTRACT, symbol: "QUOTE", name: "Quote token" },
        priceUsd: "100",
        priceNative: "2",
        liquidity: { usd: "5000" },
      },
      {
        baseToken: { address: CONTRACT, symbol: "LOW", name: "Low token" },
        quoteToken: { address: OTHER },
        priceUsd: "999",
        priceNative: "1",
        liquidity: { usd: "49" },
      },
    ]),
  );

  const result = await source.getTokenPriceUsd(token());

  assert.deepEqual(result, {
    priceUsd: 50,
    source: "dex",
    symbol: "QUOTE",
    name: "Quote token",
  });
});

test("GeckoTerminal batchTokenPrices fetches multiple tokens in one call", async () => {
  const cache = new MemoryPricingCache();
  const CT1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const CT2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const CT3 = "0xcccccccccccccccccccccccccccccccccccccccc";
  const source = new GeckoTerminalPriceSource(
    cache,
    fetchMock((url) => {
      if (url.includes("/simple/networks/base/token_price/")) {
        return {
          data: {
            attributes: {
              token_prices: {
                [CT1.toLowerCase()]: "1.5",
                [CT2.toLowerCase()]: "3.2",
                [CT3.toLowerCase()]: null,
              },
            },
          },
        };
      }
      throw new Error(`unexpected url ${url}`);
    }),
  );

  const prices = await source.batchTokenPrices("base", [CT1, CT2, CT3]);

  assert.deepEqual(prices, new Map([[CT1.toLowerCase(), 1.5], [CT2.toLowerCase(), 3.2]]));
});

test("GeckoTerminal batchTokenPrices chunks large token lists", async () => {
  const cache = new MemoryPricingCache();
  const contracts = Array.from({ length: 65 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`);
  const seenBatchSizes: number[] = [];
  const source = new GeckoTerminalPriceSource(
    cache,
    fetchMock((url) => {
      const list = String(url).split("/token_price/")[1]?.split("?")[0]?.split(",") ?? [];
      seenBatchSizes.push(list.length);
      return {
        data: {
          attributes: {
            token_prices: Object.fromEntries(list.map((contract, i) => [contract.toLowerCase(), String(i + 1)])),
          },
        },
      };
    }),
  );

  const prices = await source.batchTokenPrices("base", contracts);

  assert.deepEqual(seenBatchSizes, [30, 30, 5]);
  assert.equal(prices.size, 65);
});

test("GeckoTerminal Try3 scans pools and keeps the highest reserve price", async () => {
  const cache = new MemoryPricingCache();
  const source = new GeckoTerminalPriceSource(
    cache,
    fetchMock((url) => {
      if (url.includes("/simple/networks/base/token_price/")) {
        return { data: { attributes: { token_prices: { [CONTRACT]: null } } } };
      }
      if (url.includes(`/networks/base/tokens/${CONTRACT}/pools`)) {
        return {
          data: [
            {
              attributes: { base_token_price_usd: "1", reserve_in_usd: "100" },
              relationships: { base_token: { data: { id: `base_${CONTRACT}` } } },
            },
            {
              attributes: { base_token_price_usd: "2", reserve_in_usd: "500" },
              relationships: { base_token: { data: { id: `base_${CONTRACT}` } } },
            },
          ],
        };
      }
      if (url.includes(`/networks/base/tokens/${CONTRACT}`)) {
        return { data: { attributes: { price_usd: null } } };
      }
      throw new Error(`unexpected url ${url}`);
    }),
  );

  const result = await source.getTokenPriceUsd(token());

  assert.deepEqual(result, { priceUsd: 2, source: "gt" });
  assert.equal(await cache.getMarker(`base:${CONTRACT}`), "NEED_TRY3");
});

test("Jupiter only prices SVM mints", async () => {
  const mint = "So11111111111111111111111111111111111111112";
  let calls = 0;
  const source = new JupiterPriceSource(
    fetchMock(() => {
      calls++;
      return { data: { [mint]: { price: "123", mintSymbol: "SOL" } } };
    }),
  );

  assert.equal(await source.getTokenPriceUsd(token(evmChain, mint)), null);
  const result = await source.getTokenPriceUsd(token(svmChain, mint));

  assert.deepEqual(result, { priceUsd: 123, source: "jupiter", symbol: "SOL" });
  assert.equal(calls, 1);
});

test("CoinGecko simple price parses a verified id", async () => {
  const source = new CoinGeckoPriceSource(
    fetchMock(() => ({
      ethereum: { usd: 3500 },
    })),
  );

  const result = (await source.getNativePriceUsd(token(), "ethereum")) as SourcePrice;

  assert.equal(result.priceUsd, 3500);
  assert.equal(result.source, "coingecko");
});

test("RealT source serves stale Redis registry when API refresh fails", async () => {
  const contract = "0x7af2c0df2789c2620794aeb24b3019fc350c369d";
  const cache = new MemoryCacheStore();
  await cache.set("realt:registry:v2", {
    ts: Date.now() - 7 * 60 * 60 * 1000,
    entries: [[contract, { priceUsd: 50.18, currency: "USD", symbol: "REALTOKEN-PA-SE-VERVANA-T1v2-PLAYA-VENAO-LS" }]],
  });

  let calls = 0;
  const source = new RealTPriceSource(cache, fetchMock(() => {
    calls++;
    return new Response("blocked", { status: 403 });
  }));

  const result = await source.getTokenPriceUsd(token(gnosisChain, contract));

  assert.deepEqual(result, { priceUsd: 50.18, source: "realt", symbol: "REALTOKEN-PA-SE-VERVANA-T1v2-PLAYA-VENAO-LS", name: undefined });
  assert.equal(await source.isKnownRealTContract(token(gnosisChain, contract)), true);
  assert.equal(calls, 1);
});

test("RealT source prices a token from the official WooCommerce product API", async () => {
  const contract = "0x7af2c0df2789c2620794aeb24b3019fc350c369d";
  const source = new RealTPriceSource(new MemoryCacheStore(), fetchMock((url) => {
    if (url === "https://api.realtoken.community/v1/token") return new Response("gone", { status: 404 });
    if (url.includes("/wp-json/wc/store/v1/products") && url.includes("VERVANA")) {
      return [{
        id: 949273,
        name: "Vervana T1v2, Playa Venao, Los Santos, Panama",
        prices: { price: "50180000", currency_code: "USD", currency_minor_unit: 6 },
      }];
    }
    throw new Error(`unexpected url ${url}`);
  }));

  const result = await source.getTokenPriceUsd(realtToken(
    contract,
    "REALTOKEN-PA-SE-VERVANA-T1v2-PLAYA-VENAO-LS",
    "RealToken Vervana T1v2 Playa Venao",
  ));

  assert.deepEqual(result, { priceUsd: 50.18, source: "realt", symbol: "REALTOKEN-PA-SE-VERVANA-T1v2-PLAYA-VENAO-LS", name: "Vervana T1v2, Playa Venao, Los Santos, Panama" });
});

test("RealT source refuses ambiguous WooCommerce product matches", async () => {
  const contract = "0xd358021be065bda24fd1b713b4f9377696b04a3b";
  const source = new RealTPriceSource(new MemoryCacheStore(), fetchMock((url) => {
    if (url === "https://api.realtoken.community/v1/token") return new Response("gone", { status: 404 });
    if (url.includes("/wp-json/wc/store/v1/products") && url.includes("11222")) {
      return [
        { id: 1, name: "11222 E 7 Mile Rd, Detroit, MI 48234", prices: { price: "50460000", currency_code: "USD", currency_minor_unit: 6 } },
        { id: 2, name: "11222 E 7 Mile Rd, Detroit, MI Duplicate", prices: { price: "99990000", currency_code: "USD", currency_minor_unit: 6 } },
      ];
    }
    throw new Error(`unexpected url ${url}`);
  }));

  const result = await source.getTokenPriceUsd(realtToken(
    contract,
    "REALTOKEN-S-11222-E-7-MILE-RD-DETROIT-MI",
    "RealToken 11222 E 7 Mile Rd Detroit MI",
  ));

  assert.equal(result, null);
});
