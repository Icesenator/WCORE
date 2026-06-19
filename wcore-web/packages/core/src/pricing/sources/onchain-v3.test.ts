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
      if (batchCalls.length === 3 && batchCalls[0]?.to === POOL) {
        return [
          `0x${word(sqrtPriceX96)}`,
          `0x${word(10_000n)}`,
          encodedAddress(TOKEN),
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
      if (batchCalls.length === 3 && batchCalls[0]?.to === AERO_POOL) {
        return [`0x${word(sqrtPriceX96)}`, `0x${word(50_000n)}`, encodedAddress(TOKEN)];
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
      if (batchCalls.length === 3 && batchCalls[0]?.to === WETH_POOL) {
        return [`0x${word(sqrtPriceX96)}`, `0x${word(80_000n)}`, encodedAddress(TOKEN)];
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
      if (batchCalls.length === 6 && batchCalls[0]?.to === lowPool && batchCalls[3]?.to === highPool) {
        return [
          `0x${word(lowPrice)}`,
          `0x${word(1_000n)}`,
          encodedAddress(TOKEN),
          `0x${word(highLiquidityPrice)}`,
          `0x${word(100_000n)}`,
          encodedAddress(TOKEN),
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
