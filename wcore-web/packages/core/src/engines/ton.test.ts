import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTonWalletAssets } from "./ton.js";
import { MemoryPricingCache } from "../pricing/index.js";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function makeFetch(account: unknown, options?: { failTonapi?: boolean; failToncenter?: boolean }) {
  const calls: FetchCall[] = [];
  const impl: typeof fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("tonapi.io") && !options?.failTonapi) {
      return new Response(JSON.stringify(account), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("tonapi.io") && options?.failTonapi) {
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
  it("returns zero balance for a fresh empty TON address", async () => {
    const account = { balance: "0", jettons: { balances: [] } };
    const { fetch: f } = makeFetch(account);
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl: f as unknown as typeof fetch,
      fxRate: 0.92,
    });
    assert.equal(result.chain, "ton");
    assert.equal(result.native.symbol, "GRAM");
    assert.equal(result.native.balance, 0);
    assert.equal(result.tokens.length, 0);
    assert.equal(result.totalValueEur, 0);
  });

  it("converts nano TON to human balance with 9 decimals", async () => {
    // 1.5 TON = 1500000000 nano
    const account = { balance: "1500000000", jettons: { balances: [] } };
    const { fetch: f } = makeFetch(account);
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl: f as unknown as typeof fetch,
      fxRate: 0.92,
    });
    assert.equal(result.native.balance, 1.5);
  });

  it("includes priced jettons with positive balance", async () => {
    const account = {
      balance: "1000000000",
      jettons: {
        balances: [
          {
            balance: "5000000000",
            jetton: { address: "EQabc", decimals: 9, symbol: "USD₮", name: "Tether USD" },
          },
        ],
      },
    };
    const { fetch: f } = makeFetch(account);
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl: f as unknown as typeof fetch,
      fxRate: 0.92,
    });
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0]?.symbol, "USD₮");
    assert.equal(result.tokens[0]?.balance, 5);
  });

  it("falls back to Toncenter when TonAPI fails", async () => {
    const { fetch: f } = makeFetch(null, { failTonapi: true });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl: f as unknown as typeof fetch,
      fxRate: 0.92,
    });
    // Toncenter returned "1000000000" nano = 1 TON
    assert.equal(result.native.balance, 1);
    assert.ok(result.errors.some((e) => e.includes("tonapi")));
  });

  it("returns degraded empty when both TonAPI and Toncenter fail", async () => {
    const { fetch: f } = makeFetch(null, { failTonapi: true, failToncenter: true });
    const result = await getTonWalletAssets("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
      fetchImpl: f as unknown as typeof fetch,
      fxRate: 0.92,
    });
    assert.equal(result.native.balance, 0);
    assert.ok(result.errors.length > 0);
  });
});

it("honours an injected pricing source set", async () => {
  // opts.sources was declared but never read, so a caller injecting sources silently
  // got the built-in ones instead - the same dead-option shape as an unused guard.
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
    if (String(url).includes("tonapi.io")) {
      return { ok: true, status: 200, json: async () => ({ balance: "2000000000", jettons: [] }) } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;

  const assets = await getTonWalletAssets("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "TON", {
    fetchImpl,
    fxRate: 1,
    sources: sources as never,
    // A fresh cache: the module-level one is shared across tests in this file and would
    // answer from a previous test before any source is consulted.
    sharedPriceCache: new MemoryPricingCache(),
  });

  assert.equal(used, true, "the injected source must be the one consulted");
  assert.equal(assets.native.priceEur, 3, "and its price must reach the result");
});
