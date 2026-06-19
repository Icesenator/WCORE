// Run: node --import tsx --test packages/core/src/engines/evm.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getEvmWalletAssets, getEvmWalletsAssets } from "./evm.js";
import type { RpcCallOptions } from "../rpc/index.js";
import { MemoryPricingCache, type PricingSourceSet } from "../pricing/index.js";
import type { DiscoveredToken, TokenDiscovery } from "../tokens/index.js";

const OWNER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const CUSTOM = "0x9999999999999999999999999999999999999999";

test("getEvmWalletAssets uses injected TokenDiscovery instead of a local allowlist", async () => {
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [
        {
          contract: CUSTOM,
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 6,
        },
      ];
    },
  };

  const dispatcher = {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
      __serialize?: (v: T) => string,
    ) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };

  const rpc = {
    async getBalance(): Promise<bigint> {
      return 0n;
    },
    async ethCall(_endpoint: string, to: string): Promise<string> {
      assert.equal(to, CUSTOM);
      return "0x" + 1_500_000n.toString(16).padStart(64, "0");
    },
  };

  const sources: PricingSourceSet = {
    defillama: {
      getTokenPriceUsd: async () => null,
      getNativePriceUsd: async () => null,
    },
    dexscreener: {
      getTokenPriceUsd: async () => 2,
    },
    geckoterminal: {
      getTokenPriceUsd: async () => null,
    },
    coingecko: {
      getNativePriceUsd: async () => null,
      getTokenPriceUsd: async () => null,
    },
    jupiter: {
      getTokenPriceUsd: async () => null,
    },
    onchainV3: {
      getTokenPriceUsd: async () => null,
    },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    fxRate: 1,
  });

  assert.deepEqual(result.tokens.map((token) => token.symbol), ["MOCK"]);
  assert.equal(result.tokens[0]?.balance, 1.5);
  assert.equal(result.tokens[0]?.valueEur, 3);

  // Phases are populated and consistent with scanMs.
  assert.ok(result.phases, "phases should be populated");
  const phaseSum = result.phases!.nativeMs + result.phases!.discoveryMs + result.phases!.balancesMs + result.phases!.pricingMs;
  assert.ok(result.scanMs >= 0, "scanMs >= 0");
  assert.ok(phaseSum <= result.scanMs + 50, `phase sum (${phaseSum}) must not exceed scanMs (${result.scanMs}) by more than overhead`);
});

test("getEvmWalletAssets forceRefresh bypasses stale shared price cache", async () => {
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CUSTOM, symbol: "MOCK", name: "Mock Token", decimals: 6 }];
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async ethCall(): Promise<string> { return "0x" + 1_000_000n.toString(16).padStart(64, "0"); },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => 2 },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const priceCache = new MemoryPricingCache();
  await priceCache.setPrice(`base:${CUSTOM}`, { priceEur: 9, ts: Date.now(), source: "poisoned-cache" });

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    sharedPriceCache: priceCache,
    fxRate: 1,
    forceRefresh: true,
  });

  assert.equal(result.tokens[0]?.priceEur, 2);
  assert.equal(result.tokens[0]?.valueEur, 2);
});

test("getEvmWalletAssets strictTokens scans only provided custom tokens", async () => {
  const DISCOVERED = "0x8888888888888888888888888888888888888888";
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: DISCOVERED, symbol: "DISC", name: "Discovered Token", decimals: 6 }];
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async ethCall(_endpoint: string, to: string): Promise<string> {
      if (to.toLowerCase() === CUSTOM) return "0x" + 1_000_000n.toString(16).padStart(64, "0");
      if (to.toLowerCase() === DISCOVERED) return "0x" + 2_000_000n.toString(16).padStart(64, "0");
      return "0x";
    },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => 1 },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    customTokens: [CUSTOM],
    strictTokens: true,
    sharedPriceCache: new MemoryPricingCache(),
    fxRate: 1,
  } as never);

  assert.deepEqual(result.tokens.map((token) => token.contract), [CUSTOM]);
});

test("getEvmWalletAssets preserves sub-cent token prices", async () => {
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CUSTOM, symbol: "MICRO", name: "Micro Token", decimals: 6 }];
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async ethCall(): Promise<string> { return "0x" + 1_000_000n.toString(16).padStart(64, "0"); },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => 0.0000075 },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    sharedPriceCache: new MemoryPricingCache(),
    fxRate: 1,
  });

  assert.equal(result.tokens[0]?.priceEur, 0.0000075);
});

test("getEvmWalletAssets forceRefresh keeps current-run GT bulk prices", async () => {
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CUSTOM, symbol: "MICRO", name: "Micro Token", decimals: 6 }];
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async ethCall(): Promise<string> { return "0x" + 1_000_000n.toString(16).padStart(64, "0"); },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null, batchTokenPrices: async () => new Map() },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => { throw new Error("must use current-run bulk price"); }, batchTokenPrices: async () => new Map([[CUSTOM, 0.0000075]]) },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => 0.1 },
  };
  const priceCache = new MemoryPricingCache();
  await priceCache.setPrice(`base:${CUSTOM}`, { priceEur: 9, ts: Date.now(), source: "poisoned-cache" });

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    sharedPriceCache: priceCache,
    fxRate: 1,
    forceRefresh: true,
  });

  assert.equal(result.tokens[0]?.priceEur, 0.0000075);
});

test("getEvmWalletAssets serves negative cache after native liveness confirms empty wallet/chain", async () => {
  const emptyDiscovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [];
    },
  };

  let nativeCalls = 0;
  const dispatcher = {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
    ) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };

  const rpc = {
    async getBalance(): Promise<bigint> {
      nativeCalls += 1;
      return 0n;
    },
    async ethCall(): Promise<string> {
      return "0x";
    },
  };

  // Provide a realistic native price so the scan produces zero errors.
  // In production, ETH/native prices almost always resolve; a "no_price"
  // error on a truly empty wallet is a pricing artifact, not a scan failure.
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 3000 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const cache = {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) { store.delete(key); return undefined; }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async add<T>(key: string, value: T, ttlMs: number): Promise<boolean> {
      const e = store.get(key);
      if (e && e.expiresAt >= Date.now()) return false;
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async delete(key: string): Promise<void> { store.delete(key); },
    async clear(): Promise<void> { store.clear(); },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
      return keys.map((key) => {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt < Date.now()) { store.delete(key); return undefined; }
        return entry.value as T;
      });
    },
  };

  const opts = {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: emptyDiscovery,
    fxRate: 1,
    cache,
  };

  const first = await getEvmWalletAssets(OWNER, "base", opts);
  assert.equal(first.tokens.length, 0);
  assert.equal(first.native.balance, 0);
  assert.equal(first.errors.length, 0, "clean scan should have no errors");
  assert.equal(nativeCalls, 1, "first call should hit RPC");

  const second = await getEvmWalletAssets(OWNER, "base", opts);
  assert.equal(second.tokens.length, 0);
  assert.equal(second.native.balance, 0);
  assert.ok(second.errors.some((e) => e.includes("CACHED_EMPTY")), "second call should be cache hit");
  assert.equal(nativeCalls, 2, "second call should verify native liveness before serving empty cache");
});

test("getEvmWalletAssets forceRefresh bypasses the empty cache for a fresh re-scan", async () => {
  const emptyDiscovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [];
    },
  };

  let nativeCalls = 0;
  const dispatcher = {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
    ) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };

  const rpc = {
    async getBalance(): Promise<bigint> {
      nativeCalls += 1;
      return 0n;
    },
    async ethCall(): Promise<string> {
      return "0x";
    },
  };

  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 3000 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const cache = {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) { store.delete(key); return undefined; }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async add<T>(key: string, value: T, ttlMs: number): Promise<boolean> {
      const e = store.get(key);
      if (e && e.expiresAt >= Date.now()) return false;
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async delete(key: string): Promise<void> { store.delete(key); },
    async clear(): Promise<void> { store.clear(); },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
      return keys.map((key) => {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt < Date.now()) { store.delete(key); return undefined; }
        return entry.value as T;
      });
    },
  };

  // First scan: empty wallet, writes negative cache
  const opts = {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: emptyDiscovery,
    fxRate: 1,
    cache,
  };

  const first = await getEvmWalletAssets(OWNER, "base", opts);
  assert.equal(first.tokens.length, 0);
  assert.equal(first.errors.length, 0, "clean scan should have no errors");
  assert.equal(nativeCalls, 1);

  // Second scan with forceRefresh: must bypass negative cache and hit RPC
  const forceOpts = { ...opts, forceRefresh: true };
  const third = await getEvmWalletAssets(OWNER, "base", forceOpts);
  assert.equal(third.tokens.length, 0);
  assert.equal(nativeCalls, 2, "forceRefresh must call RPC again, skipping empty cache");
});

test("getEvmWalletAssets scans user custom tokens even when discovery is empty", async () => {
  const custom = "0x8888888888888888888888888888888888888888";
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [];
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(_endpoint: string, to: string): Promise<string> {
      assert.equal(to, custom);
      return "0x" + 2_000_000_000_000_000_000n.toString(16).padStart(64, "0");
    },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => 3 },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    customTokens: [custom],
    fxRate: 1,
  });

  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0]?.contract, custom);
  assert.equal(result.tokens[0]?.balance, 2);
  assert.equal(result.tokens[0]?.valueEur, 6);
});

test("getEvmWalletAssets does not use cached native balance after a consensus zero", async () => {
  const discovery: TokenDiscovery = { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string, opts: RpcCallOptions) => Promise<T>) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async ethCall(): Promise<string> { return "0x"; },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const store = new Map<string, unknown>([[`native:base:${OWNER}`, { balance: "1000000000000000000" }]]);
  const cache = {
    async get<T>(key: string): Promise<T | undefined> { return store.get(key) as T | undefined; },
    async set<T>(key: string, value: T): Promise<void> { store.set(key, value); },
    async delete(key: string): Promise<void> { store.delete(key); },
    async clear(): Promise<void> { store.clear(); },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> { return keys.map((k) => store.get(k) as T | undefined); },
    async add<T>(key: string, value: T): Promise<boolean> { if (store.has(key)) return false; store.set(key, value); return true; },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    cache,
    fxRate: 1,
  });

  assert.equal(result.native.balance, 0);
  assert.equal(result.native.valueEur, 0);
  assert.ok(!result.errors.some((e) => e.includes("cached fallback")));
  const cached = store.get(`native:base:${OWNER}`) as { balance: string } | undefined;
  assert.equal(cached?.balance, "0");
});

test("getEvmWalletAssets reads per-token balance fallbacks concurrently when multicall misses", async () => {
  const contracts = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ];
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return contracts.map((contract, index) => ({
        contract,
        symbol: `T${index}`,
        name: `Token ${index}`,
        decimals: 18,
      }));
    },
  };

  let activeBalanceReads = 0;
  let maxActiveBalanceReads = 0;
  const dispatcher = {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
    ) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> {
      return 0n;
    },
    async call(): Promise<string> {
      return "0x";
    },
    async ethCall(): Promise<string> {
      activeBalanceReads += 1;
      maxActiveBalanceReads = Math.max(maxActiveBalanceReads, activeBalanceReads);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeBalanceReads -= 1;
      return "0x" + 1_000_000_000_000_000_000n.toString(16).padStart(64, "0");
    },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => 1 },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    fxRate: 1,
  });

  assert.equal(maxActiveBalanceReads, contracts.length);
  assert.equal(result.tokens.length, contracts.length);
});

// --- Integration tests for resolveBalance() in readNativeBalance / readErc20Balance ---

// Creates a dispatcher mock that returns realistic `attempts` arrays (not empty).
// The actual `call` function from dispatcher.run is invoked per attempt, which means
// getBalance → rpc.getBalance, blockNumber → rpc.blockNumber, ethCall → rpc.ethCall.
function mockDispatcherWithAttempts(
  spec: Array<{ endpoint: string; ok: boolean; error?: string }>,
) {
  return {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
      _serialize?: (v: T) => string,
    ) {
      const resolved = await Promise.all(spec.map(async (a) => {
        try {
          if (a.ok) {
            const raw = await call(a.endpoint, {} as RpcCallOptions);
            const value = _serialize ? _serialize(raw) : String(raw);
            return { ok: true, value, endpoint: a.endpoint };
          }
          return { ok: false, endpoint: a.endpoint, error: a.error ?? "fetch-failed" };
        } catch (_e: unknown) {
          return { ok: false, endpoint: a.endpoint, error: String((_e as Error)?.message ?? "fetch-failed") };
        }
      }));
      const okValues = resolved.filter((a) => a.ok && a.value != null);
      const consensus = okValues.length >= 2 && okValues.every((a) => a.value === okValues[0]?.value);
      const value = consensus ? (okValues[0]?.value ?? null) : null;
      return {
        consensus,
        value,
        votes: okValues.length,
        total: spec.length,
        attempts: resolved,
      };
    },
  };
}

function makeCacheStore(store: Map<string, unknown>) {
  return {
    async get<T>(key: string): Promise<T | undefined> { return store.get(key) as T | undefined; },
    async set<T>(key: string, value: T): Promise<void> { store.set(key, value); },
    async delete(key: string): Promise<void> { store.delete(key); },
    async clear(): Promise<void> { store.clear(); },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> { return keys.map((k) => store.get(k) as T | undefined); },
    async add<T>(key: string, value: T): Promise<boolean> { if (store.has(key)) return false; store.set(key, value); return true; },
  };
}

function makeNativeSources(nativePrice: number | null): PricingSourceSet {
  return {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => nativePrice },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
}

function word(hex: string): string {
  return hex.replace(/^0x/i, "").padStart(64, "0");
}

function encodeSingleMulticallResult(raw: bigint): string {
  return "0x"
    + word("20") // offset to result array
    + word("1") // array length
    + word("20") // offset to first tuple after array heads
    + word("1") // success=true
    + word("40") // offset to returnData bytes within tuple
    + word("20") // bytes length = 32
    + word(raw.toString(16));
}

test("readNativeBalance: consensus RPC beats stale cache", async () => {
  const ETH_100 = 100_000_000_000_000_000_000n;
  const STALE_ETH_50 = 50_000_000_000_000_000_000n;

  const discovery: TokenDiscovery = { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } };

  let getBalanceCallCount = 0;
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
    { endpoint: "https://rpc3.example", ok: true },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { getBalanceCallCount++; return ETH_100; },
    async ethCall(): Promise<string> { return "0x"; },
    async call(): Promise<string> { return "0x"; },
  };

  // Stale cache: 48h old, 50 ETH → age > 24h → confidence capped at 0.25
  // Consensus RPC 100 ETH with confidence 0.9 → resolveBalance picks live_consensus
  const store = new Map<string, unknown>([[
    `native:base:${OWNER}`,
    { balance: STALE_ETH_50.toString(), ts: Date.now() - 48 * 60 * 60 * 1000, confidence: 0.8 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(3000),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  // Native balance = 100 ETH (RPC consensus wins over stale 50 ETH cache)
  assert.equal(result.native.balance, 100);
  assert.equal(result.native.valueEur, 300_000);
  assert.ok(!result.errors.some((e) => e.includes("[DEGRADED]")), "should not be degraded when RPC consensus is clean");
  assert.equal(getBalanceCallCount, 3, "all 3 RPCs should be called for getBalance");
});

test("readNativeBalance: RPC all-fail + fresh cache returns degraded fallback", async () => {
  const CACHED_ETH = 50_000_000_000_000_000_000n;

  const discovery: TokenDiscovery = { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } };

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: false, error: "connection-refused" },
    { endpoint: "https://rpc2.example", ok: false, error: "timeout" },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { throw new Error("connection-refused"); },
    async call(): Promise<string> { return "0x"; },
  };

  // Fresh cache: 5 min old, 50 ETH, confidence 0.8 → resolveBalance returns cache_fallback_live_failed
  const store = new Map<string, unknown>([[
    `native:base:${OWNER}`,
    { balance: CACHED_ETH.toString(), ts: Date.now() - 5 * 60 * 1000, confidence: 0.8 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(3000),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  // Native balance = 50 ETH (cache fallback since RPCs all failed)
  assert.equal(result.native.balance, 50);
  assert.ok(result.errors.some((e) => e.includes("[DEGRADED]")), "should be degraded when RPCs fail");
  assert.ok(result.errors.some((e) => e.includes("cache_fallback_live_failed")), "reason should be cache_fallback_live_failed");
});

test("readErc20Balance: consensus RPC beats stale token cache", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const TOKEN_BALANCE_WEI = 1_000_000_000_000_000_000n; // 1 token (18 decimals)
  const STALE_BALANCE_WEI = 100_000_000_000_000_000n; // 0.1 token (18 decimals)

  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CONTRACT, symbol: "TST", name: "Test Token", decimals: 18 }];
    },
  };

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async blockNumber(): Promise<number> { return 20_000_000; },
    // Multicall returns 0x → triggers per-token fallback
    async call(): Promise<string> { return "0x"; },
    // Per-token ethCall returns consensus balance
    async ethCall(): Promise<string> {
      return "0x" + TOKEN_BALANCE_WEI.toString(16).padStart(64, "0");
    },
  };

  // Stale cache: 48h old, 0.1 token → age > 24h → confidence capped at 0.25
  const store = new Map<string, unknown>([[
    `token:base:${CONTRACT.toLowerCase()}:${OWNER}`,
    { balance: STALE_BALANCE_WEI.toString(), ts: Date.now() - 48 * 60 * 60 * 1000, confidence: 0.8 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  // Token balance = 1 (consensus RPC wins over stale 0.1 cache)
  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0]?.symbol, "TST");
  assert.equal(result.tokens[0]?.balance, 1);
});

test("readErc20Balance: RPC consensus failure preserves fresh token cache", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const TOKEN_BALANCE_WEI = 1_000_000_000_000_000_000n;

  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CONTRACT, symbol: "TST", name: "Test Token", decimals: 18 }];
    },
  };

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: false, error: "timeout" },
    { endpoint: "https://rpc2.example", ok: false, error: "fetch failed" },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { throw new Error("timeout"); },
    async call(): Promise<string> { throw new Error("timeout"); },
    async ethCall(): Promise<string> { throw new Error("timeout"); },
  };

  const store = new Map<string, unknown>([[
    `token:base:${CONTRACT.toLowerCase()}:${OWNER}`,
    { balance: TOKEN_BALANCE_WEI.toString(), ts: Date.now() - 5 * 60 * 1000, source: "rpc", confidence: 1 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0]?.balance, 1);
  assert.ok(result.errors.some((e) => e.includes("[DEGRADED]") && e.includes("cache_fallback_live_failed")));
});

test("readErc20Balance: confirmed zero overwrites positive token cache", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const TOKEN_BALANCE_WEI = 1_000_000_000_000_000_000n;

  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CONTRACT, symbol: "TST", name: "Test Token", decimals: 18 }];
    },
  };

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async blockNumber(): Promise<number> { return 20_000_000; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x" + "0".repeat(64); },
  };

  const tokenCacheKey = `token:base:${CONTRACT.toLowerCase()}:${OWNER}`;
  const store = new Map<string, unknown>([[
    tokenCacheKey,
    { balance: TOKEN_BALANCE_WEI.toString(), ts: Date.now(), source: "rpc", confidence: 1 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  assert.equal(result.tokens.length, 0);
  const cached = store.get(tokenCacheKey) as { balance: string } | undefined;
  assert.equal(cached?.balance, "0");
});

test("multicall confirmed zero overwrites positive token cache", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CONTRACT, symbol: "TST", name: "Test Token", decimals: 18 }];
    },
  };

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async blockNumber(): Promise<number> { return 20_000_000; },
    async call(): Promise<string> { return encodeSingleMulticallResult(0n); },
    async ethCall(): Promise<string> { throw new Error("ethCall fallback should not run"); },
  };

  const tokenCacheKey = `token:base:${CONTRACT.toLowerCase()}:${OWNER}`;
  const store = new Map<string, unknown>([[
    tokenCacheKey,
    { balance: 1_000_000_000_000_000_000n.toString(), ts: Date.now(), source: "rpc", confidence: 1 },
  ]]);

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  assert.equal(result.tokens.length, 0);
  const cached = store.get(tokenCacheKey) as { balance: string } | undefined;
  assert.equal(cached?.balance, "0");
});

test("readErc20Balance: non-ERC20 all-revert → token skipped", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";

  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CONTRACT, symbol: "NOPE", name: "Not An ERC20", decimals: 18 }];
    },
  };

  // All RPCs revert → non_erc20_revert → token skipped
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async blockNumber(): Promise<number> { return 20_000_000; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { throw new Error("execution reverted"); },
  };

  const store = new Map<string, unknown>();

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: discovery,
    cache: makeCacheStore(store),
    fxRate: 1,
  });

  // Token should be skipped (not in results), skip cache written
  assert.equal(result.tokens.length, 0, "non-ERC20 token should be skipped");
  const skipKey = `meta:skip:base:${CONTRACT.toLowerCase()}`;
  assert.ok(store.has(skipKey), "skip cache should be written for non-ERC20");
});

// ─── getEvmWalletsAssets (multi-wallet batch) tests ──────────────────────────

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("getEvmWalletsAssets: negative cache hit uses native liveness before serving cached empty", async () => {
  const store = new Map<string, unknown>([
    [`empty:base:${WALLET_A.toLowerCase()}`, { chain: "base", chainName: "Base", nativeSymbol: "ETH" }],
  ]);
  const cache = makeCacheStore(store);

  let blockNumberCalls = 0;
  let discoveryCalls = 0;
  let nativeCalls = 0;
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { blockNumberCalls++; return 20_000_000; },
    async getBalance(): Promise<bigint> { nativeCalls++; return 0n; },
    async getLogs(): Promise<any[]> { discoveryCalls++; return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    fxRate: 1,
  });

  assert.equal(result.wallets.length, 1);
  assert.equal(result.wallets[0]!.address, WALLET_A);
  assert.ok(result.wallets[0]!.assets.errors.some((e: string) => e.includes("CACHED_EMPTY")), "should have CACHED_EMPTY error");
  assert.equal(result.wallets[0]!.assets.tokens.length, 0, "no tokens for empty wallet");
  assert.equal(result.wallets[0]!.assets.native.balance, 0);
  assert.equal(result.wallets[0]!.assets.totalValueEur, 0);
  assert.equal(result.cacheStats.hits, 1, "cacheStats should count the hit");
  assert.equal(nativeCalls, 1, "negative cache must verify native liveness once");
  // blockNumber is called once for getRecentLogRange (before discovery loop)
  assert.equal(blockNumberCalls, 1);
  // discovery should NOT run for the negative-cache wallet
  assert.equal(discoveryCalls, 0, "discovery should be skipped for cached-empty wallet");
});

test("getEvmWalletsAssets: negative cache is bypassed when native liveness detects funds", async () => {
  const store = new Map<string, unknown>([
    [`empty:base:${WALLET_A.toLowerCase()}`, { chain: "base", chainName: "Base", nativeSymbol: "ETH" }],
  ]);
  const cache = makeCacheStore(store);

  let nativeCalls = 0;
  let discoveryCalls = 0;
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { nativeCalls++; return 1_000_000_000_000_000_000n; },
    async getLogs(): Promise<any[]> { discoveryCalls++; return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(3000),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { discoveryCalls++; return []; } },
    fxRate: 1,
  });

  const wallet = result.wallets[0]!;
  assert.equal(wallet.assets.native.balance, 1);
  assert.equal(wallet.assets.native.valueEur, 3000);
  assert.ok(!wallet.assets.errors.some((e: string) => e.includes("CACHED_EMPTY")), "funded wallet must not be served from empty cache");
  assert.ok(nativeCalls >= 1, "native liveness must hit RPC");
  assert.equal(discoveryCalls, 1, "discovery should run after empty cache is bypassed");
});

test("getEvmWalletsAssets: multiple wallets — negative cache + active discovery mixed", async () => {
  // Wallet A: negative cache hit → skips RPC
  // Wallet B: no cache → runs discovery (mock returns empty)
  const store = new Map<string, unknown>([
    [`empty:base:${WALLET_A.toLowerCase()}`, { chain: "base", chainName: "Base", nativeSymbol: "ETH" }],
  ]);
  const cache = makeCacheStore(store);

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 0n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };

  const result = await getEvmWalletsAssets([WALLET_A, WALLET_B], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    fxRate: 1,
  });

  assert.equal(result.wallets.length, 2);

  // Wallet A: negative cache hit
  const walletA = result.wallets.find((w) => w.address === WALLET_A)!;
  assert.ok(walletA, "wallet A should be present");
  assert.ok(walletA.assets.errors.some((e: string) => e.includes("CACHED_EMPTY")), "wallet A should be CACHED_EMPTY");
  assert.equal(walletA.assets.tokens.length, 0);
  assert.equal(walletA.assets.totalValueEur, 0);

  // Wallet B: active scan (discovery returned empty → no tokens, native=0)
  const walletB = result.wallets.find((w) => w.address === WALLET_B)!;
  assert.ok(walletB, "wallet B should be present");
  assert.equal(walletB.assets.tokens.length, 0);
  assert.equal(walletB.assets.native.balance, 0);

  // Both wallets should have different error arrays (not shared)
  assert.ok(walletA.assets.errors.length > 0, "wallet A should have errors");
  // Wallet B errors should NOT contain CACHED_EMPTY
  assert.ok(!walletB.assets.errors.some((e: string) => e.includes("CACHED_EMPTY")), "wallet B should not have CACHED_EMPTY");

  assert.equal(result.cacheStats.hits, 1, "one cache hit from wallet A");
});

test("getEvmWalletsAssets: custom tokens added to results even when discovery is empty", async () => {
  // No cached tokens, but customTokens are provided → they go into activeTokenMap
  // Discovery mock returns empty, but custom token should still appear in results
  const CUSTOM = "0x9999999999999999999999999999999999999999";
  const store = new Map<string, unknown>();
  const cache = makeCacheStore(store);

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 0n; },
    async getLogs(): Promise<any[]> { return []; },
    // Multicall3 returns 0 balance for the custom token → falls through to ethCall
    async call(): Promise<string> { return "0x"; },
    // Per-token ethCall returns 1 token balance for the custom contract
    async ethCall(_endpoint: string, to: string): Promise<string> {
      if (to.toLowerCase() === CUSTOM.toLowerCase()) {
        return "0x" + 1_000_000_000_000_000_000n.toString(16).padStart(64, "0");
      }
      return "0x";
    },
    async batch(): Promise<any[]> { return []; },
  };

  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => 42, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    customTokens: [CUSTOM],
    sources,
    sharedPriceCache: new MemoryPricingCache(), // fresh cache — isolate from other tests
    fxRate: 1,
  });

  assert.equal(result.wallets.length, 1);
  // Custom token should appear in results even though discovery returned empty
  const wallet = result.wallets[0]!;
  const customToken = wallet.assets.tokens.find((t) => t.contract.toLowerCase() === CUSTOM.toLowerCase());
  assert.ok(customToken, "custom token should be in results");
  assert.equal(customToken!.balance, 1);
  // Price comes from DefiLlama mock (42 USD * 1 fxRate = 42 EUR)
  assert.equal(customToken!.priceEur, 42);
  assert.equal(customToken!.valueEur, 42);
});

test("getEvmWalletAssets bulk pre-fetches GT prices before per-token cascade", async () => {
  const contracts = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  ];
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return contracts.map((contract, index) => ({
        contract,
        symbol: `T${index}`,
        name: `Token ${index}`,
        decimals: 18,
      }));
    },
  };

  let batchCalled = false;
  let batchContracts: string[] = [];
  let gtPerTokenCalls = 0;
  const dispatcher = {
    async run<T>(
      _endpoints: ReadonlyArray<string>,
      call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
    ) {
      const value = await call("https://rpc.example", {});
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> {
      return "0x" + 1_000_000_000_000_000_000n.toString(16).padStart(64, "0");
    },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: {
      async batchTokenPrices(_network: string, c: string[]): Promise<Map<string, number>> {
        batchCalled = true;
        batchContracts = c;
        const map = new Map<string, number>();
        for (const addr of c) map.set(addr.toLowerCase(), 2);
        return map;
      },
      async getTokenPriceUsd(): Promise<null> {
        gtPerTokenCalls++;
        return null;
      },
    },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  } as PricingSourceSet;

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    fxRate: 1,
  });

  assert.equal(batchCalled, true, "batchTokenPrices should be called");
  assert.equal(batchContracts.length, 2);
  assert.equal(result.tokens.length, 2);
  // Per-token GT calls should be skipped thanks to bulk pre-fetch cache population
  assert.equal(gtPerTokenCalls, 0, "per-token GT should not be called after bulk pre-fetch");
});

test("getEvmWalletsAssets: forceRefresh keeps current-run GT bulk prices", async () => {
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: CUSTOM, symbol: "MICRO", name: "Micro Token", decimals: 6 }];
    },
  };
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 0n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> {
      return "0x" + 1_000_000n.toString(16).padStart(64, "0");
    },
    async batch(): Promise<any[]> { return []; },
  };
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null, batchTokenPrices: async () => new Map() },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: {
      getTokenPriceUsd: async () => { throw new Error("must use current-run bulk price"); },
      batchTokenPrices: async () => new Map([[CUSTOM, 0.0000075]]),
    },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => 0.1 },
  };
  const priceCache = new MemoryPricingCache();
  await priceCache.setPrice(`base:${CUSTOM}`, { priceEur: 9, ts: Date.now(), source: "poisoned-cache" });

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources,
    tokenDiscovery: discovery,
    sharedPriceCache: priceCache,
    fxRate: 1,
    forceRefresh: true,
  });

  assert.equal(result.wallets[0]?.assets.tokens[0]?.priceEur, 0.0000075);
});

test("getEvmWalletsAssets: forceRefresh native price falls back to stale cache", async () => {
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 1_000_000_000_000_000_000n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };
  const priceCache = new MemoryPricingCache();
  priceCache.setPrice("native@base", { priceEur: 1500, ts: Date.now() - 2 * 60 * 60 * 1000, source: "llama-native" });

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    tokenDiscovery: { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } },
    sharedPriceCache: priceCache,
    fxRate: 1,
    forceRefresh: true,
  });

  assert.equal(result.wallets[0]?.assets.native.priceEur, 1500);
  assert.equal(result.wallets[0]?.assets.native.valueEur, 1500);
});

test("getEvmWalletsAssets: skips native precompile tokens", async () => {
  const nativePrecompiles = [
    { chain: "polygon", contract: "0x0000000000000000000000000000000000001010" },
    { chain: "celo", contract: "0x471ece3750da237f93b8e339c536989b8978a438" },
  ];
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  for (const item of nativePrecompiles) {
    const rpc = {
      async blockNumber(): Promise<number> { return 20_000_000; },
      async getBalance(): Promise<bigint> { return 59_000_000_000_000_000_000n; },
      async getLogs(): Promise<any[]> { return []; },
      async call(): Promise<string> { return "0x"; },
      async ethCall(_endpoint: string, to: string): Promise<string> {
        if (to.toLowerCase() === item.contract) {
          return "0x" + 59_000_000_000_000_000_000n.toString(16).padStart(64, "0");
        }
        return "0x";
      },
      async batch(): Promise<any[]> { return []; },
    };

    const result = await getEvmWalletsAssets([WALLET_A], item.chain, {
      dispatcher: dispatcher as never,
      rpc: rpc as never,
      sources: makeNativeSources(0.07),
      tokenDiscovery: {
        async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
          return [{ contract: item.contract, symbol: "NATIVE", name: "Native", decimals: 18 }];
        },
      },
      sharedPriceCache: new MemoryPricingCache(),
      fxRate: 1,
    });

    assert.equal(result.wallets[0]?.assets.native.balance, 59);
    assert.equal(result.wallets[0]?.assets.tokens.some((t) => t.contract.toLowerCase() === item.contract), false);
  }
});

// ─── P0-4/P0-5 regression tests — batch native-only + bal_cache v2 ──────────

test("getEvmWalletsAssets: batch EVM native-only — wallet without tokens still reads native balance", async () => {
  const store = new Map<string, unknown>();
  const cache = makeCacheStore(store);
  // Fresh pricing cache to avoid pollution from other tests (module-level sharedPriceCache)
  const pricingCache = new MemoryPricingCache();

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  let ethCallCount = 0;
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 1_000_000_000_000_000_000n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { ethCallCount++; return "0x"; },
    async ethCall(): Promise<string> { ethCallCount++; return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(3000),
    sharedPriceCache: pricingCache,
    tokenDiscovery: { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } },
    fxRate: 1,
  });

  assert.equal(result.wallets.length, 1);
  const wallet = result.wallets[0]!;
  assert.equal(wallet.assets.native.balance, 1);
  assert.equal(wallet.assets.native.valueEur, 3000);
  assert.equal(wallet.assets.tokens.length, 0);
  assert.ok(!wallet.assets.errors.some((e: string) => e.includes("[DEGRADED]")), "should not be degraded");
  assert.equal(ethCallCount, 0, "should not call ethCall for empty token list");
});

test("getEvmWalletsAssets: batch EVM respects DISABLE_NATIVE_BALANCE", async () => {
  const store = new Map<string, unknown>();
  const cache = makeCacheStore(store);
  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);

  let nativeCalls = 0;
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { nativeCalls++; return 424242424242424242424242424242n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
    async batch(): Promise<any[]> { return []; },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "TEMPO", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(null),
    sharedPriceCache: new MemoryPricingCache(),
    tokenDiscovery: { async discoverTokensForWallet(): Promise<DiscoveredToken[]> { return []; } },
    fxRate: 1,
  });

  const wallet = result.wallets[0]!;
  assert.equal(nativeCalls, 0, "native balance RPC must not run when disabled by chain flag");
  assert.equal(wallet.assets.native.balance, 0);
  assert.equal(wallet.assets.tokens.length, 0);
});

test("getEvmWalletAssets (single): bal_cache v2 — cross-read from batch written cache", async () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const NATIVE_WEI = 500_000_000_000_000_000n;  // 0.5 ETH (18 decimals)

  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return []; // bal_cache v2 provides all data — no new tokens needed
    },
  };

  // Simulate batch-written bal_cache in the format the single-wallet path expects:
  // nativeBalance = wei string, tokens[].balance = formatted number string.
  // The single path reads nativeBalance as BigInt and formats with chain's NATIVE_DECIMALS.
  const store = new Map<string, unknown>([[
    `bal_cache:base:${OWNER}`,
    {
      nativeBalance: NATIVE_WEI.toString(),
      nativePriceEur: null,
      tokens: [
        { contract: CONTRACT, balance: "1", decimals: 6, symbol: "TST", name: "Test", priceEur: null },
      ],
      block: 20_000_000,
      ts: Date.now() - 30_000,
    },
  ]]);
  const cache = makeCacheStore(store);

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc1.example", ok: true },
    { endpoint: "https://rpc2.example", ok: true },
  ]);
  const rpc = {
    async getBalance(): Promise<bigint> { return 0n; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(): Promise<string> { return "0x"; },
  };

  const result = await getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: makeNativeSources(3000),
    tokenDiscovery: discovery,
    cache,
    fxRate: 1,
  });

  // bal_cache v2 should provide native balance from nativeBalance string (wei) + chain NATIVE_DECIMALS
  assert.equal(result.native.balance, 0.5, "0.5 ETH from cached nativeBalance");
  // Token should have 1.0 balance (formatted string "1" from cache)
  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0]?.balance, 1);
  // bal_cache shortcut activated (native RPC runs in parallel — unavoidable)
  assert.ok(result.errors.some((e: string) => e.includes("[BAL_CACHE]")), "should have BAL_CACHE marker");
});

test("getEvmWalletsAssets: batch path resolves a logoUrl for tokens discovered without one", async () => {
  // Regression: the batch engine (multi-wallet scan, used by the wallet results
  // table) passed token.logoUrl straight through without resolving a fallback,
  // unlike the single-wallet path. Tokens discovered via log scanning (no logoUrl)
  // reached the frontend with logoUrl=undefined → blank colored circle even for
  // well-known tokens. The batch path must resolve a fallback logo like the
  // single-wallet path does.
  const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // real USDC on Base (TrustWallet-indexed)
  const store = new Map<string, unknown>();
  const cache = makeCacheStore(store);

  const dispatcher = mockDispatcherWithAttempts([
    { endpoint: "https://rpc.example", ok: true },
  ]);
  const rpc = {
    async blockNumber(): Promise<number> { return 20_000_000; },
    async getBalance(): Promise<bigint> { return 0n; },
    async getLogs(): Promise<any[]> { return []; },
    async call(): Promise<string> { return "0x"; },
    async ethCall(_endpoint: string, to: string): Promise<string> {
      if (to.toLowerCase() === USDC_BASE.toLowerCase()) {
        return "0x" + 1_000_000_000_000_000_000n.toString(16).padStart(64, "0");
      }
      return "0x";
    },
    async batch(): Promise<any[]> { return []; },
  };

  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => 1, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  // Discovery returns a token WITHOUT a logoUrl (simulates log-scan discovery).
  const discovery: TokenDiscovery = {
    async discoverTokensForWallet(): Promise<DiscoveredToken[]> {
      return [{ contract: USDC_BASE, symbol: "USDC", name: "USD Coin", decimals: 18 }];
    },
  };

  const result = await getEvmWalletsAssets([WALLET_A], "base", {
    cache,
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    tokenDiscovery: discovery,
    sources,
    sharedPriceCache: new MemoryPricingCache(),
    fxRate: 1,
  });

  const wallet = result.wallets[0]!;
  const token = wallet.assets.tokens.find((t) => t.contract.toLowerCase() === USDC_BASE.toLowerCase());
  assert.ok(token, "USDC token should be in results");
  assert.ok(
    token!.logoUrl && token!.logoUrl.length > 0,
    `batch path must resolve a fallback logoUrl, got: ${JSON.stringify(token!.logoUrl)}`,
  );
});

test("registry tokens do not use broken spothq SVG logos for major assets", async () => {
  // Regression: registry LOGO() pointed at spothq cryptocurrency-icons SVGs which
  // render naturalWidth=0 in browsers for USDC/USDT/WETH/WBTC/ARB → blank circle.
  // Registry entries for major tokens must either omit logoUrl (so the resolver
  // falls back to CMC/TrustWallet) or use a non-spothq URL.
  const { TOKEN_REGISTRY } = await import("../tokens/registry.js");
  const offenders: string[] = [];
  for (const [chain, tokens] of Object.entries(TOKEN_REGISTRY)) {
    for (const t of tokens) {
      if (t.logoUrl && t.logoUrl.includes("spothq/cryptocurrency-icons")) {
        offenders.push(`${chain}:${t.symbol}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `registry tokens still using broken spothq SVG logos: ${offenders.join(", ")}`);
});

