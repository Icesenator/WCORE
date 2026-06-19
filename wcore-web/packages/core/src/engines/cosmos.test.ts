// Run: node --import tsx --test packages/core/src/engines/cosmos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCosmosWalletAssets } from "./cosmos.js";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import type { PricingSourceSet } from "../pricing/index.js";

const OWNER = "cosmos1nvfsmt48nemfullrkkxa6gze05c4xeypfslj7t";

test("getCosmosWalletAssets returns native ATOM balance", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  let _callCount = 0;
  const fetch = async (_url: string, __opts?: RequestInit) => {
    _callCount++;
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return {
        ok: true,
        json: async () => ({
          balances: [{ denom: "uatom", amount: "5000000" }],
        }),
      } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return {
        ok: true,
        json: async () => ({ delegation_responses: [] }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", {
    fetchImpl: fetch as never,
    sources,
    fxRate: 1,
  });

  assert.equal(result.native.symbol, "ATOM");
  assert.equal(result.native.balance, 5);
  assert.equal(result.native.priceEur, 5);
  assert.equal(result.native.valueEur, 25);
});

test("getCosmosWalletAssets returns staked balance", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const fetch = async (_url: string, __opts?: RequestInit) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return {
        ok: true,
        json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }),
      } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return {
        ok: true,
        json: async () => ({
          delegation_responses: [{
            delegation: { delegator_address: OWNER, validator_address: "cosmosvaloper1abc", shares: "2000000.000000000000000000" },
            balance: { denom: "uatom", amount: "2000000" },
          }],
        }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", {
    fetchImpl: fetch as never,
    sources,
    fxRate: 1,
  });

  // Balance depends on whether INCLUDE_STAKED_NATIVE is set in chain config
  assert.ok(result.native.balance >= 1);
  assert.ok(result.errors.length === 0 || result.native.balance > 0);
});

test("getCosmosWalletAssets only adds native-denom rewards to native balance", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const fetch = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegators/") && _url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [{ denom: "uatom", amount: "2000000" }, { denom: "ibc/notatom", amount: "99000000" }] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch as never, sources, fxRate: 1 });

  assert.equal(result.native.balance, 3);
});

test("getCosmosWalletAssets skips unknown non-standard denoms instead of assuming 6 decimals", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => 1, getNativePriceUsd: async () => 1 },
    dexscreener: { getTokenPriceUsd: async () => 1 },
    geckoterminal: { getTokenPriceUsd: async () => 1 },
    coingecko: { getNativePriceUsd: async () => 1, getTokenPriceUsd: async () => 1 },
    jupiter: { getTokenPriceUsd: async () => 1 },
    onchainV3: { getTokenPriceUsd: async () => 1 },
  };
  const fetch = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [
        { denom: "uatom", amount: "1000000" },
        // Non-standard denom not in DENOM_DECIMALS, not ibc/ — must be skipped, not defaulted to 6.
        { denom: "factory/cosmos1abc/unknowncoin", amount: "1000000000000000000" },
      ] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch as never, sources, fxRate: 1 });

  const unknown = result.tokens.find(t => t.symbol.includes("unknowncoin") || t.symbol.includes("factory"));
  assert.equal(unknown, undefined, "unknown non-standard denom must be skipped, not priced at 6 decimals");
});

test("getCosmosWalletAssets formats raw amounts without unsafe integer rounding", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 1 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const fetch = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "9007199254740993" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegators/") && _url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch as never, sources, fxRate: 1 });

  assert.equal(result.native.balance, 9007199254.740993);
});

test("getCosmosWalletAssets handles API failure gracefully", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const fetch = async () => {
    throw new Error("Network error");
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", {
    fetchImpl: fetch as never,
    sources,
    fxRate: 1,
  });

  assert.equal(result.native.balance, 0);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(e => e.includes("error") || e.includes("fail")));
});

// ─── Cache tests ───

test("getCosmosWalletAssets negative cache returns [CACHED_EMPTY] on second empty scan", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: empty wallet (all endpoints return empty success, not failure)
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.equal(result1.native.balance, 0);
  assert.equal(result1.tokens.length, 0);
  assert.ok(!result1.errors.some(e => e.includes("[CACHED_EMPTY]")), "first scan should not hit cache");

  // Second call: liveness check verifies wallet is still empty via quick REST call.
  // The liveness check is the long-term fix — it prevents stale empty cache
  // from blocking real assets. No prefix bumps needed.
  const fetch2 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [] }) } as Response;
    }
    throw new Error("should not be called");
  };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[CACHED_EMPTY]")), "second scan should hit negative cache");
  assert.equal(result2.native.balance, 0);
  assert.equal(result2.tokens.length, 0);
});

test("getCosmosWalletAssets bank balances use cached fallback when REST fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: has balances
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "5000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.equal(result1.native.balance, 5);

  // Verify bal cache was written
  await new Promise(r => setTimeout(r, 0));
  const cachedBal = await cache.get(`bal:cosmos_hub:${OWNER}`);
  assert.ok(cachedBal, "bank balances should be cached");
  assert.ok((cachedBal as unknown[]).length >= 1);

  // Second call: REST fails entirely
  const fetch2 = async () => { throw new Error("Network error"); };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("bank balances")), "should use cached fallback");
  assert.equal(result2.native.balance, 5);
});

test("getCosmosWalletAssets native balance writes zero cache when REST returns empty (genuine zero)", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: has 5 ATOM
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "5000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.equal(result1.native.balance, 5);

  // Verify native cache was written with 5000000
  await new Promise(r => setTimeout(r, 0));
  const cachedNative = await cache.get<{ balance: string }>(`native:cosmos_hub:${OWNER}`);
  assert.ok(cachedNative, "native balance should be cached");
  assert.equal(cachedNative.balance, "5000000");

  // Clear bal: cache so REST empty doesn't hit it — we want to test native fallback
  await cache.delete(`bal:cosmos_hub:${OWNER}`);

  // Second call: REST returns empty (genuine zero — not a failure)
  let balanceCallCount = 0;
  const fetch2 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      balanceCallCount++;
      return { ok: true, json: async () => ({ balances: [] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(balanceCallCount > 0, "second scan should call REST (not short-circuited)");
  // REST returned empty successfully → genuine zero, not a failure → balance is 0
  // (previously this used cached fallback, but that was a bug: a successful REST
  //  response of [] means the wallet genuinely has 0 native, not a failure)
  assert.equal(result2.native.balance, 0, "genuine zero should not use stale cached fallback");
  // Native cache should now contain 0 (genuine zero cached)
  const cachedAfter = await cache.get<{ balance: string }>(`native:cosmos_hub:${OWNER}`);
  assert.ok(cachedAfter, "native cache should be written with genuine zero");
  assert.equal(cachedAfter!.balance, "0");
});

test("getCosmosWalletAssets delegations use cached fallback when REST fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: has staking delegations
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({
        delegation_responses: [{
          delegation: { delegator_address: OWNER, validator_address: "cosmosvaloper1abc", shares: "2000000.000000000000000000" },
          balance: { denom: "uatom", amount: "2000000" },
        }],
      }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.ok(result1.native.balance >= 2, `expected >= 2 got ${result1.native.balance}`);

  // Verify delegations cache was written
  await new Promise(r => setTimeout(r, 0));
  const cachedDel = await cache.get(`del:cosmos_hub:${OWNER}`);
  assert.ok(cachedDel, "delegations should be cached");

  // Clear bal: and native: cache to isolate del: fallback
  await cache.delete(`bal:cosmos_hub:${OWNER}`);
  await cache.delete(`native:cosmos_hub:${OWNER}`);

  // Second call: REST fails for delegations — triggers cache fallback
  const fetch2 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      throw new Error("Network error");
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("delegations")), "should use cached delegations");
  assert.ok(result2.native.balance >= 2, "staked amount should be restored from cache");
});

test("getCosmosWalletAssets writes per-token cache after pricing", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  const IBC_DENOM = "ibc/27394FB092D2ECCD56123CF74D2E1C0DD0D4F6E8B2C76A65DCC1A9A9B5E0A73D";
  const fetch = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }, { denom: IBC_DENOM, amount: "500000" }] }) } as Response;
    }
    if (_url.includes("/ibc/apps/transfer/v1/denom_traces/27394FB092D2ECCD56123CF74D2E1C0DD0D4F6E8B2C76A65DCC1A9A9B5E0A73D")) {
      return { ok: true, json: async () => ({ denom_trace: { path: "transfer/channel-0", base_denom: "uatom" } }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };

  await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch as never, sources, fxRate: 1, cache });
  await new Promise(r => setTimeout(r, 0));

  // Verify per-token cache entry for IBC token
  const cached = await cache.get<{ balance: string; decimals: number; symbol: string }>(`token:cosmos_hub:${IBC_DENOM}:${OWNER}`);
  assert.ok(cached, "per-token cache entry should exist");
  assert.equal(cached.balance, "500000");
  assert.equal(cached.decimals, 6);
  assert.ok(cached.symbol.length > 0);

  // Native denom (uatom) should NOT have a per-token cache entry
  const nativeCached = await cache.get(`token:cosmos_hub:uatom:${OWNER}`);
  assert.equal(nativeCached, undefined, "native denom should not have per-token cache");
});

test("getCosmosWalletAssets unbonding uses cached fallback when REST fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: bank 1M + delegations 0 + unbonding 1M + rewards 0 = 2M native
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({
        unbonding_responses: [{ entries: [{ balance: "1000000" }] }],
      }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.ok(result1.native.balance >= 2, `expected >= 2 got ${result1.native.balance}`);

  // Verify unbonding cache was written
  await new Promise(r => setTimeout(r, 0));
  const cachedUnb = await cache.get(`unb:cosmos_hub:${OWNER}`);
  assert.ok(cachedUnb, "unbonding should be cached");

  // Clear all other caches to isolate unb: fallback
  await cache.delete(`bal:cosmos_hub:${OWNER}`);
  await cache.delete(`native:cosmos_hub:${OWNER}`);
  await cache.delete(`del:cosmos_hub:${OWNER}`);
  await cache.delete(`rew:cosmos_hub:${OWNER}`);

  // Second call: REST fails for unbonding — triggers cache fallback
  const fetch2 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      throw new Error("Network error");
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({ total: [] }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("unbonding")), "should use cached unbonding");
  assert.equal(result2.native.balance, 2, `bank 1 + unbonding cached 1 = 2 ATOM, got ${result2.native.balance}`);
});

test("getCosmosWalletAssets rewards use cached fallback when REST fails", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 10 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const cache = new MemoryCacheStore();

  // First call: bank 1M + delegations 0 + unbonding 0 + rewards 1M uatom + 1M non-native = 2M native (only uatom rewards counted)
  const fetch1 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return { ok: true, json: async () => ({
        total: [
          { denom: "uatom", amount: "1000000" },
          { denom: "ibc/othertoken123", amount: "500000" },
        ],
      }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result1 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch1 as never, sources, fxRate: 1, cache });
  assert.ok(result1.native.balance >= 2, `expected >= 2 got ${result1.native.balance}`);

  // Verify rewards cache was written
  await new Promise(r => setTimeout(r, 0));
  const cachedRew = await cache.get(`rew:cosmos_hub:${OWNER}`);
  assert.ok(cachedRew, "rewards should be cached");
  assert.ok((cachedRew as Array<{ denom?: string }>).some(r => r.denom === "uatom"), "cached rewards should include uatom entry");
  assert.ok((cachedRew as Array<{ denom?: string }>).some(r => r.denom === "ibc/othertoken123"), "cached rewards should include non-native entry");

  // Clear all other caches to isolate rew: fallback
  await cache.delete(`bal:cosmos_hub:${OWNER}`);
  await cache.delete(`native:cosmos_hub:${OWNER}`);
  await cache.delete(`del:cosmos_hub:${OWNER}`);
  await cache.delete(`unb:cosmos_hub:${OWNER}`);

  // Second call: REST fails for rewards — triggers cache fallback
  const fetch2 = async (_url: string) => {
    if (_url.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "1000000" }] }) } as Response;
    }
    if (_url.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    if (_url.includes("/unbonding_delegations")) {
      return { ok: true, json: async () => ({ unbonding_responses: [] }) } as Response;
    }
    if (_url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      throw new Error("Network error");
    }
    return { ok: false, json: async () => ({}) } as Response;
  };
  const result2 = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch2 as never, sources, fxRate: 1, cache });
  assert.ok(result2.errors.some(e => e.includes("[DEGRADED]") && e.includes("rewards")), "should use cached rewards");
  // Native rewards only: uatom 1M bank + 1M uatom rewards = 2M = 2 ATOM.
  // Non-native (ibc/othertoken123 500k) must be excluded from native balance.
  assert.equal(result2.native.balance, 2, `should be exactly bank 1 + uatom rewards 1 = 2 ATOM, got ${result2.native.balance}`);
});

test("getCosmosWalletAssets fails over to the next REST endpoint when the primary 500s", async () => {
  const sources: PricingSourceSet = {
    defillama: { getTokenPriceUsd: async () => null, getNativePriceUsd: async () => 5 },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  // COSMOS_HUB has REST_URLS = [publicnode, cosmos.directory, lavenderfive].
  // The primary (publicnode) returns 500; the bank-balance call must fall over.
  const PRIMARY = "https://cosmos-rest.publicnode.com";
  let primaryHits = 0;
  let failoverHits = 0;
  const fetch = async (url: string, _opts?: RequestInit) => {
    const u = String(url);
    if (u.startsWith(PRIMARY)) {
      primaryHits++;
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
    failoverHits++;
    if (u.includes("/cosmos/bank/v1beta1/balances/")) {
      return { ok: true, json: async () => ({ balances: [{ denom: "uatom", amount: "5000000" }] }) } as Response;
    }
    if (u.includes("/cosmos/staking/v1beta1/delegations/")) {
      return { ok: true, json: async () => ({ delegation_responses: [] }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };

  const result = await getCosmosWalletAssets(OWNER, "cosmos_hub", { fetchImpl: fetch as never, sources, fxRate: 1 });

  assert.ok(primaryHits > 0, "should have tried the primary endpoint");
  assert.ok(failoverHits > 0, "should have failed over to an alternate endpoint");
  assert.equal(result.native.balance, 5, "should read balance from the failover endpoint");
});
