import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTonWalletAssets } from "./ton.js";
import { MemoryPricingCache } from "../pricing/index.js";
import { MemoryCacheStore } from "../cache/index.js";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function makeFetch(
  account: unknown,
  jettons: unknown = { balances: [] },
  options?: { failAccount?: boolean; failJettons?: boolean; failToncenter?: boolean },
) {
  const calls: FetchCall[] = [];
  const impl: typeof fetch = async (url, init) => {
    const u = String(url);
    const pathname = new URL(u).pathname;
    calls.push({ url: u, init });
    if (pathname.endsWith("/jettons") && !options?.failJettons) {
      return new Response(JSON.stringify(jettons), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (pathname.endsWith("/jettons") && options?.failJettons) {
      return new Response("upstream", { status: 503 });
    }
    if (u.includes("tonapi.io") && !options?.failAccount) {
      return new Response(JSON.stringify(account), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("tonapi.io") && options?.failAccount) {
      return new Response("upstream", { status: 503 });
    }
    if (u.includes("toncenter.com") && !options?.failToncenter) {
      return new Response(JSON.stringify({ ok: true, result: "1000000000" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("toncenter.com") && options?.failToncenter) {
      return new Response("down", { status: 502 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch: impl, calls };
}

describe("getTonWalletAssets", () => {
  it("uses the separate TonAPI account and jetton response shapes", async () => {
    const { fetch: fetchImpl, calls } = makeFetch({ balance: "0" });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl,
      fxRate: 0.92,
    });

    assert.equal(result.chain, "ton");
    assert.equal(result.native.symbol, "TON");
    assert.equal(result.native.balance, 0);
    assert.equal(result.tokens.length, 0);
    assert.equal(result.totalValueEur, 0);
    assert.deepEqual(
      calls.filter((call) => call.url.includes("tonapi.io")).map((call) => new URL(call.url).pathname),
      [
        "/v2/accounts/EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "/v2/accounts/EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/jettons",
      ],
    );
  });

  it("converts nano TON to human balance with 9 decimals", async () => {
    const { fetch: fetchImpl } = makeFetch({ balance: "1500000000" });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl,
      fxRate: 0.92,
    });
    assert.equal(result.native.balance, 1.5);
  });

  it("reads positive jettons from the real balances response", async () => {
    const jettons = {
      balances: [{
        balance: "5000000000",
        jetton: { address: "EQabc", decimals: 9, symbol: "USD₮", name: "Tether USD" },
      }],
    };
    const { fetch: fetchImpl } = makeFetch({ balance: "1000000000" }, jettons);
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl,
      fxRate: 0.92,
    });
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0]?.symbol, "USD₮");
    assert.equal(result.tokens[0]?.balance, 5);
  });

  it("falls back to Toncenter when the account request fails", async () => {
    const { fetch: fetchImpl } = makeFetch(null, { balances: [] }, { failAccount: true });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl,
      fxRate: 0.92,
    });
    assert.equal(result.native.balance, 1);
    assert.ok(result.errors.some((error) => error.includes("tonapi account")));
  });

  it("returns degraded empty when both account sources and jettons fail", async () => {
    const { fetch: fetchImpl } = makeFetch(null, { balances: [] }, {
      failAccount: true,
      failJettons: true,
      failToncenter: true,
    });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl,
      fxRate: 0.92,
    });
    assert.equal(result.native.balance, 0);
    assert.ok(result.errors.some((error) => error.includes("[DEGRADED] tonapi jettons")));
  });

  it("preserves cached jettons when the separate jetton request fails", async () => {
    const address = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const cache = new MemoryCacheStore();
    const jettons = {
      balances: [{
        balance: "5000000000",
        jetton: { address: "EQabc", decimals: 9, symbol: "USD₮", name: "Tether USD" },
      }],
    };
    const first = makeFetch({ balance: "1000000000" }, jettons);
    await getTonWalletAssets(address, "TON", { fetchImpl: first.fetch, fxRate: 0.92, cache });

    const degraded = makeFetch({ balance: "2000000000" }, { balances: [] }, { failJettons: true });
    const result = await getTonWalletAssets(address, "TON", { fetchImpl: degraded.fetch, fxRate: 0.92, cache });

    assert.equal(result.native.balance, 2, "native account data remains live");
    assert.equal(result.tokens[0]?.symbol, "USD₮", "cached jetton remains visible");
    assert.ok(result.errors.some((error) => error.includes("[DEGRADED] tonapi jettons") && error.includes("cached fallback")));
  });
});

it("honours an injected pricing source set", async () => {
  let used = false;
  const sources = {
    defillama: {
      getNativePriceUsd: async () => { used = true; return 3; },
      getTokenPriceUsd: async () => null,
    },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };
  const fetchImpl = (async (url: string) => {
    if (String(url).endsWith("/jettons")) {
      return { ok: true, status: 200, json: async () => ({ balances: [] }) } as unknown as Response;
    }
    if (String(url).includes("tonapi.io")) {
      return { ok: true, status: 200, json: async () => ({ balance: "2000000000" }) } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;

  const assets = await getTonWalletAssets("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
    fetchImpl,
    fxRate: 1,
    sources: sources as never,
    sharedPriceCache: new MemoryPricingCache(),
  });

  assert.equal(used, true, "the injected source must be the one consulted");
  assert.equal(assets.native.priceEur, 3, "and its price must reach the result");
});
