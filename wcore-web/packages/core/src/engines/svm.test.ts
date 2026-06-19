// Run: node --import tsx --test packages/core/src/engines/svm.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSvmWalletAssets } from "./svm.js";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import type { PricingSourceSet } from "../pricing/index.js";

const OWNER = "AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4";
const MOCK_MINT = "So11111111111111111111111111111111111111112";

// Minimal mock for RpcClient with call<T>() method
function mockRpc(handlers: Record<string, unknown>) {
  return {
    async call<T>(endpoint: string, method: string, __params?: unknown[]): Promise<T> {
      const fn = handlers[method] as ((endpoint: string) => T | Promise<T>) | undefined;
      if (fn) return fn(endpoint);
      throw new Error(`Unmocked RPC method: ${method}`);
    },
  };
}

test("getSvmWalletAssets returns native SOL balance", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const rpc = mockRpc({
    getBalance: () => ({ value: 5_000_000_000 }),
    getTokenAccountsByOwner: () => ({ value: [] }),
  });

  const result = await getSvmWalletAssets(OWNER, "solana", {
    rpc: rpc as never,
    sources,
    fxRate: 1,
  });

  assert.equal(result.native.symbol, "SOL");
  assert.equal(result.native.balance, 5);
  assert.equal(result.native.priceEur, 20);
  assert.equal(result.tokens.length, 0);
});

test("getSvmWalletAssets returns SPL token balances", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => 1.5 },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const rpc = mockRpc({
    getBalance: () => ({ value: 1_000_000_000 }),
    getTokenAccountsByOwner: () => ({
      value: [{
        pubkey: "AToken123",
        account: {
          data: {
            parsed: {
              info: {
                mint: MOCK_MINT,
                tokenAmount: { amount: "1000000", decimals: 9, uiAmount: 1 },
              },
            },
          },
        },
      }],
    }),
  });

  const result = await getSvmWalletAssets(OWNER, "solana", {
    rpc: rpc as never,
    sources,
    fxRate: 1,
  });

  assert.equal(result.native.balance, 1);
  assert.ok(result.tokens.length >= 1);
  const token = result.tokens.find((t: { mint: string }) => t.mint === MOCK_MINT);
  assert.ok(token);
});

test("getSvmWalletAssets native balance uses successful RPC responses even when some fail", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  let balanceCalls = 0;
  const rpc = mockRpc({
    getBalance: () => {
      balanceCalls++;
      if (balanceCalls === 1) return { value: 5_000_000_000 };
      throw new Error("RPC unavailable");
    },
    getTokenAccountsByOwner: () => ({ value: [] }),
  });

  const result = await getSvmWalletAssets(OWNER, "solana", {
    rpc: rpc as never,
    sources,
    fxRate: 1,
  });

  assert.equal(result.native.balance, 5);
  assert.ok(result.errors.some((e) => e.includes("using max reported balance")));
});

test("getSvmWalletAssets falls back to RPC decimals when metadata cache has zero decimals", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => 2 },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const rpc = mockRpc({
    getBalance: () => ({ value: 0 }),
    getTokenAccountsByOwner: () => ({
      value: [{
        pubkey: "AToken123",
        account: { data: { parsed: { info: { mint: "UnknownMint111111111111111111111111111111111", tokenAmount: { amount: "1000000" } } } } },
      }],
    }),
    getAsset: () => ({ result: { content: { metadata: { name: "Unknown Token", symbol: "UNK" } } } }),
    getAccountInfo: () => ({ value: { parsed: { info: { decimals: 6 } } } }),
  });

  const result = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc as never, sources, fxRate: 1 });

  const token = result.tokens.find((t) => t.mint === "UnknownMint111111111111111111111111111111111");
  assert.ok(token);
  assert.equal(token.balance, 1);
  assert.equal(token.valueEur, 2);
});

test("getSvmWalletAssets formats SPL raw amounts without unsafe integer rounding", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => 1 },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const mint = "LargeMint1111111111111111111111111111111111";
  const rpc = mockRpc({
    getBalance: () => ({ value: 0 }),
    getTokenAccountsByOwner: () => ({
      value: [{
        pubkey: "LargeTokenAccount",
        account: { data: { parsed: { info: { mint, tokenAmount: { amount: "9007199254740993", decimals: 6 } } } } },
      }],
    }),
    getAsset: () => ({ result: { content: { metadata: { name: "Large Token", symbol: "LARGE" } } } }),
  });

  const result = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc as never, sources, fxRate: 1 });

  const token = result.tokens.find((t) => t.mint === mint);
  assert.ok(token);
  assert.equal(token.balance, 9007199254.740993);
});

// ─── Cache tests ───

test("getSvmWalletAssets negative cache returns [CACHED_EMPTY] on second empty scan", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: empty wallet
  const rpc1 = mockRpc({
    getBalance: () => ({ value: 0 }),
    getTokenAccountsByOwner: () => ({ value: [] }),
  });
  const result1 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc1 as never, sources, fxRate: 1, cache });
  assert.equal(result1.native.balance, 0);
  assert.equal(result1.tokens.length, 0);
  assert.ok(!result1.errors.some(e => e.includes("[CACHED_EMPTY]")), "first scan should not hit cache");

  // Second call: liveness check verifies wallet is still empty via getBalance.
  // The liveness check is the long-term fix — it prevents stale empty cache
  // from blocking real assets. No prefix bumps needed.
  const rpc2 = mockRpc({
    getBalance: () => ({ value: 0 }), // liveness check confirms empty
    getTokenAccountsByOwner: () => { throw new Error("should not be called"); },
  });
  const result2 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[CACHED_EMPTY]")), "second scan should hit negative cache");
  assert.equal(result2.native.balance, 0);
  assert.equal(result2.tokens.length, 0);
});

test("getSvmWalletAssets native balance uses cached fallback when consensus fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: successful scan with 5 SOL
  const rpc1 = mockRpc({
    getBalance: () => ({ value: 5_000_000_000 }),
    getTokenAccountsByOwner: () => ({ value: [] }),
  });
  const result1 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc1 as never, sources, fxRate: 1, cache });
  assert.equal(result1.native.balance, 5);

  // Verify native balance was cached
  const cachedNative = await cache.get<{ balance: string }>(`native:solana:${OWNER}`);
  assert.ok(cachedNative, "native balance should be cached after successful scan");
  assert.equal(cachedNative.balance, "5000000000");

  // Second call: RPC consensus fails (all endpoints error)
  const rpc2 = mockRpc({
    getBalance: () => { throw new Error("RPC down"); },
    getTokenAccountsByOwner: () => ({ value: [] }),
  });
  const result2 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("native balance")), "should use cached fallback");
  assert.equal(result2.native.balance, 5);
  assert.equal(result2.native.valueEur, 100);
});

test("getSvmWalletAssets token accounts use cached fallback when RPC fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => 1.5 },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: has 1 token account
  const rpc1 = mockRpc({
    getBalance: () => ({ value: 1_000_000_000 }),
    getTokenAccountsByOwner: () => ({
      value: [{
        pubkey: "AToken123",
        account: { data: { parsed: { info: { mint: MOCK_MINT, tokenAmount: { amount: "1000000", decimals: 9, uiAmount: 1 } } } } },
      }],
    }),
  });
  const result1 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc1 as never, sources, fxRate: 1, cache });
  assert.ok(result1.tokens.length >= 1);

  // Verify ta cache was written
  await new Promise(r => setTimeout(r, 0));
  const cachedTa = await cache.get(`ta:solana:${OWNER}`);
  assert.ok(cachedTa, "token accounts should be cached after successful scan");
  assert.ok((cachedTa as unknown[]).length >= 1);

  // Second call: RPC fails (throws error) for token accounts — triggers cache fallback
  const rpc2 = mockRpc({
    getBalance: () => ({ value: 1_000_000_000 }),
    getTokenAccountsByOwner: () => { throw new Error("RPC error"); },
  });
  const result2 = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("token accounts")), "should use cached fallback");
  assert.ok(result2.tokens.length >= 1);
});

test("getSvmWalletAssets writes per-token cache after pricing", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => 1.5 },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  const rpc = mockRpc({
    getBalance: () => ({ value: 1_000_000_000 }),
    getTokenAccountsByOwner: () => ({
      value: [{
        pubkey: "AToken123",
        account: { data: { parsed: { info: { mint: MOCK_MINT, tokenAmount: { amount: "1000000", decimals: 9, uiAmount: 1 } } } } },
      }],
    }),
  });

  await getSvmWalletAssets(OWNER, "solana", { rpc: rpc as never, sources, fxRate: 1, cache });
  await new Promise(r => setTimeout(r, 0));

  // Verify per-token cache entry
  const cached = await cache.get<{ balance: string; decimals: number; symbol: string }>(`token:solana:${MOCK_MINT}:${OWNER}`);
  assert.ok(cached, "per-token cache entry should exist");
  assert.equal(cached.balance, "1000000");
  assert.equal(cached.decimals, 9);
  assert.ok(cached.symbol.length > 0);
});

test("getSvmWalletAssets forceRefresh bypasses the empty cache for a fresh re-scan", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 20 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First scan: empty wallet, writes negative cache
  const rpc1 = mockRpc({
    getBalance: () => ({ value: 0 }),
    getTokenAccountsByOwner: () => ({ value: [] }),
  });
  const first = await getSvmWalletAssets(OWNER, "solana", { rpc: rpc1 as never, sources, fxRate: 1, cache });
  assert.equal(first.tokens.length, 0);
  assert.ok(!first.errors.some((e) => e.includes("[CACHED_EMPTY]")), "first scan should not hit cache");

  // Second scan with forceRefresh: must bypass negative cache and run a full scan
  let balanceCalls = 0;
  let tokenAccountCalls = 0;
  const rpc2 = mockRpc({
    getBalance: () => { balanceCalls++; return { value: 0 }; },
    getTokenAccountsByOwner: () => { tokenAccountCalls++; return { value: [] }; },
  });
  const second = await getSvmWalletAssets(OWNER, "solana", {
    rpc: rpc2 as never,
    sources,
    fxRate: 1,
    cache,
    forceRefresh: true,
  });
  assert.equal(second.tokens.length, 0);
  assert.ok(!second.errors.some((e) => e.includes("[CACHED_EMPTY]")), "forceRefresh must bypass the empty cache");
  assert.ok(balanceCalls >= 1, "forceRefresh must call getBalance for fresh scan");
  assert.ok(tokenAccountCalls >= 1, "forceRefresh must call getTokenAccountsByOwner for full scan");
});
