const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const test = require("node:test");
const {
  app,
  collectStockFxQuotes,
  collectStockNativeQuotes,
  normalizeStockFxCurrencies,
  normalizeStockQuoteSymbols,
  normalizeCoinbasePrivateKeyPem,
  mapBybitTickerPricesEur,
  mapCoinbaseTickerPricesEur,
  mapOkxTickerPricesEur,
  mapBybitTickerPricesUsd,
  enrichRowsWithUsdPrices,
  okxPushRow,
  mergeOkxEarnBalances,
} = require("./server.js");

const SERVER_SRC = fs.readFileSync(require.resolve("./server.js"), "utf8");

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

async function postAndDisconnect(url, body) {
  await new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    req.on("error", (err) => err.code === "ECONNRESET" ? resolve() : reject(err));
    req.end(JSON.stringify(body), () => setTimeout(() => {
      req.destroy();
      resolve();
    }, 10));
  });
}

test("normalizeCoinbasePrivateKeyPem rebuilds single-line EC PEM pasted from an input", () => {
  const raw = "-----BEGIN EC PRIVATE KEY----- MHcCAQEEIFakeBase64LineOneFakeBase64LineTwoFakeBase64LineTreFakeBase64LineFor -----END EC PRIVATE KEY-----";

  const pem = normalizeCoinbasePrivateKeyPem(raw);

  assert.match(pem, /^-----BEGIN EC PRIVATE KEY-----\n/);
  assert.match(pem, /\n-----END EC PRIVATE KEY-----$/);
  assert.ok(!pem.includes("KEY----- "));
});

test("normalizeCoinbasePrivateKeyPem preserves literal escaped newlines", () => {
  const raw = "-----BEGIN PRIVATE KEY-----\\nabc\\ndef\\n-----END PRIVATE KEY-----";

  assert.equal(normalizeCoinbasePrivateKeyPem(raw), "-----BEGIN PRIVATE KEY-----\nabc\ndef\n-----END PRIVATE KEY-----");
});

test("mapBybitTickerPricesEur prices exact symbols from USDT spot tickers", () => {
  const prices = mapBybitTickerPricesEur(["CC", "LINK"], [
    { symbol: "CCUSDT", lastPrice: "0.12" },
    { symbol: "LINKUSDT", lastPrice: "10" },
  ], 1.1);

  assert.equal(prices.CC.priceEur, 0.12 / 1.1);
  assert.equal(prices.CC.source, "bybit:CCUSDT");
  assert.equal(prices.LINK.priceEur, 10 / 1.1);
});

test("relay price mappers treat BCPEUR as a euro stable asset", () => {
  const prices = mapBybitTickerPricesEur(["BCPEUR"], [], 1.1);

  assert.equal(prices.BCPEUR.priceEur, 1);
  assert.equal(prices.BCPEUR.source, "bybit:fiat-eur");
});

test("mapCoinbaseTickerPricesEur prices exact symbols from USD spot tickers", () => {
  const prices = mapCoinbaseTickerPricesEur(["ALEO", "VET"], {
    ALEO: { amount: "0.032" },
    VET: { amount: "0.0052" },
  }, 1.1);

  assert.equal(prices.ALEO.priceEur, 0.032 / 1.1);
  assert.equal(prices.ALEO.source, "coinbase:ALEO-USD");
  assert.equal(prices.VET.priceEur, 0.0052 / 1.1);
});

test("mapOkxTickerPricesEur prices exact symbols from OKX spot tickers", () => {
  const prices = mapOkxTickerPricesEur(["ZEC", "CRO"], [
    { instId: "ZEC-USDT", last: "420" },
    { instId: "CRO-USDT", last: "0.08" },
  ], 1.2);

  assert.equal(prices.ZEC.priceEur, 420 / 1.2);
  assert.equal(prices.ZEC.source, "okx:ZEC-USDT");
  assert.equal(prices.CRO.priceEur, 0.08 / 1.2);
});

test("mapBybitTickerPricesUsd prices exact symbols from Bybit spot tickers", () => {
  assert.deepEqual(mapBybitTickerPricesUsd(["BTC", "USDT", "SLX"], [
    { symbol: "BTCUSDT", lastPrice: "100000" },
    { symbol: "SLXUSDC", lastPrice: "0.12" },
  ]), {
    BTC: 100000,
    USDT: 1,
    SLX: 0.12,
  });
});

test("generic CEX USD enrichment preserves row shape and derives value metadata", async () => {
  const rows = await enrichRowsWithUsdPrices([
    ["BTC", 0.2],
    ["USDT", 5],
    ["KNOWN", 2, 10, 5],
  ], async (symbols) => {
    assert.deepEqual(symbols.sort(), ["BTC", "USDT"]);
    return { BTC: 100000, USDT: 1 };
  });
  assert.deepEqual(rows.map((row) => Array.from({ length: 5 }, (_, i) => row[i])), [
    ["BTC", 0.2, undefined, 20000, 100000],
    ["USDT", 5, undefined, 5, 1],
    ["KNOWN", 2, 10, 5, undefined],
  ]);
});

test("mergeOkxEarnBalances merges savings and staking/defi active orders", () => {
  const rows = [["USDT", 10, "trading"]];
  const seen = { "USDT|trading": 0 };

  mergeOkxEarnBalances(rows, seen, {
    savings: [
      { ccy: "USDT", amt: "2.5" },
      { ccy: "EUR", redemptAmt: "4" },
      { ccy: "BTC", earningAmt: "0.01" },
      { ccy: "ZERO", amt: "0" },
    ],
    stakingDefi: [
      { ccy: "SOL", investData: [{ amt: "1.25" }] },
      { ccy: "ETH", investData: [{ ccy: "ETH", amt: "0.5" }, { ccy: "USDT", amt: "3" }] },
      { ccy: "BAD", investData: [{ amt: "0" }] },
    ],
  });

  assert.deepEqual(rows, [
    ["USDT", 10, "trading"],
    ["USDT", 5.5, "earn"],
    ["EURC", 4, "earn"],
    ["BTC", 0.01, "earn"],
    ["SOL", 1.25, "earn"],
    ["ETH", 0.5, "earn"],
  ]);
});

test("OKX rows preserve source buckets instead of labelling Earn as spot", () => {
  const rows = [];
  const seen = {};

  okxPushRow(rows, seen, "BTC", "0.1", "trading");
  okxPushRow(rows, seen, "BTC", "0.2", "earn");
  okxPushRow(rows, seen, "BTC", "0.3", "earn");

  assert.deepEqual(rows, [
    ["BTC", 0.1, "trading"],
    ["BTC", 0.5, "earn"],
  ]);
});

test("OKX rows preserve native USD valuation metadata when provided", () => {
  const rows = [];
  const seen = {};

  okxPushRow(rows, seen, "BTC", "0.1", "trading", { valueUsd: 10, priceUsd: 100 });
  okxPushRow(rows, seen, "BTC", "0.2", "trading", { valueUsd: 30, priceUsd: 150 });
  okxPushRow(rows, seen, "SLX", "8", "funding", { priceUsd: 0.12 });

  assert.deepEqual(rows, [
    ["BTC", 0.3, "trading", 40, 133.33333333333334],
    ["SLX", 8, "funding", 0.96, 0.12],
  ]);
});

test("legacy OKX endpoint enriches funding and earn rows with OKX ticker prices", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetchBalances = app.locals.okxFetchBalances;
  const previousFetchPricesUsd = app.locals.fetchOkxPricesUsd;
  process.env.RELAY_TOKEN = "test-token";
  app.locals.okxFetchBalances = async () => [["SLX", 8, "funding"], ["BTC", 0.1, "earn"]];
  app.locals.fetchOkxPricesUsd = async (symbols) => {
    assert.deepEqual(symbols.sort(), ["BTC", "SLX"]);
    return { SLX: 0.12, BTC: 100000 };
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(baseUrl + "/okx?token=test-token");
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.spot, [["SLX", 8, "funding", 0.96, 0.12], ["BTC", 0.1, "earn", 10000, 100000]]);
    });
  } finally {
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
    if (previousFetchBalances) app.locals.okxFetchBalances = previousFetchBalances;
    else delete app.locals.okxFetchBalances;
    if (previousFetchPricesUsd) app.locals.fetchOkxPricesUsd = previousFetchPricesUsd;
    else delete app.locals.fetchOkxPricesUsd;
  }
});

test("OKX earn fetches are timeout guarded so /okx never hangs on finance endpoints", () => {
  assert.match(SERVER_SRC, /const OKX_EARN_FETCH_TIMEOUT_MS\s*=\s*8000/);
  assert.match(SERVER_SRC, /signal:\s*options\s*&&\s*options\.signal/);
  assert.match(SERVER_SRC, /okxEarnAuthGet\(/);
  assert.match(SERVER_SRC, /controller\.abort\(/);
  assert.match(SERVER_SRC, /Promise\.allSettled\(/);
});

test("collectStockNativeQuotes returns HYXS in native KRW without FX conversion", async () => {
  const quotes = await collectStockNativeQuotes(["HYXS"], {
    fetchQuote: async (candidate) => candidate === "000660.KS"
      ? { price: 2180000, currency: "KRW", currencyRaw: "KRW" }
      : null,
  });

  assert.deepEqual(quotes.HYXS, {
    priceNative: 2180000,
    currency: "KRW",
    yahooTicker: "000660.KS",
    source: "yahoo:relay",
  });
});

test("collectStockNativeQuotes uses exact raw Yahoo tickers only when no explicit alias exists", async () => {
  const rawCandidates = [];
  const rawQuotes = await collectStockNativeQuotes(["AAPL", "000660.KS"], {
    fetchQuote: async (candidate) => {
      rawCandidates.push(candidate);
      return null;
    },
  });
  const aliasCandidates = [];
  const aliasQuotes = await collectStockNativeQuotes(["SHEL"], {
    fetchQuote: async (candidate) => {
      aliasCandidates.push(candidate);
      return { price: 100, currency: "USD", currencyRaw: "USD" };
    },
  });

  assert.deepEqual(rawQuotes, {});
  assert.deepEqual(rawCandidates, ["AAPL", "000660.KS"]);
  assert.equal(aliasQuotes.SHEL.yahooTicker, "SHEL.L");
  assert.deepEqual(aliasCandidates, ["SHEL.L"]);
});

test("collectStockFxQuotes returns KRW units per EUR and canonicalizes GBX to GBP", async () => {
  const candidates = [];
  const quotes = await collectStockFxQuotes(["KRW", "GBX", "GBp", "EUR"], {
    fetchQuote: async (candidate) => {
      candidates.push(candidate);
      return { price: candidate === "EURKRW=X" ? 1717.17 : 0.86, currency: "EUR" };
    },
  });

  assert.deepEqual(candidates, ["EURKRW=X", "EURGBP=X"]);
  assert.deepEqual(quotes.KRW, { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" });
  assert.deepEqual(quotes.GBP, { unitsPerEur: 0.86, currency: "GBP", yahooTicker: "EURGBP=X", source: "yahoo:relay" });
  assert.deepEqual(quotes.EUR, { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR", source: "identity:eur" });
});

test("normalizeStockFxCurrencies validates before dedupe and rejects unsupported currencies", () => {
  assert.equal(normalizeStockFxCurrencies(Array.from({ length: 21 }, () => "KRW")), null);
  assert.equal(normalizeStockFxCurrencies(["KRW", "USD"]), null);
  assert.deepEqual(normalizeStockFxCurrencies(["gbx", "GBp", "krw"]), ["GBP", "KRW"]);
});

test("collectStockFxQuotes propagates the shared abort without launching later work", async () => {
  const controller = new AbortController();
  const candidates = [];
  const collecting = collectStockFxQuotes(["KRW", "JPY"], {
    concurrency: 1,
    signal: controller.signal,
    fetchQuote: (candidate, options) => {
      candidates.push(candidate);
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    },
  });
  setTimeout(() => controller.abort(new Error("deadline")), 5);

  await collecting;
  assert.deepEqual(candidates, ["EURKRW=X"]);
});

test("collectStockFxQuotes bounds workers and aborts each fetch at its timeout", async () => {
  let active = 0;
  let maxActive = 0;
  const signals = [];
  await collectStockFxQuotes(["KRW", "JPY", "CHF", "CAD"], {
    concurrency: 2,
    timeoutMs: 10,
    fetchQuote: (_candidate, options) => {
      active++;
      maxActive = Math.max(maxActive, active);
      signals.push(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          active--;
          reject(options.signal.reason);
        }, { once: true });
      });
    },
  });

  assert.equal(maxActive, 2);
  assert.equal(signals.length, 4);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal && signal.aborted));
});

test("collectStockNativeQuotes does not apply the Samsung receipt multiplier", async () => {
  const quotes = await collectStockNativeQuotes(["ssu", "SSU"], {
    fetchQuote: async () => ({ price: 87000, currency: "KRW", currencyRaw: "KRW" }),
  });

  assert.deepEqual(quotes.SSU, {
    priceNative: 87000,
    currency: "KRW",
    yahooTicker: "005930.KS",
    source: "yahoo:relay",
  });
  assert.equal(Object.keys(quotes).length, 1);
});

test("collectStockNativeQuotes canonicalizes Yahoo GBp pence to GBX", async () => {
  const quotes = await collectStockNativeQuotes(["SHEL"], {
    fetchQuote: async () => ({ price: 2815, currency: "GBp", currencyRaw: "GBp" }),
  });

  assert.equal(quotes.SHEL.currency, "GBX");
});

test("collectStockNativeQuotes bounds concurrency and supplies a fetch timeout", async () => {
  let active = 0;
  let maxActive = 0;
  const signals = [];
  await collectStockNativeQuotes(["AAPL", "MSFT", "NVDA", "AMD", "META"], {
    concurrency: 2,
    timeoutMs: 1234,
    fetchQuote: async (_candidate, options) => {
      active++;
      maxActive = Math.max(maxActive, active);
      signals.push(options.signal);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { price: 1, currency: "USD", currencyRaw: "USD" };
    },
  });

  assert.equal(maxActive, 2);
  assert.equal(signals.length, 5);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
});

test("collectStockNativeQuotes propagates a shared abort and does not launch later candidates", async () => {
  const controller = new AbortController();
  const candidates = [];
  const signals = [];
  const collecting = collectStockNativeQuotes(["TCTZF"], {
    signal: controller.signal,
    timeoutMs: 100,
    fetchQuote: (candidate, options) => {
      candidates.push(candidate);
      signals.push(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    },
  });

  setTimeout(() => controller.abort(new Error("request deadline")), 5);
  await collecting;

  assert.deepEqual(candidates, ["TCEHY"]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
});

test("normalizeStockQuoteSymbols rejects more than 300 requested symbols before deduplication", () => {
  assert.equal(normalizeStockQuoteSymbols(Array.from({ length: 301 }, () => "AAPL")), null);
});

test("POST /stock/quotes returns only the native quote contract", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      chart: { result: [{ meta: { regularMarketPrice: 2180000, currency: "KRW" } }] },
    }),
  });
  try {
    await withServer(async (baseUrl) => {
      const response = await previousFetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["hyxs"] }),
      });

      assert.deepEqual(await response.json(), {
        ok: true,
        quotes: {
          HYXS: {
            priceNative: 2180000,
            currency: "KRW",
            yahooTicker: "000660.KS",
            source: "yahoo:relay",
          },
        },
      });
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/quotes omits Yahoo quotes with missing or blank currency", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  let call = 0;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      chart: { result: [{ meta: { regularMarketPrice: 100, ...(call++ === 0 ? {} : { currency: "   " }) } }] },
    }),
  });
  try {
    await withServer(async (baseUrl) => {
      const response = await previousFetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["AAPL", "MSFT"] }),
      });
      assert.deepEqual((await response.json()).quotes, {});
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/quotes uses the canonical TSFA Taiwan ticker without changing legacy prices", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  const yahooUrls = [];
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.binance.com/api/v3/ticker/price")) return { ok: true, text: async () => "[]" };
    yahooUrls.push(value);
    return {
      ok: true,
      json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 100, currency: value.includes("2330.TW") ? "TWD" : "USD" } }] } }),
    };
  };
  try {
    await withServer(async (baseUrl) => {
      const nativeResponse = await previousFetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["TSFA"] }),
      });
      assert.deepEqual((await nativeResponse.json()).quotes.TSFA, {
        priceNative: 100,
        currency: "TWD",
        yahooTicker: "2330.TW",
        source: "yahoo:relay",
      });

      await previousFetch(baseUrl + "/stock/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["TSFA"] }),
      });
      assert.ok(yahooUrls[0].includes("2330.TW"));
      assert.ok(yahooUrls[1].includes("TSM"));
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/quotes requires relay auth and rejects invalid symbol bounds", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  process.env.RELAY_TOKEN = "relay-test-token";
  try {
    await withServer(async (baseUrl) => {
      const unauthorized = await fetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: ["AAPL"] }),
      });
      assert.equal(unauthorized.status, 401);

      const queryOnly = await fetch(baseUrl + "/stock/quotes?token=relay-test-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: ["AAPL"] }),
      });
      assert.equal(queryOnly.status, 401);

      const tooMany = await fetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: Array.from({ length: 301 }, (_, i) => "S" + i) }),
      });
      assert.equal(tooMany.status, 400);

      const invalid = await fetch(baseUrl + "/stock/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["AAPL", "not valid!"] }),
      });
      assert.equal(invalid.status, 400);
    });
  } finally {
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/fx-quotes requires auth, enforces bounds, and returns raw FX quotes", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: String(url).includes("EURKRW") ? 1717.17 : 0.86, currency: "EUR" } }] } }),
  });
  try {
    await withServer(async (baseUrl) => {
      const unauthorized = await previousFetch(baseUrl + "/stock/fx-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currencies: ["KRW"] }) });
      assert.equal(unauthorized.status, 401);
      const queryOnly = await previousFetch(baseUrl + "/stock/fx-quotes?token=relay-test-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currencies: ["KRW"] }) });
      assert.equal(queryOnly.status, 401);
      const tooMany = await previousFetch(baseUrl + "/stock/fx-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "relay-test-token", currencies: Array.from({ length: 21 }, () => "KRW") }) });
      assert.equal(tooMany.status, 400);
      const invalid = await previousFetch(baseUrl + "/stock/fx-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "relay-test-token", currencies: ["USD"] }) });
      assert.equal(invalid.status, 400);
      const response = await previousFetch(baseUrl + "/stock/fx-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "relay-test-token", currencies: ["KRW", "GBX"] }) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.quotes.KRW.unitsPerEur, 1717.17);
      assert.equal(body.quotes.GBP.yahooTicker, "EURGBP=X");
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/fx-quotes applies one shared request deadline", async () => {
  const previousEnv = process.env.NODE_ENV;
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  const previousTimeout = app.locals.stockFxRequestTimeoutMs;
  process.env.RELAY_TOKEN = "relay-test-token";
  process.env.NODE_ENV = "test";
  app.locals.stockFxRequestTimeoutMs = 15;
  const signals = [];
  global.fetch = async (_url, options) => {
    signals.push(options.signal);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  };
  try {
    await withServer(async (baseUrl) => {
      const startedAt = Date.now();
      const response = await previousFetch(baseUrl + "/stock/fx-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", currencies: ["KRW", "JPY", "CHF", "CAD", "AUD"] }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).quotes, {});
      assert.ok(Date.now() - startedAt < 250);
      assert.equal(signals.length, 4);
      assert.ok(signals.every((signal) => signal.aborted));
    });
  } finally {
    global.fetch = previousFetch;
    if (previousTimeout == null) delete app.locals.stockFxRequestTimeoutMs;
    else app.locals.stockFxRequestTimeoutMs = previousTimeout;
    if (previousEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("production ignores mutable stock FX timeout overrides", async () => {
  const previousEnv = process.env.NODE_ENV;
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  const previousTimeout = app.locals.stockFxRequestTimeoutMs;
  process.env.NODE_ENV = "production";
  process.env.RELAY_TOKEN = "relay-test-token";
  app.locals.stockFxRequestTimeoutMs = 1;
  global.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 1717.17, currency: "EUR" } }] } }) };
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await previousFetch(baseUrl + "/stock/fx-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "relay-test-token", currencies: ["KRW"] }) });
      assert.equal((await response.json()).quotes.KRW.unitsPerEur, 1717.17);
    });
  } finally {
    global.fetch = previousFetch;
    if (previousTimeout == null) delete app.locals.stockFxRequestTimeoutMs;
    else app.locals.stockFxRequestTimeoutMs = previousTimeout;
    if (previousEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("stock quote endpoints abort outbound work when the client disconnects", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  const aborted = [];
  global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted.push(options.signal.aborted);
      reject(options.signal.reason);
    }, { once: true });
  });
  try {
    await withServer(async (baseUrl) => {
      await postAndDisconnect(baseUrl + "/stock/quotes", { token: "relay-test-token", symbols: ["AAPL"] });
      await postAndDisconnect(baseUrl + "/stock/fx-quotes", { token: "relay-test-token", currencies: ["KRW"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.deepEqual(aborted, [true, true]);
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/prices keeps legacy query token compatibility", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  global.fetch = async () => ({ ok: true, text: async () => "[]" });
  try {
    await withServer(async (baseUrl) => {
      const response = await previousFetch(baseUrl + "/stock/prices?token=relay-test-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: [] }) });
      assert.equal(response.status, 200);
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});

test("POST /stock/prices keeps legacy GBp-to-EUR conversion behavior", async () => {
  const previousToken = process.env.RELAY_TOKEN;
  const previousFetch = global.fetch;
  process.env.RELAY_TOKEN = "relay-test-token";
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.binance.com/api/v3/ticker/price")) {
      return { ok: true, text: async () => "[]" };
    }
    if (value.includes("SHEL.L")) {
      return {
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 100, currency: "GBp" } }] } }),
      };
    }
    if (value.includes("EURGBP%3DX")) {
      return {
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 0.8, currency: "GBP" } }] } }),
      };
    }
    throw new Error("Unexpected fetch " + value);
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await previousFetch(baseUrl + "/stock/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "relay-test-token", symbols: ["SHEL"] }),
      });
      const body = await response.json();

      assert.equal(body.prices.SHEL.priceEur, 1.25);
      assert.equal(body.prices.SHEL.source, "yahoo:gbx:SHEL.L");
    });
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.RELAY_TOKEN;
    else process.env.RELAY_TOKEN = previousToken;
  }
});
