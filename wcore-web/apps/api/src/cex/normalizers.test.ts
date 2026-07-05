import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBinanceBuckets, normalizeBitpandaBuckets, normalizeBitfinexBuckets, normalizeBybitBuckets, normalizeCoinbaseBuckets, normalizeKrakenBuckets, normalizeOkxBuckets, bitfinexCanonicalSymbol, krakenCanonicalSymbol } from "./normalizers.js";
import { priceYahooStockSymbolEur, yahooStockSymbolCandidates } from "./stock-pricing.js";
import { priceCexRowsForTest } from "../plugins/cex.js";

test("Binance normalization preserves USDC, TUSD and USDT as separate assets", () => {
  const rows = normalizeBinanceBuckets({
    spot: [["USDC", "10"], ["TUSD", "20"], ["USDT", "30"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket]), [
    ["USDC", 10, "spot"],
    ["TUSD", 20, "spot"],
    ["USDT", 30, "spot"],
  ]);
});

test("Binance normalization preserves EUR, EURI and EURC as separate assets", () => {
  const rows = normalizeBinanceBuckets({
    spot: [["EUR", "1"], ["EURI", "2"], ["EURC", "3"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance]), [
    ["EUR", 1],
    ["EURI", 2],
    ["EURC", 3],
  ]);
});

test("Binance normalization skips LD lending wrapper assets", () => {
  const rows = normalizeBinanceBuckets({
    spot: [["LDETH", "4"], ["ETH", "5"]],
    "earn-flexible": [["ETH", "6"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket]), [
    ["ETH", 5, "spot"],
    ["ETH", 6, "earn-flexible"],
  ]);
});

test("Binance normalization preserves provider EUR quotes from the relay", () => {
  const rows = normalizeBinanceBuckets({
    spot: [["BTC", "0.01"]],
    prices: { BTC: { priceEur: 90000, source: "binance:BTCEUR" } },
  });

  assert.equal(rows[0]?.quoteEur, 90000);
  assert.equal(rows[0]?.quoteSource, "binance:BTCEUR");
});

test("Bitpanda normalization aggregates exact uppercase symbols per bucket only", () => {
  const rows = normalizeBitpandaBuckets({
    crypto: [["btc", "0.1"], ["BTC", "0.2"]],
    fiat: [["eur", "10"], ["EURI", "20"], ["EURC", "30"]],
  });

  assert.equal(rows[0]?.symbol, "BTC");
  assert.equal(rows[0]?.bucket, "crypto");
  assert.ok(Math.abs((rows[0]?.balance ?? 0) - 0.3) < 0.00000001);
  assert.deepEqual(rows.slice(1).map((r) => [r.symbol, r.balance, r.bucket]), [
    ["EUR", 10, "fiat"],
    ["EURI", 20, "fiat"],
    ["EURC", 30, "fiat"],
  ]);
});

test("Bitpanda normalization preserves provider EUR quotes", () => {
  const rows = normalizeBitpandaBuckets({
    stocks: [["AVGO", "2"]],
    prices: { AVGO: { priceEur: 315.42, source: "bitpanda:ticker" } },
  });

  assert.equal(rows[0]?.quoteEur, 315.42);
  assert.equal(rows[0]?.quoteSource, "bitpanda:ticker");
});

test("Bitpanda stock pricing candidates cover common Yahoo suffix drift", () => {
  // Curated mapping is tried first, raw symbol kept as a cheap last resort.
  assert.deepEqual(yahooStockSymbolCandidates("BRK.B"), ["BRK-B", "BRK.B"]);
  assert.ok(yahooStockSymbolCandidates("VWCE").includes("VWCE.DE"));
  assert.ok(yahooStockSymbolCandidates("ASML").includes("ASML.AS"));
  assert.ok(yahooStockSymbolCandidates("SAP").includes("SAP.DE"));
});

test("Bitpanda stock candidates stay minimal to avoid Yahoo rate-limit storms", () => {
  // Plain US tickers must resolve in a single Yahoo call (no speculative EU suffixes).
  assert.deepEqual(yahooStockSymbolCandidates("AAPL"), ["AAPL"]);
  assert.deepEqual(yahooStockSymbolCandidates("AMZN"), ["AMZN"]);
  assert.deepEqual(yahooStockSymbolCandidates("GOOGL"), ["GOOGL"]);
  // Mapped symbols use the curated candidates only, never the full EU suffix sweep.
  assert.ok(yahooStockSymbolCandidates("ASML").length <= 3);
  assert.ok(yahooStockSymbolCandidates("AMD-US").length <= 3);
  assert.ok(!yahooStockSymbolCandidates("AAPL").some((c) => c.includes(".")));
});

test("Bitpanda Yahoo stock pricing tries suffix candidates until one resolves", async () => {
  const requested: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const symbol = decodeURIComponent(String(url).split("/chart/")[1]?.split("?")[0] ?? "");
    requested.push(symbol);
    return {
      ok: symbol === "VWCE.DE",
      json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 112.34, currency: "EUR" } }] } }),
    } as Response;
  };

  const price = await priceYahooStockSymbolEur("VWCE", { fetchImpl, getEurUsdRate: async () => 1.1 });

  assert.equal(price.priceEur, 112.34);
  assert.equal(price.source, "yahoo:eur:VWCE.DE");
  // Mapped EU symbol resolves on the curated candidate first, in a single call.
  assert.deepEqual(requested, ["VWCE.DE"]);
});

test("Bitpanda stock rows prefer Yahoo over colliding Bitpanda crypto ticker quotes", async () => {
  const rows = await priceCexRowsForTest([
    { symbol: "ACN", balance: 2, bucket: "stocks", source: "bitpanda-stocks", quoteEur: 0.01, quoteSource: "bitpanda:ticker" },
  ], {
    priceStockSymbolEur: async () => ({ priceEur: 250, source: "yahoo:usd:ACN" }),
    priceSymbolEur: async () => ({ priceEur: 0.01, source: "defillama" }),
  });

  assert.equal(rows[0]?.priceEur, 250);
  assert.equal(rows[0]?.valueEur, 500);
  assert.equal(rows[0]?.priceSource, "yahoo:usd:ACN");
});

test("BCPEUR is priced as a euro stable asset even when Bitpanda classifies it as stocks", async () => {
  let stockPricingCalls = 0;
  const rows = await priceCexRowsForTest([
    { symbol: "BCPEUR", balance: 12.34, bucket: "stocks", source: "bitpanda-stocks" },
  ], {
    priceStockSymbolEur: async () => { stockPricingCalls++; return { priceEur: null, source: null }; },
    priceSymbolEur: async (symbol) => (symbol === "BCPEUR" ? { priceEur: 1, source: "fiat-eur" } : { priceEur: null, source: null }),
  });

  assert.equal(rows[0]?.priceEur, 1);
  assert.equal(rows[0]?.valueEur, 12.34);
  assert.equal(rows[0]?.priceSource, "fiat-eur");
  assert.equal(stockPricingCalls, 0);
});

test("Bitpanda stock pricing candidates normalize common Bitpanda stock aliases", () => {
  assert.ok(yahooStockSymbolCandidates("AMD-US").includes("AMD"));
  assert.ok(yahooStockSymbolCandidates("BRKB").includes("BRK-B"));
  assert.ok(yahooStockSymbolCandidates("FB").includes("META"));
  assert.ok(yahooStockSymbolCandidates("MRKUS").includes("MRK"));
  assert.ok(yahooStockSymbolCandidates("WMT-US").includes("WMT"));
});

test("Yahoo stock pricing serves cached price without hitting the network", async () => {
  let fetchCalls = 0;
  const store = new Map<string, { priceEur: number; source: string }>();
  store.set("stockprice:AAPL", { priceEur: 250, source: "yahoo:usd:AAPL" });
  const cache = {
    async get(key: string) { return store.get(key) ?? null; },
    async set() { /* noop */ },
  };
  const fetchImpl = async () => { fetchCalls++; return { ok: true, json: async () => ({}) } as Response; };

  const price = await priceYahooStockSymbolEur("AAPL", { fetchImpl, getEurUsdRate: async () => 1.1, cache });

  assert.equal(price.priceEur, 250);
  assert.equal(price.source, "yahoo:usd:AAPL");
  assert.equal(fetchCalls, 0);
});

test("Yahoo stock pricing caches a fresh price on success", async () => {
  const store = new Map<string, unknown>();
  const cache = {
    async get(key: string) { return (store.get(key) as { priceEur: number; source: string }) ?? null; },
    async set(key: string, value: unknown) { store.set(key, value); },
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 300, currency: "USD" } }] } }),
  } as Response);

  const price = await priceYahooStockSymbolEur("MSFT", { fetchImpl, getEurUsdRate: async () => 1.0, cache });

  assert.equal(price.priceEur, 300);
  assert.deepEqual(store.get("stockprice:MSFT"), { priceEur: 300, source: "yahoo:usd:MSFT" });
});

test("Bitfinex canonical symbol resolves short codes then consolidates stables", () => {
  assert.equal(bitfinexCanonicalSymbol("ATO"), "ATOM");
  assert.equal(bitfinexCanonicalSymbol("DOG"), "DOGE");
  assert.equal(bitfinexCanonicalSymbol("IOT"), "IOTA");
  // UST -> USDT (alias) then stays USDT (stable map)
  assert.equal(bitfinexCanonicalSymbol("UST"), "USDT");
  // USD/UDC consolidate to USDT, EUR/EUT consolidate to EURC
  assert.equal(bitfinexCanonicalSymbol("USD"), "USDT");
  assert.equal(bitfinexCanonicalSymbol("UDC"), "USDT");
  assert.equal(bitfinexCanonicalSymbol("EUR"), "EURC");
  assert.equal(bitfinexCanonicalSymbol("EUT"), "EURC");
});

test("Bitfinex normalization keeps spot rows and aggregates aliased stables", () => {
  const rows = normalizeBitfinexBuckets({
    spot: [["BTC", "0.5"], ["USD", "100"], ["UDC", "50"], ["ATO", "12"]],
  });

  // USD + UDC both map to USDT and aggregate; ATO -> ATOM
  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["BTC", 0.5, "spot", "bitfinex-spot"],
    ["USDT", 150, "spot", "bitfinex-spot"],
    ["ATOM", 12, "spot", "bitfinex-spot"],
  ]);
});

test("Bitfinex normalization preserves provider EUR quotes", () => {
  const rows = normalizeBitfinexBuckets({
    spot: [["BTC", "0.01"]],
    prices: { BTC: { priceEur: 91000, source: "bitfinex:tBTCEUR" } },
  });

  assert.equal(rows[0]?.quoteEur, 91000);
  assert.equal(rows[0]?.quoteSource, "bitfinex:tBTCEUR");
});

test("Bybit normalization preserves USDC, USDT and USD as separate web assets", () => {
  const rows = normalizeBybitBuckets({
    spot: [["USDC", "10"], ["USDT", "20"], ["USD", "30"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["USDC", 10, "spot", "bybit-spot"],
    ["USDT", 20, "spot", "bybit-spot"],
    ["USD", 30, "spot", "bybit-spot"],
  ]);
});

test("Bybit normalization aggregates exact uppercase symbols per bucket only", () => {
  const rows = normalizeBybitBuckets({
    spot: [["btc", "0.1"], ["BTC", "0.2"], ["BTC", "0.3"]],
    prices: { BTC: { priceEur: 90000, source: "bybit:BTCUSDT" } },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.symbol, "BTC");
  assert.ok(Math.abs((rows[0]?.balance ?? 0) - 0.6) < 0.00000001);
  assert.equal(rows[0]?.quoteEur, 90000);
  assert.equal(rows[0]?.quoteSource, "bybit:BTCUSDT");
});

test("Coinbase normalization preserves USD, USDC and EUR as separate web assets", () => {
  const rows = normalizeCoinbaseBuckets({
    spot: [["USD", "10"], ["USDC", "20"], ["EUR", "30"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["USD", 10, "spot", "coinbase-spot"],
    ["USDC", 20, "spot", "coinbase-spot"],
    ["EUR", 30, "spot", "coinbase-spot"],
  ]);
});

test("OKX normalization preserves USDC, USDT and DAI as separate web assets", () => {
  const rows = normalizeOkxBuckets({
    spot: [["USDC", "10"], ["USDT", "20"], ["DAI", "30"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["USDC", 10, "spot", "okx-spot"],
    ["USDT", 20, "spot", "okx-spot"],
    ["DAI", 30, "spot", "okx-spot"],
  ]);
});

test("krakenCanonicalSymbol maps Kraken asset codes to canonical tickers", () => {
  assert.equal(krakenCanonicalSymbol("XXBT"), "BTC");
  assert.equal(krakenCanonicalSymbol("XETH"), "ETH");
  assert.equal(krakenCanonicalSymbol("XXRP"), "XRP");
  assert.equal(krakenCanonicalSymbol("XETC"), "ETC");
  assert.equal(krakenCanonicalSymbol("ZUSD"), "USD");
});

test("Kraken normalization preserves USDC, USDT and DAI as separate web assets", () => {
  const rows = normalizeKrakenBuckets({
    spot: [["USDC", "10"], ["USDT", "20"], ["DAI", "30"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["USDC", 10, "spot", "kraken-spot"],
    ["USDT", 20, "spot", "kraken-spot"],
    ["DAI", 30, "spot", "kraken-spot"],
  ]);
});

test("Kraken normalization handles XXBT and XXRP aliases correctly", () => {
  const rows = normalizeKrakenBuckets({
    spot: [["XXBT", "1.5"], ["XXRP", "5000"], ["XETH", "2"]],
  });

  assert.deepEqual(rows.map((r) => [r.symbol, r.balance, r.bucket, r.source]), [
    ["BTC", 1.5, "spot", "kraken-spot"],
    ["XRP", 5000, "spot", "kraken-spot"],
    ["ETH", 2, "spot", "kraken-spot"],
  ]);
});
