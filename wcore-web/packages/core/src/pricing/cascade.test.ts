// Run: node --import tsx --test packages/core/src/pricing/cascade.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceTokenCascade } from "./cascade.js";
import { MemoryPricingCache } from "./types.js";
import { getStablecoinType } from "./stablecoins.js";
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

test("stablecoin symbols stay aligned with the GSheet canonical classification", () => {
  for (const symbol of ["FRXUSD", "USDP", "TUSD", "USDD", "GUSD", "USDY", "USDN", "SUSD", "BUSD", "FDUSD", "PYUSD", "USDX", "USD+", "CUSD", "MUSD", "EUSD", "DOLA", "MIM", "PATHUSD", "AZND"]) {
    assert.equal(getStablecoinType(symbol), "USD", `${symbol} must use the USD peg`);
  }
  for (const symbol of ["SEUR", "EURA", "JEUR", "PAR"]) {
    assert.equal(getStablecoinType(symbol), "EUR", `${symbol} must use the EUR peg`);
  }
  assert.equal(getStablecoinType("FRAX"), null, "FRAX is the Fraxtal gas token, not frxUSD");
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

test("routes EraLend eUSDC contract to the canonical USDC price", async () => {
  const calls: string[] = [];
  const sources = sourceSet({ defillama: 1, dexscreener: 0.999 });
  sources.defillama.getTokenPriceUsd = async (_token, llamaId) => {
    calls.push(llamaId ?? "none");
    return 1;
  };

  const result = await priceTokenCascade({
    token: token({
      key: "zksync_era:0x90973213e2a230227bd7ccafb30391f4a52439ee",
      contract: "0x90973213e2a230227bd7ccafb30391f4a52439ee",
      symbol: "eUSDC",
      name: "EraLend USD Coin",
      chain: {
        key: "ZKSYNC_ERA",
        vm: "EVM",
        CHAIN: { NAME: "zkSync Era", CHAIN_ID: 324, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 },
        LLAMA_CONTRACT_MAP: { "0x90973213e2a230227bd7ccafb30391f4a52439ee": "coingecko:usd-coin" },
      },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.source, "llama-map");
  assert.deepEqual(calls, ["coingecko:usd-coin"]);
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

test("returns metadata from the source that supplied the accepted price", async () => {
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => ({
    priceUsd: 2.4e-8,
    source: "dex",
    symbol: "CWIF",
    name: "catwifhat",
  });

  const result = await priceTokenCascade({
    token: token({
      key: "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      contract: "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
      chain: { ...baseChain, key: "SOLANA", vm: "SVM" },
    }),
    fxRate,
    cache: new MemoryPricingCache(),
    sources,
  });

  assert.equal(result.symbol, "CWIF");
  assert.equal(result.name, "catwifhat");
});

test("price cache hit preserves accepted source metadata", async () => {
  const cache = new MemoryPricingCache();
  let marketCalls = 0;
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => {
    marketCalls++;
    return {
      priceUsd: 2.4e-8,
      source: "dex",
      symbol: "CWIF",
      name: "catwifhat",
    };
  };
  const svmToken = token({
    key: "solana:7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
    contract: "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1",
    chain: { ...baseChain, key: "SOLANA", vm: "SVM" },
  });

  const first = await priceTokenCascade({ token: svmToken, fxRate, cache, sources });
  const second = await priceTokenCascade({ token: svmToken, fxRate, cache, sources });
  const cached = await cache.getPrice(svmToken.key);

  assert.equal(first.symbol, "CWIF");
  assert.equal(first.name, "catwifhat");
  assert.equal(second.symbol, "CWIF");
  assert.equal(second.name, "catwifhat");
  assert.equal(second.source, "dex");
  assert.equal(marketCalls, 1);
  assert.equal(cached?.symbol, "CWIF");
  assert.equal(cached?.name, "catwifhat");
});

test("fresh price cache without identity self-heals from market sources", async () => {
  const cache = new MemoryPricingCache();
  const mint = "7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1";
  await cache.setPrice(`solana:${mint}`, {
    priceEur: 2.4e-8 * fxRate,
    ts: Date.now(),
    source: "dex",
  });
  let marketCalls = 0;
  const sources = sourceSet({});
  sources.dexscreener.getTokenPriceUsd = async () => {
    marketCalls++;
    return {
      priceUsd: 2.4e-8,
      source: "dex",
      symbol: "CWIF",
      name: "catwifhat",
    };
  };

  const result = await priceTokenCascade({
    token: token({
      key: `solana:${mint}`,
      contract: mint,
      chain: { ...baseChain, key: "SOLANA", vm: "SVM" },
    }),
    fxRate,
    cache,
    sources,
  });
  const cached = await cache.getPrice(`solana:${mint}`);

  assert.equal(result.symbol, "CWIF");
  assert.equal(result.name, "catwifhat");
  assert.equal(marketCalls, 1);
  assert.equal(cached?.symbol, "CWIF");
  assert.equal(cached?.name, "catwifhat");
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

  assert.equal(result.priceEur, 3 * fxRate);
  assert.equal(result.source, "dex");
  // Start times prove concurrency without depending on runner scheduling overhead.
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

test("forceRefresh refuses a stale AMM-pool price when live sources miss", async () => {
  const cache = new MemoryPricingCache();
  const mint = "0xd13be8b716b18265e294831fcb1330d170840bb3";
  const testToken = token({
    key: `fuse:${mint}`,
    contract: mint,
    chain: { ...baseChain, key: "FUSE", vm: "EVM" },
  });

  // Stale price from a dust GT pool (like sbFUSE $0.31)
  cache.setPrice(testToken.key, { priceEur: 0.269, ts: Date.now() - 2 * 60 * 60 * 1000, source: "gt" });

  // All sources miss under forceRefresh
  const sources = sourceSet({ defillama: null, dexscreener: null, geckoterminal: null, coingecko: null });

  const result = await priceTokenCascade({
    token: testToken,
    fxRate,
    cache,
    sources,
    skipCache: true,
    allowStaleCacheOnMiss: true,
  });

  assert.equal(result.priceEur, null, "forceRefresh must not resurrect a stale AMM-pool price");
  assert.equal(result.reason, "NO_PRICE");
});

test("forceRefresh still falls back to a stale registry price on full outage", async () => {
  const cache = new MemoryPricingCache();
  const testToken = token();

  cache.setPrice(testToken.key, { priceEur: 3.1, ts: Date.now() - 2 * 60 * 60 * 1000, source: "llama-map" });

  const sources = sourceSet({ defillama: null, dexscreener: null, geckoterminal: null, coingecko: null });

  const result = await priceTokenCascade({
    token: testToken,
    fxRate,
    cache,
    sources,
    skipCache: true,
    allowStaleCacheOnMiss: true,
  });

  assert.equal(result.priceEur, 3.1, "stale registry price is trustworthy under forceRefresh");
  assert.equal(result.source, "cache-stale");
});

// Staked mirror pricing is implemented in the gsheet plugin post-scan step
// (apps/api/src/plugins/gsheet.ts STAKED_PRICE_MIRRORS) because the underlying
// tokens (DAYS, SWEET) have no DefiLlama coverage and the price comes from
// DexScreener/GT. The mirror must be applied AFTER the underlying is priced
// in the same scan, not at the cascade level.
