import { describe, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin, mapWithConcurrencyLimit, applyStakedPriceMirrors, applyDeFiPositionMirrorsToWalletAssets, precomputeWCTStakeLockStatus, setWCTStakeLockStatusFetcher } from "./gsheet.js";

test("mapWithConcurrencyLimit bounds parallel work", async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return n * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(maxActive, 2);
});

describe("gsheetPlugin", () => {
  const noChainbaseStakingProvider = async () => ({ locked: 0, claimable: 0 });

  test("returns 401 without token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({ method: "GET", url: "/api/gsheet/cache/get?key=k" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("returns cached value with valid token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async (key) => (key === "k" ? "v" : null) },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get?key=k",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { found: true, value: "v" });
    await app.close();
  });

  test("returns found:false for missing key", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get?key=missing",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { found: false, value: null });
    await app.close();
  });

  test("returns 400 when key is missing", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("does not block non-gsheet routes", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    app.get("/api/scan/foo", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/scan/foo" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    await app.close();
  });

  test("returns stock portfolio snapshot with valid gsheet token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      stockPortfolioProvider: async () => ({
        ok: true,
        generatedAt: "2026-07-11T12:00:00.000Z",
        ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        dynamicLimit: 300,
        holdingsStale: false,
        rows: [],
        stats: { ranked: 300, held: 0, heldOutsideRankedUniverse: 0, pricedFresh: 0, pricedStale: 0, unpriced: 0 },
      }),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/stocks/portfolio",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      ok: true,
      generatedAt: "2026-07-11T12:00:00.000Z",
      ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
      dynamicLimit: 300,
      holdingsStale: false,
      rows: [],
      stats: { ranked: 300, held: 0, heldOutsideRankedUniverse: 0, pricedFresh: 0, pricedStale: 0, unpriced: 0 },
    });
    await app.close();
  });

  test("passes fresh=true to the stock portfolio provider", async () => {
    const app = Fastify();
    let providerOpts: { fresh: boolean } | undefined;
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      stockPortfolioProvider: async (opts) => {
        providerOpts = opts;
        return { ok: true, generatedAt: "", ownerAddress: "", dynamicLimit: 300, holdingsStale: false, rows: [], stats: { ranked: 0, held: 0, heldOutsideRankedUniverse: 0, pricedFresh: 0, pricedStale: 0, unpriced: 0 } };
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/stocks/portfolio?fresh=true",
      headers: { "x-gsheet-token": "secret" },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(providerOpts, { fresh: true });
    await app.close();
  });

  test("rejects arbitrary stock portfolio query parameters", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      stockPortfolioProvider: async () => ({ ok: true, generatedAt: "", ownerAddress: "", dynamicLimit: 300, holdingsStale: false, rows: [], stats: { ranked: 0, held: 0, heldOutsideRankedUniverse: 0, pricedFresh: 0, pricedStale: 0, unpriced: 0 } }),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/stocks/portfolio?owner=0xabc",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "unexpected_query" });
    await app.close();
  });

  test("returns 503 when stock portfolio provider fails", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      stockPortfolioProvider: async () => { throw new Error("owner not configured"); },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/stocks/portfolio",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(JSON.parse(res.body), { error: "stock_portfolio_unavailable" });
    await app.close();
  });

  test("returns crypto portfolio snapshot with valid gsheet token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      cryptoPortfolioProvider: async () => ({
        ok: true,
        generatedAt: "2026-07-11T12:00:00.000Z",
        rows: [{ canonicalSymbol: "BTC", rank: 1, name: "Bitcoin", priceEur: 55_000, marketCapEur: 1_000_000_000_000 }],
        stats: { ranked: 1, unpriced: 0 },
      }),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/crypto/portfolio",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      ok: true,
      generatedAt: "2026-07-11T12:00:00.000Z",
      rows: [{ canonicalSymbol: "BTC", rank: 1, name: "Bitcoin", priceEur: 55_000, marketCapEur: 1_000_000_000_000 }],
      stats: { ranked: 1, unpriced: 0 },
    });
    await app.close();
  });

  test("passes fresh=true to the crypto portfolio provider", async () => {
    const app = Fastify();
    let providerOpts: { fresh: boolean } | undefined;
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      cryptoPortfolioProvider: async (opts) => {
        providerOpts = opts;
        return { ok: true, generatedAt: "", rows: [], stats: { ranked: 0, unpriced: 0 } };
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/crypto/portfolio?fresh=true",
      headers: { "x-gsheet-token": "secret" },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(providerOpts, { fresh: true });
    await app.close();
  });

  test("rejects arbitrary crypto portfolio query parameters", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      cryptoPortfolioProvider: async () => ({ ok: true, generatedAt: "", rows: [], stats: { ranked: 0, unpriced: 0 } }),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/crypto/portfolio?limit=100",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "unexpected_query" });
    await app.close();
  });

  test("returns 503 when crypto portfolio provider fails", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      cryptoPortfolioProvider: async () => { throw new Error("cmc down"); },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/crypto/portfolio",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(JSON.parse(res.body), { error: "crypto_portfolio_unavailable" });
    await app.close();
  });

  test("returns batch prices for gsheet tokens with valid token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      priceBatcher: async (input) => ({
        fxRate: 0.88,
        prices: Object.fromEntries(input.tokens.map((token) => [token.toLowerCase(), {
          priceEur: token.toLowerCase().endsWith("94") ? 0.0000066264 : null,
          priceUsd: token.toLowerCase().endsWith("94") ? 0.00000753 : null,
          source: token.toLowerCase().endsWith("94") ? "gt-batch" : null,
        }])),
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/prices",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        chain: "base",
        tokens: [
          "0x8A9CF9AE6536127129727938CB1A6438273E4F94",
          "0xb2f5ff8516b1f231d778d249e8a488667c66bfc0",
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      ok: true,
      chain: "BASE",
      fxRate: 0.88,
      prices: {
        "0x8a9cf9ae6536127129727938cb1a6438273e4f94": {
          priceEur: 0.0000066264,
          priceUsd: 0.00000753,
          source: "gt-batch",
        },
      },
      missing: ["0xb2f5ff8516b1f231d778d249e8a488667c66bfc0"],
    });
    await app.close();
  });

  test("rejects invalid gsheet price requests", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/prices",
      headers: { "x-gsheet-token": "secret" },
      payload: { chain: "base", tokens: ["not-a-contract"] },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "invalid_tokens" });
    await app.close();
  });

  test("returns gsheet scan results with valid token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: [{ symbol: "USDC", name: "USD Coin", contract: "0x0000000000000000000000000000000000000001", balance: 10, decimals: 6, priceEur: 0.86, valueEur: 8.6 }],
        totalValueEur: 29.6,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
        cacheStats: { hits: 1, misses: 2, stale: 0, skipped: 0 },
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        chain: "base",
        forceRefresh: true,
        strictTokens: true,
        customTokens: ["0x0000000000000000000000000000000000000001"],
      },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      ok: true,
      chain: "BASE",
      chainName: "Ledger - Base",
      vm: "EVM",
      timestamp: "2026-06-26T17:00:00.000Z",
      native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
      tokens: [{ symbol: "USDC", name: "USD Coin", contract: "0x0000000000000000000000000000000000000001", balance: 10, decimals: 6, priceEur: 0.86, valueEur: 8.6 }],
      totalValueEur: 29.6,
      errors: [],
      degraded: false,
      fxRate: 0.86,
      scanMs: 123,
      cacheStats: { hits: 1, misses: 2, stale: 0, skipped: 0 },
    });
    await app.close();
  });

  test("labels registered gsheet wallets in web scan responses", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: [],
        totalValueEur: 21,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x9eb34B670F79491329F71080717EdF071fF5353f", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.chain, "BASE");
    assert.equal(body.chainName, "UniSwap - Base");
    await app.close();
  });

  test("labels registered case-sensitive SVM gsheet wallets in web scan responses", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Fogo",
        vm: "SVM",
        timestamp: "2026-06-29T12:30:00.000Z",
        native: { symbol: "FOGO", balance: 1, priceEur: 0.01, valueEur: 0.01 },
        tokens: [],
        totalValueEur: 0.01,
        errors: [],
        degraded: false,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5", chain: "fogo" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.chain, "FOGO");
    assert.equal(body.chainName, "Layer3 - Fogo");
    await app.close();
  });

  test("filters scam tokens from gsheet scan responses", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: [
          { symbol: "USDC", name: "USD Coin", contract: "0x0000000000000000000000000000000000000001", balance: 10, decimals: 6, priceEur: 0.86, valueEur: 8.6 },
          { symbol: "ETHG", name: "Ethereum Games", contract: "0x0000000000000000000000000000000000000002", balance: 2_000_000, decimals: 18, priceEur: 0.25, valueEur: 500_000 },
        ],
        totalValueEur: 500_029.6,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["USDC"]);
    assert.equal(body.totalValueEur, 29.6);
    await app.close();
  });

  test("filters non-fungible badges from gsheet scan responses", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Scroll",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: [
          { symbol: "USDC", name: "USD Coin", contract: "0x0000000000000000000000000000000000000001", balance: 10, decimals: 6, priceEur: 0.86, valueEur: 8.6 },
          { symbol: "RSH", name: "rhino.fi Scroll Hunter", contract: "0x0000000000000000000000000000000000000002", balance: 3, decimals: 0, priceEur: null, valueEur: null, type: "ERC721" },
          { symbol: "NMSS", name: "NomisScore", contract: "0x0000000000000000000000000000000000000003", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "HANFT", name: "hypAtlasNFT", contract: "0x0000000000000000000000000000000000000004", balance: 13, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "CUBE", name: "Layer3 CUBE", contract: "0x0000000000000000000000000000000000000005", balance: 94, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "NMSSO", name: "NomisONFT", contract: "0x0000000000000000000000000000000006", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "ORI", name: "originscroll", contract: "0x0000000000000000000000000000000000000007", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "CWN-SCROLL", name: "Galxe - CWN on SCROLL", contract: "0x0000000000000000000000000000000000000008", balance: 6, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "VILLAG", name: "Villager", contract: "0x0000000000000000000000000000000000000010", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "SIDARB", name: "SPACE ID .arb Name", contract: "0x0000000000000000000000000000000000000011", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "POWER", name: "Layer3 Infinity CUBE", contract: "0x0000000000000000000000000000000000000012", balance: 1, decimals: 0, priceEur: null, valueEur: null },
          { symbol: "SCR", name: "Scroll", contract: "0x0000000000000000000000000000000000000009", balance: 2, decimals: 18, priceEur: 0.5, valueEur: 1 },
        ],
        totalValueEur: 30.6,
        errors: ["RSH price: NO_PRICE", "NMSS price: NO_PRICE", "HANFT price: NO_PRICE", "CUBE price: NO_PRICE", "NMSSO price: NO_PRICE", "ORI price: NO_PRICE", "CWN-SCROLL price: NO_PRICE", "VILLAG price: NO_PRICE", "SIDARB price: NO_PRICE", "POWER price: NO_PRICE"],
        degraded: true,
        fxRate: 0.86,
        scanMs: 123,
        cacheStats: { hits: 1, misses: 2, stale: 0, skipped: 0 },
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "scroll" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["USDC", "SCR"]);
    assert.equal(body.totalValueEur, 30.6);
    assert.equal(body.cacheStats.nonFungibleFiltered, 10);
    assert.deepEqual(body.errors, []);
    assert.equal(body.degraded, false);
    await app.close();
  });

  test("filters generic no-price ERC20 airdrops without hiding known escrow tokens", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Arbitrum One",
        vm: "EVM",
        timestamp: "2026-06-28T15:27:02.000Z",
        native: { symbol: "ETH", balance: 0.001, priceEur: 1385, valueEur: 1.39 },
        tokens: [
          { symbol: "MOLE", name: "Molecular Token", contract: "0x19d0899464dea847ad0a5b7d42f3ce0592542f9a", balance: 100, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "Runes", name: "Runes Token", contract: "0x5667a1dcc1e9a9f5e41bd040856c26cba474017d", balance: 47240, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "xGRAIL", name: "Camelot escrowed token", contract: "0x3caae25ee616f2c8e13c74da0813402eae3f496b", balance: 0.00000058, decimals: 18, priceEur: null, valueEur: null },
        ],
        totalValueEur: 1.39,
        errors: ["MOLE price: NO_PRICE", "Runes price: NO_PRICE", "xGRAIL price: NO_PRICE"],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "arbitrum_one" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["xGRAIL"]);
    assert.deepEqual(body.errors, ["xGRAIL price: NO_PRICE"]);
    await app.close();
  });

  test("filters no-market Base tokens and reports them via cacheStats badge", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      priceBatcher: async () => ({ prices: {}, fxRate: 0.8781 }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-28T16:30:00.000Z",
        native: { symbol: "ETH", balance: 0.05, priceEur: 1385, valueEur: 69.25 },
        tokens: [
          { symbol: "USDC", name: "USD Coin", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", balance: 100, decimals: 6, priceEur: 0.88, valueEur: 88 },
          { symbol: "Surprise", name: "Surprise", contract: "0xa973bc7ff3a4b05a8fde036b33a4431e3bc582c4", balance: 224253, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "BARAN", name: "Baran Bakery", contract: "0x0dfd116f3b94062de121836550559836efdfec4f", balance: 109341, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "STRETCH", name: "STRETCH", contract: "0x8b8c85c61d33a7f7df7661ea4e69a34502aafca3", balance: 138432, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "JRA", name: "TwyneFamily$", contract: "0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583", balance: 102232, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "ZAY", name: "Zay61", contract: "0x26095fbf2a0f8332408198e7a89b7d54fae19bb7", balance: 97315, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "FLIPIT", name: "Flip It", contract: "0xea6b729919db1ea6b7aeb5e69b9b9ef746fa5d90", balance: 29500, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "WC", name: "Warplet Community", contract: "0x2632ca8e93ad5ea63beb1a480d4b73589993db07", balance: 100000, decimals: 18, priceEur: null, valueEur: null },
        ],
        totalValueEur: 157.25,
        errors: [
          "Surprise price: NO_PRICE",
          "BARAN price: NO_PRICE",
          "STRETCH price: NO_PRICE",
          "JRA price: NO_PRICE",
          "ZAY price: NO_PRICE",
          "FLIPIT price: NO_PRICE",
          "WC price: NO_PRICE",
        ],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["USDC"]);
    assert.equal(body.cacheStats.noMarketFiltered, 7);
    assert.deepEqual(body.cacheStats.noMarketSymbols, ["Surprise", "BARAN", "STRETCH", "JRA", "ZAY", "FLIPIT", "WC"]);
    assert.deepEqual(body.errors, []);
    assert.equal(body.totalValueEur, 157.25);
    await app.close();
  });

  test("does not filter custom tokens even when they have no price", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-28T16:30:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
        tokens: [
          { symbol: "CUSTOM", name: "Custom Token", contract: "0x1111111111111111111111111111111111111111", balance: 1000, decimals: 18, priceEur: null, valueEur: null },
        ],
        totalValueEur: 13.85,
        errors: ["CUSTOM price: NO_PRICE"],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        chain: "base",
        customTokens: ["0x1111111111111111111111111111111111111111"],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["CUSTOM"]);
    assert.equal(body.cacheStats, undefined, "no cacheStats in original, noMarketFiltered must not be added");
    await app.close();
  });

  test("custom tokens do not bypass explicit NFT filters", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-30T04:22:36.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
        tokens: [
          { symbol: "KEEP", name: "Custom Token", contract: "0x1111111111111111111111111111111111111111", balance: 1000, decimals: 18, priceEur: null, valueEur: null },
          { symbol: "BASF", name: "Base SuperFest Wristband", contract: "0xa295bed246c51ee4848bc71f496d0ddd03cb296d", balance: 1, decimals: 0, priceEur: null, valueEur: null },
        ],
        totalValueEur: 13.85,
        errors: ["KEEP price: NO_PRICE", "BASF price: NO_PRICE"],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        chain: "base",
        customTokens: [
          "0x1111111111111111111111111111111111111111",
          "0xa295bed246c51ee4848bc71f496d0ddd03cb296d",
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["KEEP"]);
    assert.equal(body.totalValueEur, 13.85);
    assert.equal(body.cacheStats.nonFungibleFiltered, 1);
    await app.close();
  });

  test("neutralizes absurd token prices without deleting real tokens", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-30T04:22:36.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
        tokens: [
          { symbol: "CYBER", name: "CyberConnect", contract: "0x14778860e937f509e651192a90589de711fb88a9", balance: 1, decimals: 18, priceEur: 2.61712e18, valueEur: 2.61712e18 },
          { symbol: "BONSAI", name: "Bonsai Token", contract: "0x474f4cb764df9da079d94052fed39625c147c12c", balance: 1491.775, decimals: 18, priceEur: 0.000073, valueEur: 0.1089 },
        ],
        totalValueEur: 2.61712e18,
        errors: [],
        degraded: false,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        chain: "base",
        customTokens: ["0x14778860e937f509e651192a90589de711fb88a9"],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.tokens[0].symbol, "CYBER");
    assert.equal(body.tokens[0].priceEur, null);
    assert.equal(body.tokens[0].valueEur, null);
    assert.equal(body.tokens[1].symbol, "BONSAI");
    assert.equal(body.tokens[1].priceEur, 0.000073);
    assert.equal(body.totalValueEur, 13.96);
    assert.deepEqual(body.errors, ["CYBER price: ABSURD_PRICE"]);
    assert.equal(body.degraded, true);
    await app.close();
  });

  test("neutralizes implausible long-tail token values without marking the token as scam", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-30T05:22:36.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
        tokens: [
          { symbol: "BONSAI", name: "Bonsai Token", contract: "0x474f4cb764df9da079d94052fed39625c147c12c", balance: 1491.775, decimals: 18, priceEur: 73.23642618, valueEur: 109252.2697 },
        ],
        totalValueEur: 109266.12,
        errors: [],
        degraded: false,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        chain: "base",
        customTokens: ["0x474f4cb764df9da079d94052fed39625c147c12c"],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.tokens[0].symbol, "BONSAI");
    assert.equal(body.tokens[0].priceEur, null);
    assert.equal(body.tokens[0].valueEur, null);
    assert.equal(body.totalValueEur, 13.85);
    assert.deepEqual(body.errors, ["BONSAI price: ABSURD_PRICE"]);
    assert.equal(body.degraded, true);
    await app.close();
  });

  test("does not filter custom SVM mints even when they have no price", async () => {
    const app = Fastify();
    const usdcMint = "uSd2czE61Evaf76RNbq4KPpXnkiL3irdzgLFUMe3NoG";
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Fogo",
        vm: "SVM",
        timestamp: "2026-06-29T12:30:00.000Z",
        native: { symbol: "FOGO", balance: 0, priceEur: 0.01, valueEur: 0 },
        tokens: [
          { symbol: "USDC.s", name: "USDC", mint: usdcMint, balance: 1, decimals: 6, priceEur: null, valueEur: null },
        ],
        totalValueEur: 0,
        errors: ["USDC.s price: NO_PRICE"],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5",
        chain: "fogo",
        customTokens: [usdcMint],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["USDC.s"]);
    assert.equal(body.cacheStats, undefined, "protected SVM mints must not count as no-market filtered");
    await app.close();
  });

  test("does not filter chain-known SVM mints even when they have no price", async () => {
    const app = Fastify();
    const chaseMint = "GPK71dya1H975s3U4gYaJjrRCp3BGyAD8fmZCtSmBCcz";
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: noChainbaseStakingProvider,
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Fogo",
        vm: "SVM",
        timestamp: "2026-06-29T12:30:00.000Z",
        native: { symbol: "FOGO", balance: 0, priceEur: 0.01, valueEur: 0 },
        tokens: [
          { symbol: "CHASE", name: "Chase Dog", mint: chaseMint, balance: 375.982715254, decimals: 9, priceEur: null, valueEur: null },
        ],
        totalValueEur: 0,
        errors: ["CHASE price: NO_PRICE"],
        degraded: true,
        fxRate: 0.8781,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: {
        address: "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5",
        chain: "fogo",
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.tokens.map((t: { symbol: string }) => t.symbol), ["CHASE"]);
    assert.equal(body.cacheStats, undefined, "chain-known SVM mints must not count as no-market filtered");
    await app.close();
  });

  test("repairs missing gsheet scan token prices with the price batcher", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: [
          { symbol: "TELL", name: "tell you straight", contract: "0xed9bba84974a06e3886fa6228b27de43c93b4147", balance: 19500, decimals: 18, priceEur: null, valueEur: null },
        ],
        totalValueEur: 21,
        errors: ["TELL price: NO_PRICE"],
        degraded: true,
        fxRate: 0.86,
        scanMs: 123,
      }),
      priceBatcher: async () => ({
        fxRate: 0.86,
        prices: {
          "0xed9bba84974a06e3886fa6228b27de43c93b4147": { priceEur: 0.00002, priceUsd: 0.000023, source: "gt-retry" },
        },
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.tokens[0].priceEur, 0.00002);
    assert.equal(body.tokens[0].valueEur, 0.39);
    assert.equal(body.totalValueEur, 21.39);
    await app.close();
  });

  test("limits gsheet scan price repair work while covering Base long-tail gaps", async () => {
    const app = Fastify();
    let requestedTokens: string[] = [];
    const missingTokens = Array.from({ length: 25 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`);
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-26T17:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 2100, valueEur: 21 },
        tokens: missingTokens.map((contract, i) => ({ symbol: `M${i}`, name: `Missing ${i}`, contract, balance: 1, decimals: 18, priceEur: null, valueEur: null })),
        totalValueEur: 21,
        errors: missingTokens.map((_, i) => `M${i} price: NO_PRICE`),
        degraded: true,
        fxRate: 0.86,
        scanMs: 123,
      }),
      priceBatcher: async (input) => {
        requestedTokens = input.tokens;
        return { fxRate: 0.86, prices: {} };
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(requestedTokens.length, 24);
    await app.close();
  });

  test("rejects invalid gsheet scan requests", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "", chain: "base" },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: "missing_address" });
    await app.close();
  });

  test("injects Chainbase Staking locked + claimable tokens on Base", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: async () => ({
        stakingContract: "0x0297e997b56017164110f75f71ecd58da823085b",
        airdropContract: "0x3f2061547174d206613bc70869a454c25f84a0df",
        locked: 58.58143972,
        claimable: Number("15.357840691300827409"),
        tokenSymbol: "C",
        tokenAddress: "0xba12bc7b210e61e5d3110b997a63ea216e0e18f7",
        sources: { locked: "rpc", claimable: "config" },
        fetchedAt: "2026-06-28T16:00:00.000Z",
      }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-28T16:00:00.000Z",
        native: { symbol: "ETH", balance: 0.05, priceEur: 1385, valueEur: 69.25 },
        tokens: [
          { symbol: "USDC", name: "USD Coin", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", balance: 100, decimals: 6, priceEur: 0.86, valueEur: 86 },
        ],
        totalValueEur: 155.25,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const symbols = body.tokens.map((t: { symbol: string }) => t.symbol);
    assert.ok(symbols.includes("USDC"), "USDC should remain");
    const locked = body.tokens.find((t: { symbol: string }) => t.symbol === "C-Locked");
    const claimable = body.tokens.find((t: { symbol: string }) => t.symbol === "C-Airdrop");
    assert.ok(locked, "C-Locked must be injected");
    assert.ok(claimable, "C-Airdrop must be injected");
    assert.equal(locked.balance, 58.58143972);
    assert.equal(claimable.balance, Number("15.357840691300827"));
    assert.equal(locked.contract.toLowerCase(), "0x0297e997b56017164110f75f71ecd58da823085b");
    assert.equal(claimable.contract.toLowerCase(), "0x3f2061547174d206613bc70869a454c25f84a0df");
    assert.equal(locked.name, "Chainbase Staking [Lock]", "C-Locked must use withLiquiditySuffix to render the [Lock] badge");
    assert.equal(claimable.name, "Chainbase Airdrop [Flex]", "C-Airdrop must use withLiquiditySuffix to render the [Flex] badge");
    assert.equal(locked.defi?.type, "staking_locked");
    assert.equal(locked.defi?.liquidityStatus, "lock");
    assert.equal(claimable.defi?.type, "claimable");
    assert.equal(claimable.defi?.liquidityStatus, "flex");
    assert.ok(body.chainbaseStaking, "chainbaseStaking summary must be present");
    assert.equal(body.chainbaseStaking.locked, 58.58143972);
    assert.equal(body.chainbaseStaking.claimable, Number("15.357840691300827"));
    await app.close();
  });

  test("renders Chainbase Staking as flex when undelegation is mature", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      chainbaseStakingProvider: async () => ({
        stakingContract: "0x0297e997b56017164110f75f71ecd58da823085b",
        airdropContract: "0x3f2061547174d206613bc70869a454c25f84a0df",
        locked: 58.58143972,
        claimable: 0,
        tokenSymbol: "C",
        tokenAddress: "0xba12bc7b210e61e5d3110b997a63ea216e0e18f7",
        liquidityStatus: "flex",
        fetchedAt: "2026-06-28T16:00:00.000Z",
      }),
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Base",
        vm: "EVM",
        timestamp: "2026-06-28T16:00:00.000Z",
        native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
        tokens: [],
        totalValueEur: 0,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", chain: "base" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const locked = body.tokens.find((t: { symbol: string }) => t.symbol === "C-Locked");
    assert.equal(locked?.name, "Chainbase Staking [Flex]");
    assert.equal(locked?.defi?.liquidityStatus, "flex");
    await app.close();
  });

  test("uses the default Chainbase provider on Base when no provider override is supplied", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: "0x" + (58_581_439_720_000_000_000n).toString(16),
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const app = Fastify();
    try {
      await app.register(gsheetPlugin, {
        token: "secret",
        cacheStore: { get: async () => null },
        scanRunner: async (input) => ({
          ok: true,
          chain: input.chain,
          chainName: "Base",
          vm: "EVM",
          timestamp: "2026-06-28T16:00:00.000Z",
          native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
          tokens: [],
          totalValueEur: 0,
          errors: [],
          degraded: false,
          fxRate: 0.86,
          scanMs: 123,
        }),
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/gsheet/scan",
        headers: { "x-gsheet-token": "secret" },
        payload: { address: "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", chain: "base" },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      const symbols = body.tokens.map((t: { symbol: string }) => t.symbol);
      assert.ok(symbols.includes("C-Locked"), "C-Locked must be injected by the default provider");
      assert.ok(symbols.includes("C-Airdrop"), "C-Airdrop must be injected by the default provider");
    } finally {
      await app.close();
      globalThis.fetch = previousFetch;
    }
  });

  test("does not inject Chainbase Staking on non-Base chains", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      scanRunner: async (input) => ({
        ok: true,
        chain: input.chain,
        chainName: "Arbitrum One",
        vm: "EVM",
        timestamp: "2026-06-28T16:00:00.000Z",
        native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
        tokens: [],
        totalValueEur: 13.85,
        errors: [],
        degraded: false,
        fxRate: 0.86,
        scanMs: 123,
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", chain: "arbitrum_one" },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const symbols = body.tokens.map((t: { symbol: string }) => t.symbol);
    assert.ok(!symbols.includes("C-Locked"), "C-Locked must not be injected off-Base");
    assert.ok(!symbols.includes("C-Airdrop"), "C-Airdrop must not be injected off-Base");
    assert.equal(body.chainbaseStaking, undefined);
    await app.close();
  });

  test("maps missing web scan chain to 404", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async () => null },
      scanRunner: async () => { throw new Error("chain_not_found"); },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gsheet/scan",
      headers: { "x-gsheet-token": "secret" },
      payload: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", chain: "missing" },
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "chain_not_found" });
    await app.close();
  });
});

describe("applyStakedPriceMirrors", () => {
  test("finalizes wallet assets for the web scan pipeline", () => {
    const assets = applyDeFiPositionMirrorsToWalletAssets("OPTIMISM", "0x17d518736ee9341dcdc0a2498e013d33cfcdd080", {
      chain: "OPTIMISM",
      chainName: "Optimism",
      native: { symbol: "ETH", balance: 0.001, priceEur: 1600, valueEur: 1.6 },
      tokens: [
        { contract: "0xef4461891dfb3ac8572ccf7c794664a8dd927945", symbol: "WCT", name: "WalletConnect Token", decimals: 18, balance: 45, priceEur: 0.04, valueEur: 1.8 },
        { contract: "0x521b4c065bbdbe3e20b3727340730936912dfa46", symbol: "WCT Stake", name: "WCT Stake Weight", decimals: 18, balance: 71, priceEur: null, valueEur: null },
        { contract: "0xe36a30d249f7761327fd973001a32010b521b6fd", symbol: "Comp WETH Borrow", name: "Compound V3 cWETHv3 Borrowed", decimals: 18, balance: 0.006, priceEur: null, valueEur: null },
      ],
      errors: [],
      totalValueEur: 3.4,
      scanMs: 10,
    });

    const stake = assets.tokens.find((token) => token.symbol === "WCT Stake");
    const debt = assets.tokens.find((token) => token.symbol === "Comp WETH Borrow");
    assert.equal(stake?.priceEur, 0.04);
    assert.equal(stake?.valueEur, 2.84);
    assert.match(stake?.name ?? "", /\[Lock\]$/);
    assert.equal(debt?.balance, -0.006);
    assert.equal(debt?.priceEur, 1600);
    assert.equal(debt?.valueEur, -9.6);
    assert.equal(assets.totalValueEur, -3.36);
  });

  const SDAYS = "0x8a337e3f2b63e869b085354ce28dd5902a5db038";
  const SSWEET = "0x9ebe195d685f90b9be3449fe0628af20e15f729b";
  const DAYS = "0xb58372a5bb18e10229e680d8bcc4201ca3c98301";
  const SWEET = "0x8da2a47f76d928a97a8f44498db25aa787198087";

  test("mirrors priced underlying to staked variants on the same chain", () => {
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "BASE",
      chainName: "Base",
      vm: "EVM",
      timestamp: "2026-06-28T18:00:00.000Z",
      native: { symbol: "ETH", balance: 0.01, priceEur: 1385, valueEur: 13.85 },
      tokens: [
        { symbol: "DAYS", name: "Chrystal - The Days", contract: DAYS, balance: 126400, decimals: 18, priceEur: 0.000010670443, valueEur: 1.348743995 },
        { symbol: "SWEET", name: "Sweet Memories", contract: SWEET, balance: 148500.1962, decimals: 18, priceEur: 0.000009004185, valueEur: 1.337123239 },
        { symbol: "SDAYS", name: "Staked Chrystal - The Days (NOTION Remix)", contract: SDAYS, balance: 203143, decimals: 18, priceEur: null, valueEur: null },
        { symbol: "SSWEET", name: "Staked Sweet Memories", contract: SSWEET, balance: 146325, decimals: 18, priceEur: null, valueEur: null },
      ],
      totalValueEur: 14.0432,
      errors: [],
      degraded: false,
      fxRate: 0.878,
      scanMs: 123,
    });
    const sdays = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "SDAYS");
    const ssweet = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "SSWEET");
    assert.equal(sdays?.name, "Staked Chrystal - The Days (NOTION Remix) [Flex]");
    assert.equal(ssweet?.name, "Staked Sweet Memories [Flex]");
    assert.equal(sdays?.priceEur, 0.000010670443);
    assert.equal(ssweet?.priceEur, 0.000009004185);
    assert.equal(sdays?.source, "staked-mirror:DAYS");
    assert.equal(ssweet?.source, "staked-mirror:SWEET");
  });

  test("suffixes inline DeFi metadata without chain mirrors or registry metadata", () => {
    const input = {
      ok: true as const,
      chain: "ARBITRUM_NOVA",
      chainName: "Arbitrum Nova",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 0.001, priceEur: 2_000, valueEur: 2, arbitraryNativeField: "preserve" },
      tokens: [{
        symbol: "INLINE",
        name: "Inline Position",
        contract: "0x1111111111111111111111111111111111111111",
        balance: 3,
        decimals: 18,
        priceEur: 1,
        valueEur: 3,
        source: "custom-source",
        defi: { type: "vault_share", liquidityStatus: "unknown", confidence: "medium", arbitraryDefiField: 42 },
        arbitraryTokenField: { nested: true },
      }, {
        symbol: "PLAIN",
        name: "Plain Wallet Token",
        contract: "0x2222222222222222222222222222222222222222",
        balance: 4,
        decimals: 6,
        priceEur: 1,
        valueEur: 4,
        source: "plain-source",
        arbitraryPlainField: { untouched: true },
      }],
      totalValueEur: 9,
      errors: ["preserve-result-error"],
      degraded: true,
      fxRate: 0.91,
      scanMs: 321,
      cacheStats: { hits: 7, arbitraryResultField: "preserve" },
    };
    const plainTokenBefore = structuredClone(input.tokens[1]);

    const result = applyStakedPriceMirrors(input);

    assert.deepEqual(result.tokens[1], plainTokenBefore, "ordinary sibling token must remain unchanged");
    assert.deepEqual(result, {
      ...input,
      tokens: [{ ...input.tokens[0], name: "Inline Position [Unknown]" }, plainTokenBefore],
    });
  });

  test("registry liquidity status takes precedence over conflicting inline metadata", () => {
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "BASE",
      chainName: "Base",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [{
        symbol: "SDAYS",
        name: "Staked Chrystal - The Days (NOTION Remix)",
        contract: SDAYS,
        balance: 1,
        decimals: 18,
        priceEur: null,
        valueEur: null,
        defi: { type: "vault_share", liquidityStatus: "unknown", confidence: "low" },
      }],
      totalValueEur: 0,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });

    const sdays = (result.tokens as Array<{ name: string }>)[0];
    assert.equal(sdays?.name, "Staked Chrystal - The Days (NOTION Remix) [Flex]");
  });

  test("registry pricing takes precedence over conflicting inline pricing", () => {
    const SKAITO = "0x548d3b444da39686d1a6f1544781d154e7cd1ef7";
    const KAITO = "0x98d0baa52b2d063e780de12f615f963fe8537553";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "BASE",
      chainName: "Base",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [
        { symbol: "KAITO", name: "KAITO", contract: KAITO, balance: 2, decimals: 18, priceEur: 4, valueEur: 8, source: "underlying-feed" },
        { symbol: "sKAITO", name: "Staked KAITO", contract: SKAITO, balance: 3, decimals: 18, priceEur: 99, valueEur: 297, source: "direct-feed", defi: { type: "vault_share", liquidityStatus: "unknown", pricing: { mode: "direct", sign: "asset" } } },
      ],
      totalValueEur: 305,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });

    const skaito = (result.tokens as Array<Record<string, unknown>>)[1];
    assert.equal(skaito?.name, "Staked KAITO [Flex]");
    assert.equal(skaito?.priceEur, 4);
    assert.equal(skaito?.valueEur, 12);
    assert.equal(skaito?.source, `staked-mirror:${KAITO}`);
  });

  test("inline direct and none pricing keep existing values while adding liquidity suffixes", () => {
    const UNDERLYING = "0x3333333333333333333333333333333333333333";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "ARBITRUM_NOVA",
      chainName: "Arbitrum Nova",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 0.0005, priceEur: 2_000, valueEur: 1 },
      tokens: [
        { symbol: "BASE", name: "Underlying", contract: UNDERLYING, balance: 2, decimals: 18, priceEur: 2, valueEur: 4, source: "underlying-feed" },
        { symbol: "DIRECT", name: "Direct Position", contract: "0x4444444444444444444444444444444444444444", balance: 3, decimals: 18, priceEur: 7, valueEur: 21, source: "direct-feed", defi: { type: "vault_share", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "direct", sign: "asset" } } },
        { symbol: "NONE", name: "Unpriced Position", contract: "0x5555555555555555555555555555555555555555", balance: 4, decimals: 18, priceEur: 5, valueEur: 20, source: "manual-feed", defi: { type: "unknown_defi", liquidityStatus: "unknown", underlying: UNDERLYING, pricing: { mode: "none", sign: "asset" } } },
      ],
      totalValueEur: 46,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });
    const tokens = result.tokens as Array<Record<string, unknown>>;

    assert.deepEqual(tokens[1], { symbol: "DIRECT", name: "Direct Position [Flex]", contract: "0x4444444444444444444444444444444444444444", balance: 3, decimals: 18, priceEur: 7, valueEur: 21, source: "direct-feed", defi: { type: "vault_share", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "direct", sign: "asset" } } });
    assert.deepEqual(tokens[2], { symbol: "NONE", name: "Unpriced Position [Unknown]", contract: "0x5555555555555555555555555555555555555555", balance: 4, decimals: 18, priceEur: 5, valueEur: 20, source: "manual-feed", defi: { type: "unknown_defi", liquidityStatus: "unknown", underlying: UNDERLYING, pricing: { mode: "none", sign: "asset" } } });
    assert.equal(result.totalValueEur, 46);
  });

  test("inline mirror modes use their intended source and recalculate debt total", () => {
    const UNDERLYING = "0x6666666666666666666666666666666666666666";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "ARBITRUM_NOVA",
      chainName: "Arbitrum Nova",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 0.5, priceEur: 10, valueEur: 5 },
      tokens: [
        { symbol: "BASE", name: "Underlying", contract: UNDERLYING, balance: 2, decimals: 18, priceEur: 2, valueEur: 4, source: "underlying-feed" },
        { symbol: "MIRROR", name: "Underlying Mirror", contract: "0x7777777777777777777777777777777777777777", balance: 5, decimals: 18, priceEur: null, valueEur: null, defi: { type: "vault_share", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "mirror_underlying", sign: "asset" } } },
        { symbol: "NATIVE", name: "Native Mirror", contract: "0x8888888888888888888888888888888888888888", balance: 2, decimals: 18, priceEur: null, valueEur: null, defi: { type: "lending_collateral", liquidityStatus: "flex", underlying: "native", pricing: { mode: "mirror_native", sign: "asset" } } },
        { symbol: "DEBT", name: "Native Debt", contract: "0x9999999999999999999999999999999999999999", balance: 3, decimals: 18, priceEur: null, valueEur: null, defi: { type: "lending_debt", liquidityStatus: "flex", pricing: { mode: "mirror_native", sign: "debt" } } },
      ],
      totalValueEur: 9,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });
    const tokens = result.tokens as Array<{ symbol: string; balance: number; priceEur: number | null; valueEur: number | null; source?: string }>;

    assert.deepEqual(tokens.find((token) => token.symbol === "MIRROR"), { ...result.tokens[1] as object, balance: 5, priceEur: 2, valueEur: 10, source: `staked-mirror:${UNDERLYING}` });
    assert.equal(tokens.find((token) => token.symbol === "NATIVE")?.source, "staked-mirror:ETH");
    assert.deepEqual(tokens.find((token) => token.symbol === "DEBT"), { ...result.tokens[3] as object, balance: -3, priceEur: 10, valueEur: -30, source: "staked-mirror:ETH (debt)" });
    assert.equal(result.totalValueEur, 9);
  });

  test("keeps already-negative mirrored debt negative and includes it in the net total", () => {
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "ARBITRUM_NOVA",
      chainName: "Arbitrum Nova",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 1, priceEur: 10, valueEur: 10 },
      tokens: [{
        symbol: "DEBT",
        name: "Native Debt",
        contract: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        balance: -3,
        decimals: 18,
        priceEur: null,
        valueEur: null,
        defi: { type: "lending_debt", liquidityStatus: "flex", pricing: { mode: "mirror_native", sign: "debt" } },
      }],
      totalValueEur: 10,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });

    const debt = (result.tokens as Array<{ balance: number; valueEur: number | null }>)[0];
    assert.equal(debt?.balance, -3);
    assert.equal(debt?.valueEur, -30);
    assert.equal(result.totalValueEur, -20);
  });

  test("inline pricing overrides a matching compatibility mirror", () => {
    const COMET = "0xe36a30d249f7761327fd973001a32010b521b6fd";
    const UNDERLYING = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "OPTIMISM",
      chainName: "Optimism",
      vm: "EVM",
      timestamp: "2026-07-17T12:00:00.000Z",
      native: { symbol: "ETH", balance: 1, priceEur: 10, valueEur: 10 },
      tokens: [
        { symbol: "BASE", name: "Underlying", contract: UNDERLYING, balance: 2, decimals: 18, priceEur: 4, valueEur: 8, source: "underlying-feed" },
        { symbol: "DIRECT", name: "Direct", contract: COMET, balance: 3, decimals: 18, priceEur: 7, valueEur: 21, source: "direct-feed", defi: { type: "vault_share", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "direct", sign: "asset" } } },
        { symbol: "NONE", name: "None", contract: COMET, balance: 4, decimals: 18, priceEur: 5, valueEur: 20, source: "manual-feed", defi: { type: "unknown_defi", liquidityStatus: "unknown", underlying: UNDERLYING, pricing: { mode: "none", sign: "asset" } } },
        { symbol: "MIRROR", name: "Mirror", contract: COMET, balance: 5, decimals: 18, priceEur: null, valueEur: null, defi: { type: "lending_collateral", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "mirror_underlying", sign: "asset" } } },
        { symbol: "NATIVE", name: "Native", contract: COMET, balance: 6, decimals: 18, priceEur: null, valueEur: null, defi: { type: "lending_collateral", liquidityStatus: "flex", pricing: { mode: "mirror_native", sign: "asset" } } },
      ],
      totalValueEur: 59,
      errors: [],
      degraded: false,
      fxRate: 0.91,
      scanMs: 1,
    });
    const tokens = result.tokens as Array<Record<string, unknown>>;

    assert.deepEqual(tokens[1], { symbol: "DIRECT", name: "Direct [Flex]", contract: COMET, balance: 3, decimals: 18, priceEur: 7, valueEur: 21, source: "direct-feed", defi: { type: "vault_share", liquidityStatus: "flex", underlying: UNDERLYING, pricing: { mode: "direct", sign: "asset" } } });
    assert.deepEqual(tokens[2], { symbol: "NONE", name: "None [Unknown]", contract: COMET, balance: 4, decimals: 18, priceEur: 5, valueEur: 20, source: "manual-feed", defi: { type: "unknown_defi", liquidityStatus: "unknown", underlying: UNDERLYING, pricing: { mode: "none", sign: "asset" } } });
    assert.equal(tokens[3]?.priceEur, 4);
    assert.equal(tokens[3]?.valueEur, 20);
    assert.equal(tokens[3]?.source, `staked-mirror:${UNDERLYING}`);
    assert.equal(tokens[4]?.priceEur, 10);
    assert.equal(tokens[4]?.valueEur, 60);
    assert.equal(tokens[4]?.source, "staked-mirror:ETH");
    assert.equal(result.totalValueEur, 139);
  });

  test("skips staked variant when underlying is missing or unpriced", () => {
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "BASE",
      chainName: "Base",
      vm: "EVM",
      timestamp: "2026-06-28T18:00:00.000Z",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [
        { symbol: "SDAYS", name: "Staked Chrystal - The Days (NOTION Remix)", contract: SDAYS, balance: 203143, decimals: 18, priceEur: null, valueEur: null },
      ],
      totalValueEur: 0,
      errors: [],
      degraded: true,
      fxRate: 0.878,
      scanMs: 123,
    });
    const sdays = (result.tokens as Array<{ symbol: string; priceEur: number | null; valueEur: number | null }>).find((t) => t.symbol === "SDAYS");
    assert.equal(sdays?.priceEur, null);
    assert.equal(sdays?.valueEur, null);
  });

  test("does nothing on non-Base chains", () => {
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "ETHEREUM",
      chainName: "Ethereum",
      vm: "EVM",
      timestamp: "2026-06-28T18:00:00.000Z",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [
        { symbol: "SDAYS", name: "SDAYS", contract: SDAYS, balance: 1, decimals: 18, priceEur: null, valueEur: null },
        { symbol: "DAYS", name: "DAYS", contract: DAYS, balance: 1, decimals: 18, priceEur: 0.01, valueEur: 0.01 },
      ],
      totalValueEur: 0.01,
      errors: [],
      degraded: false,
      fxRate: 0.878,
      scanMs: 123,
    });
    const sdays = (result.tokens as Array<{ symbol: string; priceEur: number | null }>).find((t) => t.symbol === "SDAYS");
    assert.equal(sdays?.priceEur, null);
  });

  test("mirrors WCT underlying to WCT claimable and stake weight on Optimism", () => {
    const WCT = "0xef4461891dfb3ac8572ccf7c794664a8dd927945";
    const WCT_CLAIMABLE = "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf";
    const WCT_STAKE = "0x521b4c065bbdbe3e20b3727340730936912dfa46";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "OPTIMISM",
      chainName: "Optimism",
      vm: "EVM",
      timestamp: "2026-06-28T18:00:00.000Z",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [
        { symbol: "WCT", name: "WalletConnect Token", contract: WCT, balance: 45.38886228, decimals: 18, priceEur: 0.03725997343, valueEur: 1.691187803 },
        { symbol: "WCT Claimable", name: "WCT Staking Reward Distributor", contract: WCT_CLAIMABLE, balance: 1.69, decimals: 18, priceEur: null, valueEur: null },
        { symbol: "WCT Stake", name: "WCT Stake Weight", contract: WCT_STAKE, balance: 71.2, decimals: 18, priceEur: null, valueEur: null },
      ],
      totalValueEur: 1.691187803,
      errors: [],
      degraded: false,
      fxRate: 0.878,
      scanMs: 123,
    });
    const claimable = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "WCT Claimable");
    const stake = (result.tokens as Array<{ symbol: string; name: string; priceEur: number | null; valueEur: number | null; source: string | null }>).find((t) => t.symbol === "WCT Stake");
    assert.equal(claimable?.name, "WCT Staking Reward Distributor [Flex]");
    assert.equal(stake?.name, "WCT Stake Weight [Lock]");
    assert.equal(claimable?.priceEur, 0.03725997343);
    assert.equal(claimable?.source, "staked-mirror:WCT");
    assert.equal(stake?.priceEur, 0.03725997343);
    assert.equal(stake?.source, "staked-mirror:WCT");
  });

  test("WCT Stake flips to [Flex] when the on-chain lockUntil has passed", async () => {
    const WCT = "0xef4461891dfb3ac8572ccf7c794664a8dd927945";
    const WCT_STAKE = "0x521b4c065bbdbe3e20b3727340730936912dfa46";
    const USER = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
    // Inject a minimal RPC stub that returns a lockUntil timestamp 60s in the past
    // to simulate a fully unlocked WCT Stake position.
    const pastTimestamp = Math.floor(Date.now() / 1000) - 60;
    const stub = {
      ethCall: async () => "0x" + pastTimestamp.toString(16).padStart(64, "0"),
    };
    setWCTStakeLockStatusFetcher(async () => "flex" as "flex" | "lock" | "unknown", stub);
    try {
      await precomputeWCTStakeLockStatus("OPTIMISM", USER);
      const result = applyStakedPriceMirrors({
        ok: true,
        chain: "OPTIMISM",
        chainName: "Optimism",
        vm: "EVM",
        timestamp: "2026-06-28T18:00:00.000Z",
        native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
        wallet: USER,
        tokens: [
          { symbol: "WCT", name: "WalletConnect Token", contract: WCT, balance: 45.38886228, decimals: 18, priceEur: 0.03725997343, valueEur: 1.691187803 },
          { symbol: "WCT Stake", name: "WCT Stake Weight", contract: WCT_STAKE, balance: 71.2, decimals: 18, priceEur: null, valueEur: null, defi: { type: "staking_locked", liquidityStatus: "lock", confidence: "high" } },
        ],
        totalValueEur: 1.691187803,
        errors: [],
        degraded: false,
        fxRate: 0.878,
        scanMs: 123,
      });
      const stake = (result.tokens as Array<{ symbol: string; name: string }>).find((t) => t.symbol === "WCT Stake");
      assert.equal(stake?.name, "WCT Stake Weight [Flex]", "WCT Stake must switch to [Flex] when lockUntil is past");
    } finally {
      setWCTStakeLockStatusFetcher(null, null);
    }
  });

  test("uses symbol-specific mirror before contract-level debt mirror for Compound collateral", () => {
    const COMET = "0xe36a30d249f7761327fd973001a32010b521b6fd";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "OPTIMISM",
      chainName: "Optimism",
      vm: "EVM",
      timestamp: "2026-06-29T05:00:00.000Z",
      native: { symbol: "ETH", balance: 0.01, priceEur: 1376.91, valueEur: 13.77 },
      tokens: [
        // v0.3.x: Compound V3 positions now use cToken addresses (discovered on-chain).
        // Each position carries its own liquidityStatus on the token, so the
        // registry is no longer needed for the [Flex] suffix.
        { symbol: "Comp WETH Borrow", name: "Compound V3 cWETHv3 Borrowed", contract: COMET, balance: 0.006, decimals: 18, priceEur: null, valueEur: null, liquidityStatus: "flex" } as Record<string, unknown>,
        { symbol: "Comp wrsETH", name: "Compound V3 cWETHv3 Collateral", contract: COMET, balance: 0.007, decimals: 18, priceEur: null, valueEur: null, liquidityStatus: "flex" } as Record<string, unknown>,
      ],
      totalValueEur: 151.46,
      errors: [],
      degraded: false,
      fxRate: 0.878,
      scanMs: 123,
    });
    const tokens = result.tokens as Array<{ symbol: string; name: string; balance: number; priceEur: number | null; valueEur: number | null; source: string | null }>;
    const borrow = tokens.find((t) => t.symbol === "Comp WETH Borrow");
    const collateral = tokens.find((t) => t.symbol === "Comp wrsETH");
    assert.equal(borrow?.name, "Compound V3 cWETHv3 Borrowed [Flex]");
    assert.equal(collateral?.name, "Compound V3 cWETHv3 Collateral [Flex]");
    assert.equal(borrow?.balance, -0.006);
    assert.equal(borrow?.source, "staked-mirror:ETH (debt)");
    assert.equal(collateral?.balance, 0.007);
    assert.equal(collateral?.priceEur, 1376.91);
    assert.equal(collateral?.valueEur, 9.64);
    assert.equal(collateral?.source, "staked-mirror:wrsETH");
    assert.equal(result.totalValueEur, 15.15, "total must include the negative debt value");
  });

  test("Compound V3 collateral displays the cToken contract, not the Comet", () => {
    const COMET = "0xe36a30d249f7761327fd973001a32010b521b6fd";
    const WRSETH_CTOKEN = "0x87eEE96D50Fb761AD85B1c982d28A042169d61b1";
    const result = applyStakedPriceMirrors({
      ok: true,
      chain: "OPTIMISM",
      chainName: "Optimism",
      vm: "EVM",
      timestamp: "2026-06-29T05:00:00.000Z",
      native: { symbol: "ETH", balance: 0.01, priceEur: 1376.91, valueEur: 13.77 },
      tokens: [
        // The engine returns the Comet contract (call target) but the cToken in extraArgs
        // for collateral positions. The Sheet must show the cToken contract.
        { symbol: "Comp wrsETH", name: "Compound V3 wrsETH Collateral", contract: COMET, balance: 0.007, decimals: 18, priceEur: null, valueEur: null, defi: { type: "lending_collateral", liquidityStatus: "flex", confidence: "high" }, balanceSelector: "0x5c2549ee", balanceSelectorExtraArgs: ["0x" + WRSETH_CTOKEN.slice(2).padStart(64, "0")] } as Record<string, unknown>,
      ],
      totalValueEur: 13.77,
      errors: [],
      degraded: false,
      fxRate: 0.878,
      scanMs: 123,
    });
    const tokens = result.tokens as Array<{ symbol: string; contract: string }>;
    const collateral = tokens.find((t) => t.symbol === "Comp wrsETH");
    assert.equal(collateral?.contract.toLowerCase(), WRSETH_CTOKEN.toLowerCase(), "Comp wrsETH must display the cToken contract for Sheet users");
  });
});
