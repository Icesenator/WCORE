import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { WalletAssets } from "@wcore/core";
import { getEngineCacheForScan, getScanResultCacheKey, hasCachedValue, isRetriableNonEvmResult, shouldCacheAssets } from "./plugins/scan-utils.js";

function assets(overrides: Partial<WalletAssets>): WalletAssets {
  return {
    chain: "solana",
    chainName: "Solana",
    native: { symbol: "SOL", balance: 0, priceEur: null, valueEur: null },
    tokens: [],
    errors: [],
    totalValueEur: 0,
    scanMs: 1,
    ...overrides,
  };
}

describe("scan result cache policy", () => {
  test("uses a semantic scan-result cache namespace", () => {
    assert.equal(getScanResultCacheKey("0xABC", "GNOSIS"), "scan:result:0xabc:gnosis");
  });

  test("keeps engine fallback cache when forceRefresh is not requested", () => {
    const cache = {} as never;
    assert.equal(getEngineCacheForScan(false, "EVM", cache), cache);
    assert.equal(getEngineCacheForScan(false, "SVM", cache), cache);
  });

  test("forceRefresh wraps the engine cache to bypass short-circuit keys", () => {
    const cache = {} as never;
    const wrappedEVM = getEngineCacheForScan(true, "EVM", cache);
    // EVM short-circuit caches (empty:*, bal_cache:*) must be bypassed during
    // a force refresh, so the wrapper cannot be the same instance as the
    // shared cache: writes/reads flow through a different surface that
    // short-circuits those prefixes.
    assert.notEqual(wrappedEVM, cache);
  });

  test("forceRefresh wrapper bypasses empty/bal_cache but delegates other keys to the original cache", async () => {
    const reads: string[] = [];
    const writes: string[] = [];
    const deletes: string[] = [];
    const innerGet = async (key: string) => {
      reads.push(key);
      if (key === "empty:eth:0xfeed") return { ts: 1 } as never;
      if (key === "bal_cache:eth:0xfeed") return { balance: "0" } as never;
      if (key === "native:eth:0xfeed") return { balance: "1" } as never;
      return undefined;
    };
    const innerSet = async (key: string) => {
      writes.push(key);
    };
    const innerDelete = async (key: string) => {
      deletes.push(key);
    };
    const cache = { get: innerGet, set: innerSet, delete: innerDelete } as never;

    const wrappedEVM = getEngineCacheForScan(true, "EVM", cache);
    const wrappedSVM = getEngineCacheForScan(true, "SVM", cache);
    const wrappedCosmos = getEngineCacheForScan(true, "COSMOS", cache);
    const wrappedTon = getEngineCacheForScan(true, "TON", cache);

    assert.notEqual(wrappedEVM, cache, "EVM forceRefresh must return a wrapper");
    assert.notEqual(wrappedSVM, cache, "SVM forceRefresh must return a wrapper");
    assert.notEqual(wrappedCosmos, cache, "Cosmos forceRefresh must return a wrapper");
    assert.notEqual(wrappedTon, cache, "TON forceRefresh must return a wrapper");

    // Short-circuit prefixes must be bypassed on read.
    assert.equal(await (wrappedEVM as { get: (k: string) => Promise<unknown> }).get("empty:eth:0xfeed"), undefined);
    assert.equal(await (wrappedEVM as { get: (k: string) => Promise<unknown> }).get("bal_cache:eth:0xfeed"), undefined);

    // Other keys must delegate to the original cache.
    const nativeVal = await (wrappedEVM as { get: (k: string) => Promise<unknown> }).get("native:eth:0xfeed");
    assert.deepEqual(nativeVal, { balance: "1" });
    assert.ok(reads.includes("native:eth:0xfeed"), "non-short-circuit key must reach the inner cache");
    assert.ok(!reads.includes("empty:eth:0xfeed"), "bypassed prefix must not hit the inner cache");
    assert.ok(!reads.includes("bal_cache:eth:0xfeed"), "bypassed prefix must not hit the inner cache");

    // Writes and deletes must always go through to the inner cache.
    await (wrappedEVM as { set: (k: string, v: unknown) => Promise<void> }).set("empty:eth:0xfeed", { ts: 2 });
    await (wrappedEVM as { delete: (k: string) => Promise<void> }).delete("native:eth:0xfeed");
    assert.deepEqual(writes, ["empty:eth:0xfeed"]);
    assert.deepEqual(deletes, ["native:eth:0xfeed"]);
  });

  test("caches valuable degraded scans when errors are non-critical", () => {
    // Ethereum can return useful fresh prices while also reporting long-tail
    // NO_PRICE entries or one failed RPC endpoint. Cache the useful result so a
    // force-refresh can replace stale scan snapshots.
    assert.equal(shouldCacheAssets(assets({
      tokens: [{ symbol: "SOL", name: "SOL", denom: "native", decimals: 9, balance: 1, priceEur: 10, valueEur: 10 }],
      totalValueEur: 10,
      errors: ["SOL price: NO_PRICE"],
    })), true);
  });

  test("does not cache scans where a major priceable token has no price", () => {
    assert.equal(shouldCacheAssets(assets({
      chain: "ETHEREUM",
      chainName: "Ethereum",
      tokens: [{
        symbol: "WBTC",
        name: "Wrapped BTC",
        contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        decimals: 8,
        balance: 0.0041221,
        priceEur: null,
        valueEur: null,
      }],
      totalValueEur: 16.32,
      errors: ["WBTC price: NO_PRICE"],
    })), false);
  });

  test("does not cache positive native balances without a native price", () => {
    assert.equal(shouldCacheAssets(assets({
      native: { symbol: "SOL", balance: 0.046470656, priceEur: null, valueEur: null },
      totalValueEur: 0,
      errors: [],
    })), false);
  });

  test("refuses stale cache where native has balance but no price", () => {
    // Old cache entries (pre-v0.2.30) could have native balance > 0
    // but priceEur=null. These must be treated as worthless so the
    // API re-scans instead of serving "price —" in the UI.
    assert.equal(hasCachedValue(assets({
      native: { symbol: "SOL", balance: 0.046470656, priceEur: null, valueEur: null },
      tokens: [{ symbol: "DOOD", name: "DOOD", contract: "0x...", decimals: 6, balance: 1368, priceEur: 0.0023, valueEur: 3.11 }],
      totalValueEur: 3.11,
    })), false);
  });

  test("refuses stale cache where a major positive token has no price", () => {
    // Old scan:result snapshots could contain useful native value but miss
    // priceable Base tokens like WETH/SOLVBTC/EURC. Serving that stale cache
    // leaves the UI stuck on native-only value until a manual force refresh.
    assert.equal(hasCachedValue(assets({
      chain: "BASE",
      chainName: "Base",
      native: { symbol: "ETH", balance: 0.005, priceEur: 1500, valueEur: 7.5 },
      tokens: [{
        symbol: "WETH",
        name: "Wrapped Ether",
        contract: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        balance: 0.01,
        priceEur: null,
        valueEur: null,
      }],
      totalValueEur: 7.5,
      errors: ["WETH price: NO_PRICE"],
    })), false);
  });

  test("does not cache empty errored scans", () => {
    assert.equal(shouldCacheAssets(assets({ errors: ["native balance failed on all 2 RPCs"] })), false);
  });

  test("does not cache partial SVM scans when token accounts failed", () => {
    assert.equal(shouldCacheAssets(assets({
      native: { symbol: "SOL", balance: 0.1, priceEur: 70, valueEur: 7 },
      totalValueEur: 7,
      errors: ["token accounts: no data from any RPC endpoint"],
    })), false);
  });

  test("does not cache partial Cosmos scans when bank balances failed", () => {
    assert.equal(shouldCacheAssets(assets({
      native: { symbol: "ATOM", balance: 1, priceEur: 3, valueEur: 3 },
      totalValueEur: 3,
      errors: ["balances fetch: This operation was aborted"],
    })), false);
  });
});

describe("non-EVM retry policy", () => {
  test("retries a degraded zero result with transient RPC errors", () => {
    assert.equal(isRetriableNonEvmResult(assets({
      errors: ["[DEGRADED] native balance: no strict consensus (1/2 agree)"],
    })), true);
    assert.equal(isRetriableNonEvmResult(assets({
      errors: ["token accounts: no data from any RPC endpoint"],
    })), true);
    assert.equal(isRetriableNonEvmResult(assets({
      errors: ["chain_timeout: SOLANA exceeded 180000ms"],
    })), true);
    assert.equal(isRetriableNonEvmResult(assets({
      errors: ["HTTP 429 from RPC"],
    })), true);
  });

  test("does not retry a result that has real value", () => {
    assert.equal(isRetriableNonEvmResult(assets({
      native: { symbol: "SOL", balance: 0.05, priceEur: 70, valueEur: 3.5 },
      totalValueEur: 3.5,
      errors: ["[DEGRADED] native balance: no strict consensus"],
    })), false);
  });

  test("does not retry a genuinely empty wallet (no errors)", () => {
    assert.equal(isRetriableNonEvmResult(assets({ errors: [] })), false);
  });

  test("does not retry a pricing-only failure (token has no price but balance read OK)", () => {
    assert.equal(isRetriableNonEvmResult(assets({
      native: { symbol: "INJ", balance: 0.1, priceEur: 5.6, valueEur: 0.56 },
      totalValueEur: 0.56,
      errors: ["factory/inj.../qunt price: NO_PRICE"],
    })), false);
  });
});
