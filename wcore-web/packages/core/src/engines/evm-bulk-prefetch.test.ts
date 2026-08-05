import { test } from "node:test";
import assert from "node:assert/strict";
import { getEvmWalletAssets } from "./evm-scan.js";
import { MemoryPricingCache } from "../pricing/index.js";

const OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const TOKEN = "0x1111111111111111111111111111111111111111";

/** Discovery, dispatcher and RPC stubs that give the scan one token with a balance. */
function scanHarness(batches: {
  onLlama: () => Promise<Map<string, number>>;
  onGt: () => Promise<Map<string, number>>;
}, priceCache: MemoryPricingCache) {
  const discovery = {
    async discoverTokensForWallet() {
      return [{ contract: TOKEN, symbol: "TKN", name: "Token", decimals: 18 }];
    },
  };
  const dispatcher = {
    async run<T>(_e: ReadonlyArray<string>, call: (endpoint: string, opts: unknown) => Promise<T>) {
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
  const none = { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null };
  const sources = {
    defillama: { ...none, batchTokenPrices: batches.onLlama },
    geckoterminal: { ...none, batchTokenPrices: batches.onGt },
    dexscreener: { getTokenPriceUsd: async () => null },
    coingecko: none,
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  return getEvmWalletAssets(OWNER, "base", {
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    sources: sources as never,
    tokenDiscovery: discovery as never,
    sharedPriceCache: priceCache,
    fxRate: 1,
  });
}

/** The prefetch is only useful if the scanned token ends up carrying its price. */
function tokenPrice(result: { tokens: Array<{ contract: string; priceEur: number | null }> }) {
  return result.tokens.find((t) => t.contract.toLowerCase() === TOKEN)?.priceEur ?? null;
}

test("the two bulk prefetches are issued together, not one after the other", async () => {
  let inFlight = 0;
  let peak = 0;
  const slow = async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 40));
    inFlight--;
    return new Map<string, number>();
  };

  await scanHarness({ onLlama: slow, onGt: slow }, new MemoryPricingCache());

  // Awaiting them in sequence made every scan pay both latencies in a row, for two
  // single-call prefetches that have nothing to do with each other.
  assert.equal(peak, 2, `both prefetches must overlap, peak was ${peak}`);
});

test("GeckoTerminal still takes precedence over DefiLlama for a shared contract", async () => {
  const priceCache = new MemoryPricingCache();
  const result = await scanHarness({
    // DefiLlama answers first in wall-clock terms; precedence must not depend on that.
    onLlama: async () => new Map([[TOKEN, 10]]),
    onGt: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Map([[TOKEN, 20]]);
    },
  }, priceCache);

  assert.equal(tokenPrice(result as never), 20, "the original ordering applied GeckoTerminal last, so it wins");
});

test("one prefetch failing does not lose the other", async () => {
  const priceCache = new MemoryPricingCache();
  const result = await scanHarness({
    onLlama: async () => { throw new Error("llama down"); },
    onGt: async () => new Map([[TOKEN, 7]]),
  }, priceCache);

  assert.equal(tokenPrice(result as never), 7, "a failing batch must degrade only its own source");
});
