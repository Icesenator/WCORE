// Run: node --import tsx --test packages/core/src/tokens/discovery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverTokensForWallet, getDiscoveryCacheKey, getKnownTokensForChain } from "./discovery.js";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import type { CacheStore } from "../cache/types.js";

const BASE_FIRST3 = ["USDC", "USDT", "WETH"];
const ETH_FIRST5 = ["USDC", "USDT", "DAI", "WETH", "WBTC"];

test("getKnownTokensForChain returns Base registry tokens", async () => {
  const tokens = await getKnownTokensForChain("base");
  const symbols = tokens.map((t) => t.symbol);
  assert.ok(symbols.slice(0, 3).every((s, i) => s === BASE_FIRST3[i]));
  assert.ok(tokens.length >= 3);
  assert.equal(tokens[0]?.contract, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
});

test("getKnownTokensForChain returns Ethereum registry tokens", async () => {
  const tokens = await getKnownTokensForChain("ethereum");
  const symbols = tokens.map((t) => t.symbol);
  assert.ok(symbols.slice(0, 5).every((s, i) => s === ETH_FIRST5[i]));
  assert.equal(tokens[0]?.contract, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
});

test("getKnownTokensForChain includes ZERO Network WBTC", async () => {
  const tokens = await getKnownTokensForChain("zero");
  const wbtc = tokens.find((t) => t.contract === "0xf1f9e08a0818594fde4713ae0db1e46672ca960e");
  assert.ok(wbtc);
  assert.equal(wbtc.symbol, "WBTC");
  assert.equal(wbtc.name, "Wrapped BTC");
  assert.equal(wbtc.decimals, 8);
});

test("discoverTokensForWallet returns registry tokens for Base", async () => {
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE");
  const symbols = tokens.map((t) => t.symbol);
  assert.ok(symbols.slice(0, 3).every((s, i) => s === BASE_FIRST3[i]));
});

test("getDiscoveryCacheKey is stable across moving block ranges", () => {
  assert.equal(
    getDiscoveryCacheKey("0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE"),
    "disc:0xd8da6bf26964af9d7eed9e03e53415d37aa96045:base",
  );
});

test("discoverTokensForWallet combines registry and log-discovered metadata", async () => {
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    logDiscovery: async () => ({
      contracts: ["0x9999999999999999999999999999999999999999"],
      errors: [],
    }),
    metadata: async (contract) => ({
      token: { contract, symbol: "LOG", name: "Log Token", decimals: 18, source: "logs" },
      errors: [],
    }),
  });
  const symbols = tokens.map((t) => t.symbol);
  assert.ok(symbols.includes("LOG"));
  assert.ok(symbols.slice(0, 3).every((s, i) => s === BASE_FIRST3[i]));
});

test("discoverTokensForWallet keeps registry when log scan errors", async () => {
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    logDiscovery: async () => ({ contracts: [], errors: ["eth_getLogs failed"] }),
  });
  assert.ok(tokens.length > 0);
});

test("discoverTokensForWallet uses cache as first call and returns cached on second", async () => {
  const cache: CacheStore = new MemoryCacheStore();
  let metadataCalls = 0;
  const metadata = async (contract: string) => {
    metadataCalls++;
    return { token: { contract, symbol: `M${metadataCalls}`, name: "Cached Token", decimals: 18, source: "logs" as const }, errors: [] };
  };
  const context = {
    logDiscovery: async () => ({ contracts: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], errors: [] }),
    metadata, cache, cacheKey: "test:discovery:cache:key",
  };
  const first = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", context);
  assert.equal(metadataCalls, 1);
  const second = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", context);
  assert.equal(metadataCalls, 1);
  assert.deepEqual(second, first);
});

test("discoverTokensForWallet caches explorer discovery with the stable wallet chain key", async () => {
  const cache: CacheStore = new MemoryCacheStore();
  let explorerCalls = 0;
  const context = {
    explorerDiscovery: async () => {
      explorerCalls++;
      return {
        tokens: [{ contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", symbol: "IDX", name: "Indexer Token", decimals: 18, source: "indexer" as const }],
        errors: [],
      };
    },
    cache,
    cacheKey: getDiscoveryCacheKey("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE"),
  };

  const first = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", context);
  const second = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", context);

  assert.equal(explorerCalls, 1);
  assert.ok(first.some((token) => token.symbol === "IDX"));
  assert.deepEqual(second, first);
});

test("discoverTokensForWallet skips log discovery when explorer finds tokens", async () => {
  let logCalls = 0;
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    explorerDiscovery: async () => ({
      tokens: [{ contract: "0xcccccccccccccccccccccccccccccccccccccccc", symbol: "FAST", name: "Fast Indexer", decimals: 18, source: "indexer" }],
      errors: [],
    }),
    logDiscovery: async () => {
      logCalls++;
      return { contracts: ["0xdddddddddddddddddddddddddddddddddddddddd"], errors: [] };
    },
    metadata: async (contract) => ({ token: { contract, symbol: "LOG", name: "Log Token", decimals: 18, source: "logs" }, errors: [] }),
  });

  assert.equal(logCalls, 0);
  assert.ok(tokens.some((token) => token.symbol === "FAST"));
  assert.ok(!tokens.some((token) => token.symbol === "LOG"));
});

test("discoverTokensForWallet can trust a clean explorer response and skip logs", async () => {
  let logCalls = 0;
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    trustExplorerWhenClean: true,
    explorerDiscovery: async () => ({ tokens: [], errors: [] }),
    logDiscovery: async () => {
      logCalls++;
      return { contracts: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"], errors: [] };
    },
    metadata: async (contract) => ({ token: { contract, symbol: "LOG", name: "Log Token", decimals: 18, source: "logs" }, errors: [] }),
  });

  assert.equal(logCalls, 0);
  assert.ok(tokens.some((token) => token.symbol === "USDC"));
  assert.ok(!tokens.some((token) => token.symbol === "LOG"));
});

test("discoverTokensForWallet falls back to logs when explorer returns an error", async () => {
  let logCalls = 0;
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    trustExplorerWhenClean: true,
    explorerDiscovery: async () => ({ tokens: [], errors: ["explorer HTTP 429 for BASE"] }),
    logDiscovery: async () => {
      logCalls++;
      return { contracts: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"], errors: [] };
    },
    metadata: async (contract) => ({ token: { contract, symbol: "LOG", name: "Log Token", decimals: 18, source: "logs" }, errors: [] }),
  });

  assert.equal(logCalls, 1);
  assert.ok(tokens.some((token) => token.symbol === "LOG"));
});

test("discoverTokensForWallet survives cache read failure", async () => {
  const brokenCache: CacheStore = {
    get: async () => { throw new Error("cache read error"); },
    set: async () => {}, delete: async () => {}, clear: async () => {}, mget: async () => { throw new Error("cache read error"); }, add: async () => true,
  };
  const tokens = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    cache: brokenCache, cacheKey: "test:broken:cache",
  });
  assert.ok(tokens.length > 0);
});

test("discoverTokensForWallet survives cache write failure", async () => {
  let metadataCalls = 0;
  const metadata = async (contract: string) => {
    metadataCalls++;
    return { token: { contract, symbol: "F", name: "Fail Token", decimals: 18, source: "logs" as const }, errors: [] };
  };
  const brokenWriteCache: CacheStore = { async get() { return undefined; }, async set() { throw new Error("x"); }, async delete() {}, async clear() {}, async mget() { return []; }, async add() { return true; } };
  const result = await discoverTokensForWallet("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", {
    logDiscovery: async () => ({ contracts: ["0xdddddddddddddddddddddddddddddddddddddddd"], errors: [] }),
    metadata, cache: brokenWriteCache, cacheKey: "test:broken:write",
  });
  assert.equal(metadataCalls, 1);
  assert.ok(result.length > 0);
});
