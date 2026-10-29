// Run: node --import tsx --test packages/core/src/pricing/sources/onchain-v3.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OnchainV3PriceSource,
  encodeSqrtPriceX96ForPrice,
  onchainV3SpecForChain,
} from "./onchain-v3.js";
import { MemoryPricingCache } from "../types.js";
import type { PricingToken } from "../types.js";
import type { ChainConfig } from "../../types.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const AERO_POOL = "0x3333333333333333333333333333333333333333";
const WETH_POOL = "0x4444444444444444444444444444444444444444";

const baseChain: ChainConfig = {
  key: "BASE",
  vm: "EVM",
  CHAIN: {
    NAME: "Base",
    CHAIN_ID: 8453,
    GT_NETWORK: "base",
  },
  RPC: {
    ENDPOINTS: ["https://rpc.example"],
  },
};

function token(): PricingToken {
  return {
    key: TOKEN,
    contract: TOKEN,
    symbol: "MICRO",
    chain: baseChain,
  };
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function encodedAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

test("onchain-v3 returns best USDC pool price and stores NEED_ONCHAIN marker", async () => {
  const calls: Array<{ to: string; data: string }> = [];
  const spec = onchainV3SpecForChain(baseChain);
  assert.ok(spec);
  const sqrtPriceX96 = encodeSqrtPriceX96ForPrice(2, 18, 6, true);

  const rpc = {
    async batch(batchCalls: Array<{ to: string; data: string }>): Promise<string[]> {
      calls.push(...batchCalls);
      if (batchCalls.length === 6 && batchCalls.every((call) => call.to === spec.factories[0]?.address)) {
        return [
          encodedAddress(POOL),
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
        ];
      }
      if (batchCalls.length === 6) {
        return batchCalls.map(() => `0x${word(0n)}`);
      }
      if (batchCalls.length === 4 && batchCalls[0]?.to === POOL) {
        return [
          `0x${word(sqrtPriceX96)}`,
          `0x${word(10_000n)}`,
          encodedAddress(TOKEN),
          `0x${word(1_000n * 10n ** 6n)}`, // pool holds 1000 USDC
        ];
      }
      if (batchCalls.length === 1 && batchCalls[0]?.to === TOKEN) {
        return [`0x${word(18n)}`];
      }
      throw new Error(`unexpected batch ${batchCalls.length}`);
    },
  };

  const cache = new MemoryPricingCache();
  const source = new OnchainV3PriceSource({ cache, rpc });
  const result = await source.getTokenPriceUsd(token());

  assert.equal(typeof result, "object");
  assert.ok(result && typeof result === "object" && "priceUsd" in result);
  assert.equal(Math.round((result.priceUsd ?? 0) * 100) / 100, 2);
  assert.equal(result && typeof result === "object" ? result.source : null, "onchain-v3");
  assert.equal(await cache.getMarker("NEED_ONCHAIN:base:0x1111111111111111111111111111111111111111"), "NEED_ONCHAIN");
  assert.equal(calls.some((call) => call.data.startsWith(spec.selectors.getPool)), true);
});

test("onchain-v3 returns null for unsupported chains", async () => {
  const source = new OnchainV3PriceSource();
  const result = await source.getTokenPriceUsd({
    ...token(),
    chain: { key: "FOO", vm: "EVM", CHAIN: { CHAIN_ID: 999999 } },
  });

  assert.equal(result, null);
});

test("onchain-v3 prices Base Aerodrome Slipstream pools when Uniswap has no pool", async () => {
  const spec = onchainV3SpecForChain(baseChain);
  assert.ok(spec);
  const aerodrome = spec.factories.find((factory) => factory.name === "aerodrome-slipstream");
  assert.ok(aerodrome);
  const sqrtPriceX96 = encodeSqrtPriceX96ForPrice(3, 18, 6, true);
  const calls: Array<{ to: string; data: string }> = [];

  const rpc = {
    async batch(batchCalls: Array<{ to: string; data: string }>): Promise<string[]> {
      calls.push(...batchCalls);
      if (batchCalls.length === 6 && batchCalls.every((call) => call.to === spec.factories[0]?.address)) {
        return batchCalls.map(() => `0x${word(0n)}`);
      }
      if (batchCalls.length === 6 && batchCalls.every((call) => call.to === aerodrome.address)) {
        return [
          encodedAddress(AERO_POOL),
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
        ];
      }
      if (batchCalls.length === 4 && batchCalls[0]?.to === AERO_POOL) {
        return [`0x${word(sqrtPriceX96)}`, `0x${word(50_000n)}`, encodedAddress(TOKEN), `0x${word(1_000n * 10n ** 6n)}`];
      }
      if (batchCalls.length === 1 && batchCalls[0]?.to === TOKEN) {
        return [`0x${word(18n)}`];
      }
      throw new Error(`unexpected batch ${batchCalls.length}`);
    },
  };

  const source = new OnchainV3PriceSource({ rpc });
  const result = await source.getTokenPriceUsd(token());

  assert.ok(result && typeof result === "object" && "priceUsd" in result);
  assert.equal(Math.round((result.priceUsd ?? 0) * 100) / 100, 3);
  assert.equal(result.reason, "aerodrome-slipstream:USDC:500");
  assert.equal(calls.some((call) => call.to === aerodrome.address), true);
});

test("onchain-v3 falls back to WETH pool using native USD price", async () => {
  const spec = onchainV3SpecForChain(baseChain);
  assert.ok(spec);
  const sqrtPriceX96 = encodeSqrtPriceX96ForPrice(0.01, 18, 18, true);

  const rpc = {
    async batch(batchCalls: Array<{ to: string; data: string }>): Promise<string[]> {
      if (batchCalls.length === 6 && batchCalls.every((call) => call.to === spec.factories[0]?.address)) {
        return [
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          encodedAddress(WETH_POOL),
          `0x${word(0n)}`,
          `0x${word(0n)}`,
        ];
      }
      if (batchCalls.length === 6) return batchCalls.map(() => `0x${word(0n)}`);
      if (batchCalls.length === 4 && batchCalls[0]?.to === WETH_POOL) {
        // pool holds 1 WETH (x 3000 $ native price)
        return [`0x${word(sqrtPriceX96)}`, `0x${word(80_000n)}`, encodedAddress(TOKEN), `0x${word(10n ** 18n)}`];
      }
      if (batchCalls.length === 1 && batchCalls[0]?.to === TOKEN) {
        return [`0x${word(18n)}`];
      }
      throw new Error(`unexpected batch ${batchCalls.length}`);
    },
  };

  const source = new OnchainV3PriceSource({ rpc, nativePriceUsd: () => 3000 });
  const result = await source.getTokenPriceUsd(token());

  assert.ok(result && typeof result === "object" && "priceUsd" in result);
  assert.equal(Math.round((result.priceUsd ?? 0) * 100) / 100, 30);
  assert.equal(result.reason, "uniswap-v3:WETH:500");
});

test("onchain-v3 chooses the highest-liquidity priced pool", async () => {
  const spec = onchainV3SpecForChain(baseChain);
  assert.ok(spec);
  const lowPrice = encodeSqrtPriceX96ForPrice(2, 18, 6, true);
  const highLiquidityPrice = encodeSqrtPriceX96ForPrice(5, 18, 6, true);
  const lowPool = "0x5555555555555555555555555555555555555555";
  const highPool = "0x6666666666666666666666666666666666666666";

  const rpc = {
    async batch(batchCalls: Array<{ to: string; data: string }>): Promise<string[]> {
      if (batchCalls.length === 6 && batchCalls.every((call) => call.to === spec.factories[0]?.address)) {
        return [
          encodedAddress(lowPool),
          encodedAddress(highPool),
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
          `0x${word(0n)}`,
        ];
      }
      if (batchCalls.length === 8 && batchCalls[0]?.to === lowPool && batchCalls[4]?.to === highPool) {
        return [
          `0x${word(lowPrice)}`,
          `0x${word(1_000n)}`,
          encodedAddress(TOKEN),
          `0x${word(1_000n * 10n ** 6n)}`,
          `0x${word(highLiquidityPrice)}`,
          `0x${word(100_000n)}`,
          encodedAddress(TOKEN),
          `0x${word(1_000n * 10n ** 6n)}`,
        ];
      }
      if (batchCalls.length === 6) return batchCalls.map(() => `0x${word(0n)}`);
      if (batchCalls.length === 1 && batchCalls[0]?.to === TOKEN) {
        return [`0x${word(18n)}`];
      }
      throw new Error(`unexpected batch ${batchCalls.length}`);
    },
  };

  const source = new OnchainV3PriceSource({ rpc });
  const result = await source.getTokenPriceUsd(token());

  assert.ok(result && typeof result === "object" && "priceUsd" in result);
  assert.equal(Math.round((result.priceUsd ?? 0) * 100) / 100, 5);
  assert.equal(result.reason, "uniswap-v3:USDC:3000");
});

// --- Empty-pool guard (BONSAI / RBF on Base) ---------------------------------

const BALANCE_OF = "0x70a08231";

interface MockPool {
  addr: string;
  quote: "USDC" | "WETH";
  fee: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  token0: string;
  quoteBalance: bigint;
}

// Per-call mock RPC: answers each call by (to, selector), independent of batch shape.
function poolRpc(tokenAddr: string, tokenDecimals: bigint, pools: MockPool[]) {
  const spec = onchainV3SpecForChain(baseChain);
  assert.ok(spec);
  const uniswap = spec.factories[0]?.address;
  const quoteAddr = (label: "USDC" | "WETH") => (label === "USDC" ? spec.usdc : spec.weth);
  const zero = `0x${word(0n)}`;
  return {
    async batch(batchCalls: Array<{ to: string; data: string }>): Promise<string[]> {
      return batchCalls.map((call) => {
        const to = call.to.toLowerCase();
        const data = call.data.toLowerCase();
        if (data.startsWith(spec.selectors.getPool)) {
          if (to !== uniswap) return zero;
          const quote = `0x${data.slice(10 + 64 + 24, 10 + 128)}`;
          const fee = Number(BigInt(`0x${data.slice(10 + 128, 10 + 192)}`));
          const hit = pools.find((p) => quoteAddr(p.quote) === quote && p.fee === fee);
          return hit ? encodedAddress(hit.addr) : zero;
        }
        if (data.startsWith(BALANCE_OF)) {
          const holder = `0x${data.slice(10 + 24, 10 + 64)}`;
          const hit = pools.find((p) => p.addr === holder && quoteAddr(p.quote) === to);
          return hit ? `0x${word(hit.quoteBalance)}` : zero;
        }
        if (to === tokenAddr && data === spec.selectors.decimals) return `0x${word(tokenDecimals)}`;
        const pool = pools.find((p) => p.addr === to);
        if (pool && data === spec.selectors.slot0) return `0x${word(pool.sqrtPriceX96)}`;
        if (pool && data === spec.selectors.liquidity) return `0x${word(pool.liquidity)}`;
        if (pool && data === spec.selectors.token0) return encodedAddress(pool.token0);
        throw new Error(`unexpected call ${call.to} ${call.data.slice(0, 10)}`);
      });
    },
  };
}

function baseToken(addr: string, symbol: string): PricingToken {
  return { key: addr, contract: addr, symbol, chain: baseChain };
}

function priceOf(result: unknown): number | null {
  if (result && typeof result === "object" && "priceUsd" in result) {
    const value = (result as { priceUsd?: number | null }).priceUsd;
    return typeof value === "number" ? value : null;
  }
  return null;
}

const BONSAI = "0x474f4cb764df9da079d94052fed39625c147c12c";
const RBF = "0x15de59489de5e7f240d72f787dc4a292b8199339";

test("onchain-v3 rejects near-empty BONSAI/USDC V3 pool (reserve ~0.000002 $)", async () => {
  const rpc = poolRpc(BONSAI, 18n, [
    {
      addr: "0xa7be20054ec76eb5692d3a99b29551b82ca27ee7",
      quote: "USDC",
      fee: 3000,
      sqrtPriceX96: encodeSqrtPriceX96ForPrice(0.01198, 18, 6, true),
      liquidity: 10n ** 15n,
      token0: BONSAI,
      quoteBalance: 2n, // 0.000002 USDC
    },
  ]);
  const result = await new OnchainV3PriceSource({ rpc }).getTokenPriceUsd(baseToken(BONSAI, "BONSAI"));
  assert.equal(priceOf(result), null);
});

test("onchain-v3 rejects near-empty RBF/USDC 1% V3 pool (reserve ~0.0011 $)", async () => {
  const rpc = poolRpc(RBF, 18n, [
    {
      addr: "0x824d9d43abf80c189ee366442bf87ef6b10c6802",
      quote: "USDC",
      fee: 10000,
      sqrtPriceX96: encodeSqrtPriceX96ForPrice(0.0006776, 18, 6, true),
      liquidity: 10n ** 15n,
      token0: RBF,
      quoteBalance: 1_100n, // 0.0011 USDC
    },
  ]);
  const result = await new OnchainV3PriceSource({ rpc }).getTokenPriceUsd(baseToken(RBF, "RBF"));
  assert.equal(priceOf(result), null);
});

test("onchain-v3 rejects near-empty WETH pool (WETH balance x native price < 50 $)", async () => {
  const rpc = poolRpc(TOKEN, 18n, [
    {
      addr: WETH_POOL,
      quote: "WETH",
      fee: 3000,
      sqrtPriceX96: encodeSqrtPriceX96ForPrice(0.01, 18, 18, true),
      liquidity: 10n ** 15n,
      token0: TOKEN,
      quoteBalance: 10n ** 15n, // 0.001 WETH x 3000 $ = 3 $
    },
  ]);
  const result = await new OnchainV3PriceSource({ rpc, nativePriceUsd: () => 3000 }).getTokenPriceUsd(token());
  assert.equal(priceOf(result), null);
});

test("onchain-v3 prefers a funded pool over an empty pool with higher V3 liquidity", async () => {
  const rpc = poolRpc(BONSAI, 18n, [
    {
      addr: "0xa7be20054ec76eb5692d3a99b29551b82ca27ee7",
      quote: "USDC",
      fee: 500,
      sqrtPriceX96: encodeSqrtPriceX96ForPrice(0.01198, 18, 6, true),
      liquidity: 10n ** 18n, // larger V3 liquidity, but empty
      token0: BONSAI,
      quoteBalance: 2n,
    },
    {
      addr: "0x7777777777777777777777777777777777777777",
      quote: "USDC",
      fee: 3000,
      sqrtPriceX96: encodeSqrtPriceX96ForPrice(0.00175, 18, 6, true),
      liquidity: 1_000n,
      token0: BONSAI,
      quoteBalance: 5_000n * 10n ** 6n, // 5000 USDC
    },
  ]);
  const result = await new OnchainV3PriceSource({ rpc }).getTokenPriceUsd(baseToken(BONSAI, "BONSAI"));
  const price = priceOf(result);
  assert.ok(price != null);
  assert.ok(Math.abs(price - 0.00175) / 0.00175 < 1e-6, `unexpected price ${price}`);
  assert.equal(result && typeof result === "object" ? result.reason : null, "uniswap-v3:USDC:3000");
});
