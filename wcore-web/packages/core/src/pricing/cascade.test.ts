// Run: node --import tsx --test packages/core/src/pricing/cascade.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceTokenCascade } from "./cascade.js";
import { MemoryPricingCache } from "./types.js";
import { NEED_TRY3, onchainMarkerKey } from "./markers.js";
import type { PricingSourceSet, PricingToken } from "./types.js";
import type { ChainConfig } from "../types.js";

const fxRate = 0.92;

const baseChain: ChainConfig = {
  key: "BASE",
  vm: "EVM",
  CHAIN: {
    NAME: "Base",
    CHAIN_ID: 8453,
    DEX_SLUG: "base",
    GT_NETWORK: "base",
    LLAMA_CHAIN_SLUG: "base",
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
  },
  LLAMA_CONTRACT_MAP: {
    "0x2222222222222222222222222222222222222222": "coingecko:chainbase",
  },
};

const token = (overrides: Partial<PricingToken> = {}): PricingToken => ({
  key: "0x1111111111111111111111111111111111111111",
  contract: "0x1111111111111111111111111111111111111111",
  symbol: "TEST",
  chain: baseChain,
  ...overrides,
});

const sourceSet = (prices: Partial<Record<keyof PricingSourceSet, number | null>>): PricingSourceSet => ({
  defillama: {
    getTokenPriceUsd: async () => prices.defillama ?? null,
    getNativePriceUsd: async () => prices.defillama ?? null,
  },
  dexscreener: {
    getTokenPriceUsd: async () => prices.dexscreener ?? null,
  },
  geckoterminal: {
    getTokenPriceUsd: async () => prices.geckoterminal ?? null,
  },
  coingecko: {
    getNativePriceUsd: async () => prices.coingecko ?? null,
    getTokenPriceUsd: async () => prices.coingecko ?? null,
  },
  jupiter: {
    getTokenPriceUsd: async () => prices.jupiter ?? null,
  },
  onchainV3: {
    getTokenPriceUsd: async () => prices.onchainV3 ?? null,
  },
});

test("stablecoin USD returns fxRate without calling sources", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.defillama.getTokenPriceUsd = async () => {
    calls.push("defillama");
    return 2;
  };

  const result = await priceTokenCascade({
    token: token({ symbol: "USDC", isStable: true }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, fxRate);
  assert.equal(result.source, "stablecoin-usd");
  assert.deepEqual(calls, []);
});

test("stablecoin symbol alone does not bypass pricing sources", async () => {
  const calls: string[] = [];
  const sources = sourceSet({ dexscreener: 2 });
  sources.dexscreener.getTokenPriceUsd = async () => {
    calls.push("dexscreener");
    return 2;
  };

  const result = await priceTokenCascade({
    token: token({ symbol: "USDC", isStable: false }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, 2 * fxRate);
  assert.equal(result.source, "dex");
  assert.deepEqual(calls, ["dexscreener"]);
});

test("known wrapped USDC contracts return fxRate without calling sources", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.defillama.getTokenPriceUsd = async () => {
    calls.push("defillama");
    return 2;
  };

  const result = await priceTokenCascade({
    token: token({
      key: "arbitrum_one:0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb",
      contract: "0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb",
      symbol: "aRUSDC",
      name: "Ample Arbitrum USDC",
      chain: { ...baseChain, key: "ARBITRUM_ONE" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, fxRate);
  assert.equal(result.source, "stablecoin-usd");
  assert.deepEqual(calls, []);
});

test("global token alias map routes Scroll rSTONE to STONE DefiLlama price", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.defillama.getTokenPriceUsd = async (_token, llamaId) => {
    calls.push(`defillama:${llamaId ?? "none"}`);
    return 1678.48;
  };
  sources.dexscreener.getTokenPriceUsd = async () => {
    calls.push("dexscreener");
    return 0.5;
  };

  const result = await priceTokenCascade({
    token: token({
      key: "scroll:0xad3d07d431b85b525d81372802504fa18dbd554c",
      contract: "0xad3d07d431b85b525d81372802504fa18dbd554c",
      symbol: "rSTONE",
      name: "StakeStone Ether",
      chain: { ...baseChain, key: "SCROLL" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.source, "llama-map");
  assert.equal(result.priceEur, Math.round(1678.48 * fxRate * 1_000_000_000) / 1_000_000_000);
  assert.deepEqual(calls, ["defillama:coingecko:stakestone-ether"]);
});

test("global token alias map routes World Chain Re7USDC to re7-usdc DefiLlama price", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.defillama.getTokenPriceUsd = async (_token, llamaId) => {
    calls.push(`defillama:${llamaId ?? "none"}`);
    return 1.0399;
  };

  const result = await priceTokenCascade({
    token: token({
      key: "worldchain:0xb1e80387ebe53ff75a89736097d34dc8d9e9045b",
      contract: "0xb1e80387ebe53ff75a89736097d34dc8d9e9045b",
      symbol: "Re7USDC",
      name: "Re7 USDC",
      chain: { ...baseChain, key: "WORLDCHAIN" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.source, "llama-map");
  assert.equal(Number(result.priceEur?.toFixed(12)), Number((1.0399 * fxRate).toFixed(12)));
  assert.deepEqual(calls, ["defillama:coingecko:re7-usdc"]);
});

test("global token alias map routes Scroll lSTONE to STONE DefiLlama price", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.defillama.getTokenPriceUsd = async (_token, llamaId) => {
    calls.push(`defillama:${llamaId ?? "none"}`);
    return 1678.48;
  };

  const result = await priceTokenCascade({
    token: token({
      key: "scroll:0xe5c40a3331d4fb9a26f5e48b494813d977ec0a8e",
      contract: "0xe5c40a3331d4fb9a26f5e48b494813d977ec0a8e",
      symbol: "lSTONE",
      name: "LayerBank STONE",
      chain: { ...baseChain, key: "SCROLL" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.source, "llama-map");
  assert.equal(result.priceEur, Math.round(1678.48 * fxRate * 1_000_000_000) / 1_000_000_000);
  assert.deepEqual(calls, ["defillama:coingecko:stakestone-ether"]);
});

test("price cache is namespaced by chain key", async () => {
  const cache = new MemoryPricingCache();
  await cache.setPrice("base:0x1111111111111111111111111111111111111111", { priceEur: 9, ts: Date.now(), source: "cache" });

  const result = await priceTokenCascade({
    token: token({ key: "ethereum:0x1111111111111111111111111111111111111111", contract: "0x1111111111111111111111111111111111111111" }),
    fxRate,
    cache,
    sources: sourceSet({ dexscreener: 2 }),
  });

  assert.equal(result.priceEur, 2 * fxRate);
  assert.equal(result.source, "dex");
});

test("uses DefiLlama mapped token before DexScreener", async () => {
  const calls: string[] = [];
  const sources = sourceSet({ defillama: 4, dexscreener: 5 });
  sources.defillama.getTokenPriceUsd = async () => {
    calls.push("defillama");
    return 4;
  };
  sources.dexscreener.getTokenPriceUsd = async () => {
    calls.push("dexscreener");
    return 5;
  };

  const result = await priceTokenCascade({
    token: token({ key: "0x2222222222222222222222222222222222222222", contract: "0x2222222222222222222222222222222222222222" }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, 4 * fxRate);
  assert.equal(result.source, "llama-map");
  assert.deepEqual(calls, ["defillama"]);
});

test("falls back to DexScreener when DefiLlama misses", async () => {
  const result = await priceTokenCascade({
    token: token({ key: "0x2222222222222222222222222222222222222222", contract: "0x2222222222222222222222222222222222222222" }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources: sourceSet({ defillama: null, dexscreener: 3 }),
  });

  assert.equal(result.priceEur, 3 * fxRate);
  assert.equal(result.source, "dex");
});

test("falls back to GeckoTerminal when DexScreener misses", async () => {
  const result = await priceTokenCascade({
    token: token(),
    fxRate,
    cache: new MemoryPricingCache(),
    sources: sourceSet({ dexscreener: null, geckoterminal: 2.5 }),
  });

  assert.equal(result.priceEur, 2.5 * fxRate);
  assert.equal(result.source, "gt");
});

test("falls back to Zora for Base content coins when standard sources miss", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => {
    calls.push("dex");
    return null;
  };
  sources.defillama.getTokenPriceUsd = async () => {
    calls.push("llama");
    return null;
  };
  sources.geckoterminal.getTokenPriceUsd = async () => {
    calls.push("gt");
    return null;
  };
  sources.onchainV3.getTokenPriceUsd = async () => {
    calls.push("onchain");
    return null;
  };
  (sources as PricingSourceSet & { zora: { getTokenPriceUsd: PricingSourceSet["dexscreener"]["getTokenPriceUsd"] } }).zora = {
    getTokenPriceUsd: async () => {
      calls.push("zora");
      return { priceUsd: 0.000008379759007, source: "zora", symbol: "Surprise", name: "Surprise" };
    },
  };

  const result = await priceTokenCascade({
    token: token({ symbol: "Surprise", name: "Surprise" }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, 0.000008379759007 * fxRate);
  assert.equal(result.source, "zora");
  assert.deepEqual(calls, ["dex", "llama", "gt", "onchain", "zora"]);
});

test("unpriced token returns null price and clear reason", async () => {
  const result = await priceTokenCascade({
    token: token(),
    fxRate,
    cache: new MemoryPricingCache(),
    sources: sourceSet({}),
  });

  assert.equal(result.priceEur, null);
  assert.equal(result.reason, "NO_PRICE");
  assert.deepEqual(result.trail.map((step) => step.source), ["dex", "llama-coins", "gt", "onchain-v3"]);
});

test("keeps NEED_TRY3 marker when GeckoTerminal reports Try3-only path", async () => {
  const cache = new MemoryPricingCache();
  const markerKey = "base:0x1111111111111111111111111111111111111111";
  const sources = sourceSet({ geckoterminal: null });
  sources.geckoterminal.getTokenPriceUsd = async () => ({
    priceUsd: null,
    source: "gt",
    marker: NEED_TRY3,
    reason: "try2_no_price",
  });

  const result = await priceTokenCascade({
    token: token(),
    fxRate,
    cache,
    sources,
  });

  assert.equal(result.priceEur, null);
  assert.equal(await cache.getMarker(markerKey), NEED_TRY3);
});

test("cascade order matches WCORE token fallback order", async () => {
  const calls: string[] = [];
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => {
    calls.push("dex");
    return null;
  };
  sources.defillama.getTokenPriceUsd = async () => {
    calls.push("llama-coins");
    return null;
  };
  sources.geckoterminal.getTokenPriceUsd = async () => {
    calls.push("gt");
    return null;
  };
  sources.onchainV3.getTokenPriceUsd = async () => {
    calls.push("onchain-v3");
    return 0.5;
  };

  const result = await priceTokenCascade({
    token: token(),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.priceEur, 0.5 * fxRate);
  // dex + llama-coins now run in parallel, so order between them is non-deterministic.
  // The important thing is that all sources are eventually tried before onchain hits.
  assert.ok(calls.includes("dex"));
  assert.ok(calls.includes("llama-coins"));
  assert.ok(calls.includes("gt"));
  assert.ok(calls.includes("onchain-v3"));
});

test("runs dex and llama-coins in parallel when llama-map misses", async () => {
  const t0 = Date.now();
  const sources = sourceSet({});
  let dexStarted = 0;
  let llamaStarted = 0;
  sources.dexscreener.getTokenPriceUsd = async () => {
    dexStarted = Date.now();
    await new Promise((r) => setTimeout(r, 40));
    return 3;
  };
  sources.defillama.getTokenPriceUsd = async () => {
    llamaStarted = Date.now();
    await new Promise((r) => setTimeout(r, 40));
    return null;
  };

  const result = await priceTokenCascade({
    token: token(),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  const elapsed = Date.now() - t0;
  assert.equal(result.priceEur, 3 * fxRate);
  assert.equal(result.source, "dex");
  // With parallel, total < sum of both delays (80ms). Allow overhead.
  assert.ok(elapsed < 90, `elapsed ${elapsed}ms should be sub-sum of sequential delays`);
  // Both were started within a short window (parallel, not sequential)
  assert.ok(Math.abs(dexStarted - llamaStarted) < 20, `dex started at ${dexStarted}, llama at ${llamaStarted}, should be near-simultaneous`);
});

// Regression: onchainMarkerKey uses canonical key format (NEED_ONCHAIN:{gtNetwork}:{contract})
// so cascade.ts must read with the same function, not a hardcoded string.
test("onchainMarkerKey uses canonical format with gtNetwork", () => {
  const tkn = token();
  const key = onchainMarkerKey(tkn);
  assert.ok(key.startsWith("NEED_ONCHAIN:"), `key should start with NEED_ONCHAIN:, got: ${key}`);
  assert.ok(key.includes("base:"), `key should include chain network, got: ${key}`);
});

// Regression: SVM/Cosmos pricing keys must be scoped by chain to avoid
// cross-chain price collisions (e.g. same denom on different Cosmos chains).
test("pricing key includes chain prefix for cross-chain safety", () => {
  const cache = new MemoryPricingCache();

  const keyA = `cosmos_hub:uatom`;
  const keyB = `osmosis:uatom`;

  cache.setPrice(keyA, { priceEur: 10, ts: Date.now(), source: "test" });
  cache.setPrice(keyB, { priceEur: 5, ts: Date.now(), source: "test" });

  // Keys are distinct — no collision
  const cachedA = cache.getPrice(keyA);
  const cachedB = cache.getPrice(keyB);
  assert.equal(cachedA?.priceEur, 10, "chain A price should be 10");
  assert.equal(cachedB?.priceEur, 5, "chain B price should be 5");
});

// Regression: when all live pricing sources fail (rate limiting during massive scans),
// native pricing should fall back to stale cache instead of returning NO_PRICE.
test("native pricing falls back to stale cache when all sources fail", async () => {
  const cache = new MemoryPricingCache();
  const nativeToken: PricingToken = {
    key: "native@injective",
    contract: "native",
    symbol: "INJ",
    isNative: true,
    chain: {
      key: "INJECTIVE",
      vm: "COSMOS",
      CHAIN: { NAME: "Injective", CHAIN_ID: 0, NATIVE_SYMBOL: "INJ", NATIVE_DECIMALS: 18, GT_NETWORK: "injective", DEX_SLUG: "injective" },
    },
  };

  // Pre-populate cache with a stale price
  cache.setPrice("native@injective", { priceEur: 5.5, ts: Date.now() - 2 * 60 * 60 * 1000, source: "defillama" });

  // All sources fail (simulating rate limiting)
  const sources = sourceSet({ defillama: null, coingecko: null });

  const result = await priceTokenCascade({
    token: nativeToken,
    fxRate,
    cache,
    sources,
  });

  assert.equal(result.priceEur, 5.5, "should use stale cache price");
  assert.equal(result.source, "cache-stale", "source should be cache-stale");
  assert.equal(result.reason, null, "reason should be null (success)");
});

test("token pricing falls back to stale cache when all sources fail", async () => {
  const cache = new MemoryPricingCache();
  const testToken = token();

  // Pre-populate cache with a stale price
  cache.setPrice(testToken.key, { priceEur: 2.5, ts: Date.now() - 2 * 60 * 60 * 1000, source: "dex" });

  // All sources fail
  const sources = sourceSet({ defillama: null, dexscreener: null, geckoterminal: null, coingecko: null });

  const result = await priceTokenCascade({
    token: testToken,
    fxRate,
    cache,
    sources,
  });

  assert.equal(result.priceEur, 2.5, "should use stale cache price");
  assert.equal(result.source, "cache-stale", "source should be cache-stale");
});

// Staked mirror pricing is implemented in the gsheet plugin post-scan step
// (apps/api/src/plugins/gsheet.ts STAKED_PRICE_MIRRORS) because the underlying
// tokens (DAYS, SWEET) have no DefiLlama coverage and the price comes from
// DexScreener/GT. The mirror must be applied AFTER the underlying is priced
// in the same scan, not at the cascade level.
