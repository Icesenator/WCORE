import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getScanResultCacheKey,
  getEngineCacheForScan,
  hasCachedValue,
  isRetriableNonEvmResult,
  shouldCacheAssets,
  calcCleanChainValue,
  getBalanceCacheKey,
  readBalanceCache,
  BALANCE_CACHE_TTL_MS,
} from "./scan-utils.js";
import type { WalletAssets } from "@wcore/core";
import type { ChainScan } from "@wcore/shared";

// Minimal in-memory cache for tests
class TestCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return undefined; }
    return entry.value as T;
  }
  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

function makeAssets(overrides: Partial<WalletAssets> = {}): WalletAssets {
  return {
    chain: "BASE",
    chainName: "Base",
    native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
    tokens: [],
    errors: [],
    totalValueEur: 0,
    scanMs: 100,
    ...overrides,
  };
}

function makeChainScan(overrides: Partial<ChainScan> = {}): ChainScan {
  return {
    chainKey: "BASE",
    chainName: "Base",
    vm: "EVM",
    native: { contract: "native", symbol: "ETH", name: "Ether", decimals: 18, balance: 1, priceEur: 3000, priceSource: "pricing-cascade", valueEur: 3000, flags: [] },
    tokens: [],
    totals: { valueEur: 3000, tokenCount: 1, pricedCount: 1 },
    errors: [],
    degraded: false,
    fxRate: 0.92,
    scanMs: 100,
    cachedAt: null,
    scriptVersion: "0.2.0",
    ...overrides,
  };
}

describe("getScanResultCacheKey", () => {
  it("normalizes address and chain to lowercase", () => {
    const key = getScanResultCacheKey("0xABC123", "ETHEREUM");
    assert.equal(key, "scan:result:0xabc123:ethereum");
  });
});

describe("getBalanceCacheKey", () => {
  it("normalizes to lowercase", () => {
    const key = getBalanceCacheKey("ETHEREUM", "0xABC");
    assert.equal(key, "bal_cache:ethereum:0xabc");
  });
});

describe("getEngineCacheForScan", () => {
  it("returns the cache unchanged", () => {
    const cache = new TestCache();
    assert.equal(getEngineCacheForScan(false, "EVM", cache as never), cache as never);
  });
});

describe("hasCachedValue", () => {
  it("returns true when tokens exist", () => {
    assert.equal(hasCachedValue(makeAssets({ tokens: [{ contract: "0x1", symbol: "USDC", name: "USD Coin", balance: 100, decimals: 6, priceEur: 1 } as any] })), true);
  });
  it("returns true when native balance > 0 with price", () => {
    assert.equal(hasCachedValue(makeAssets({ native: { symbol: "ETH", balance: 1, priceEur: 3000, valueEur: 3000 } })), true);
  });
  it("returns false when native balance > 0 without price", () => {
    assert.equal(hasCachedValue(makeAssets({ native: { symbol: "ETH", balance: 1, priceEur: null, valueEur: null } })), false);
  });
  it("returns false for empty wallet", () => {
    assert.equal(hasCachedValue(makeAssets()), false);
  });
});

describe("isRetriableNonEvmResult", () => {
  it("returns false when has value", () => {
    assert.equal(isRetriableNonEvmResult(makeAssets({ tokens: [{ contract: "0x1", symbol: "USDC", name: "USD Coin", balance: 100, decimals: 6, priceEur: 1 } as any] })), false);
  });
  it("returns true for RPC error with no value", () => {
    assert.equal(isRetriableNonEvmResult(makeAssets({ errors: ["rpc timeout"] })), true);
  });
  it("returns true for 429 error", () => {
    assert.equal(isRetriableNonEvmResult(makeAssets({ errors: ["HTTP 429"] })), true);
  });
  it("returns false for non-retriable error", () => {
    assert.equal(isRetriableNonEvmResult(makeAssets({ errors: ["some other error"] })), false);
  });
});

describe("shouldCacheAssets", () => {
  it("returns true for clean result with value", () => {
    assert.equal(shouldCacheAssets(makeAssets({ tokens: [{ contract: "0x1", symbol: "USDC", name: "USD Coin", balance: 100, decimals: 6, priceEur: 1 } as any], totalValueEur: 100 })), true);
  });
  it("returns false for errors", () => {
    assert.equal(shouldCacheAssets(makeAssets({ errors: ["token accounts: no data"] })), false);
  });
  it("returns true for valuable degraded results with only non-critical errors", () => {
    assert.equal(shouldCacheAssets(makeAssets({
      tokens: [
        { contract: "0x1", symbol: "WBTC", name: "Wrapped BTC", balance: 0.002, decimals: 8, priceEur: 54000 } as any,
        { contract: "0x2", symbol: "SPAM", name: "Airdropped Spam", balance: 1, decimals: 18, priceEur: null } as any,
      ],
      totalValueEur: 108,
      errors: [
        "https://1rpc.io/eth: RPC error -32001: usage limit",
        "SPAM price: NO_PRICE",
      ],
    })), true);
  });
  it("returns false for empty wallet", () => {
    assert.equal(shouldCacheAssets(makeAssets()), false);
  });
  it("returns false for native balance without price", () => {
    assert.equal(shouldCacheAssets(makeAssets({ native: { symbol: "ETH", balance: 1, priceEur: null, valueEur: null } })), false);
  });
  it("returns false for major token without price", () => {
    assert.equal(shouldCacheAssets(makeAssets({
      tokens: [{ contract: "0x1", symbol: "ETH", name: "Ether", balance: 1, decimals: 18, priceEur: null } as any],
      errors: ["ETH price: NO_PRICE"],
    })), false);
  });
});

describe("calcCleanChainValue", () => {
  const mockDetectScam = (symbol: string, _name: string, _balance: number, _priceEur: number | null, _contract: string) => ({
    isSuspicious: symbol === "SCAM",
    level: "info" as const,
    reason: null,
    weight: 0,
  });

  it("returns total when no scam tokens", () => {
    const chain = makeChainScan({ totals: { valueEur: 1000, tokenCount: 2, pricedCount: 2 } });
    assert.equal(calcCleanChainValue(chain, mockDetectScam as any), 1000);
  });
  it("subtracts scam token value", () => {
    const chain = makeChainScan({
      totals: { valueEur: 1000, tokenCount: 2, pricedCount: 2 },
      tokens: [
        { contract: "0x1", symbol: "USDC", name: "USD Coin", decimals: 6, balance: 100, priceEur: 1, priceSource: "pricing-cascade", valueEur: 100, flags: [] },
        { contract: "0x2", symbol: "SCAM", name: "Scam Token", decimals: 18, balance: 1000, priceEur: 0.9, priceSource: "pricing-cascade", valueEur: 900, flags: [] },
      ] as any[],
    });
    assert.equal(calcCleanChainValue(chain, mockDetectScam as any), 100);
  });
  it("never returns negative", () => {
    const chain = makeChainScan({ totals: { valueEur: 100, tokenCount: 1, pricedCount: 1 }, tokens: [{ contract: "0x1", symbol: "SCAM", name: "Scam", decimals: 18, balance: 1000, priceEur: 1, priceSource: "pricing-cascade", valueEur: 1000, flags: [] }] as any[] });
    assert.equal(calcCleanChainValue(chain, mockDetectScam as any), 0);
  });
  it("preserves a legitimate net DeFi debt", () => {
    const chain = makeChainScan({
      totals: { valueEur: -100, tokenCount: 1, pricedCount: 1 },
      tokens: [{ contract: "0x1", symbol: "Comp WETH Borrow", name: "Compound V3 Borrowed [Flex]", decimals: 18, balance: -0.1, priceEur: 1000, priceSource: "pricing-cascade", valueEur: -100, flags: ["DEFI"] }] as any[],
    });
    assert.equal(calcCleanChainValue(chain, mockDetectScam as any), -100);
  });
  it("handles detectScam throwing gracefully", () => {
    const throwingDetectScam = () => { throw new Error("boom"); };
    const chain = makeChainScan({ totals: { valueEur: 500, tokenCount: 1, pricedCount: 1 } });
    assert.equal(calcCleanChainValue(chain, throwingDetectScam as any), 500);
  });
});

describe("readBalanceCache", () => {
  it("returns null on cache miss", async () => {
    const cache = new TestCache();
    const result = await readBalanceCache(cache as any, "BASE", "0x123");
    assert.equal(result, null);
  });
  it("returns cached entry when fresh", async () => {
    const cache = new TestCache();
    const entry = { nativeBalance: "1000000000000000000", nativePriceEur: 3000, tokens: [], block: 100, ts: Date.now() };
    await cache.set("bal_cache:base:0x123", entry, BALANCE_CACHE_TTL_MS);
    const result = await readBalanceCache(cache as any, "BASE", "0x123");
    assert.deepEqual(result, entry);
  });
  it("returns null when expired", async () => {
    const cache = new TestCache();
    const entry = { nativeBalance: "0", nativePriceEur: null, tokens: [], block: 100, ts: Date.now() - BALANCE_CACHE_TTL_MS - 1 };
    await cache.set("bal_cache:base:0x123", entry, 1);
    const result = await readBalanceCache(cache as any, "BASE", "0x123");
    assert.equal(result, null);
  });
});
