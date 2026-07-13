import test from "node:test";
import assert from "node:assert/strict";
import { fetchStockFxQuotesViaRelay, fetchStockPricesViaRelay, fetchStockQuotesViaRelay } from "./stock-relay.js";

test("fetchStockPricesViaRelay posts symbols and returns the relay price map", async () => {
  let captured: { url: string; body: unknown } | null = null;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
    return {
      ok: true,
      json: async () => ({ ok: true, prices: { AAPL: { priceEur: 250, source: "yahoo:usd:AAPL" } } }),
    } as Response;
  };

  const prices = await fetchStockPricesViaRelay(["AAPL", "MSFT"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.equal(prices.AAPL?.priceEur, 250);
  assert.equal(captured!.url, "https://relay.example/stock/prices");
  assert.deepEqual((captured!.body as { symbols: string[] }).symbols, ["AAPL", "MSFT"]);
  assert.equal((captured!.body as { token: string }).token, "secret");
});

test("fetchStockPricesViaRelay returns empty map on relay error without throwing", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({ ok: false }) } as Response);
  const prices = await fetchStockPricesViaRelay(["AAPL"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });
  assert.deepEqual(prices, {});
});

test("fetchStockPricesViaRelay returns empty map when no symbols", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return {} as Response; };
  const prices = await fetchStockPricesViaRelay([], { fetchImpl, relayUrl: "https://relay.example", relayToken: "secret" });
  assert.deepEqual(prices, {});
  assert.equal(called, false);
});

test("fetchStockQuotesViaRelay normalizes and deduplicates symbols", async () => {
  let captured: { url: string; body: unknown } | null = null;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        quotes: {
          " hyxs ": { priceNative: 2180000, currency: " krw ", yahooTicker: " 000660.KS ", source: " yahoo:relay " },
          EXTRA: { priceNative: 1, currency: "USD", yahooTicker: "EXTRA", source: "yahoo:relay" },
        },
      }),
    } as Response;
  };

  const quotes = await fetchStockQuotesViaRelay([" hyxs ", "HYXS", "ssu"], {
    fetchImpl,
    relayUrl: "https://relay.example/",
    relayToken: "secret",
  });

  assert.deepEqual((captured!.body as { symbols: string[] }).symbols, ["HYXS", "SSU"]);
  assert.equal(captured!.url, "https://relay.example/stock/quotes");
  assert.deepEqual(quotes.HYXS, {
    priceNative: 2180000,
    currency: "KRW",
    yahooTicker: "000660.KS",
    source: "yahoo:relay",
  });
  assert.equal(quotes.EXTRA, undefined);
});

test("fetchStockQuotesViaRelay drops every malformed native quote record", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      quotes: {
        GOOD: { priceNative: 12.5, currency: "USD", yahooTicker: "GOOD", source: "yahoo:relay" },
        ZERO: { priceNative: 0, currency: "USD", yahooTicker: "ZERO", source: "yahoo:relay" },
        NAN: { priceNative: Number.NaN, currency: "USD", yahooTicker: "NAN", source: "yahoo:relay" },
        CURRENCY: { priceNative: 1, currency: "", yahooTicker: "CURRENCY", source: "yahoo:relay" },
        TICKER: { priceNative: 1, currency: "USD", yahooTicker: 123, source: "yahoo:relay" },
        SOURCE: { priceNative: 1, currency: "USD", yahooTicker: "SOURCE" },
        BADSRC: { priceNative: 1, currency: "USD", yahooTicker: "BADSRC", source: "yahoo:direct" },
        BADCCY: { priceNative: 1, currency: "XYZ", yahooTicker: "BADCCY", source: "yahoo:relay" },
        WRONG_TICKER: { priceNative: 1, currency: "USD", yahooTicker: "MSFT", source: "yahoo:relay" },
        "NOT VALID!": { priceNative: 1, currency: "USD", yahooTicker: "INVALID", source: "yahoo:relay" },
      },
    }),
  } as Response);

  const quotes = await fetchStockQuotesViaRelay(["GOOD", "ZERO", "NAN", "CURRENCY", "TICKER", "SOURCE", "BADSRC", "BADCCY", "WRONG_TICKER"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.deepEqual(quotes, {
    GOOD: { priceNative: 12.5, currency: "USD", yahooTicker: "GOOD", source: "yahoo:relay" },
  });
});

test("fetchStockQuotesViaRelay accepts only mapped candidates and canonical GBX", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      quotes: {
        SHEL: { priceNative: 2815, currency: "GBp", yahooTicker: "SHEL.L", source: "yahoo:relay" },
        HYXS: { priceNative: 2180000, currency: "KRW", yahooTicker: "AAPL", source: "yahoo:relay" },
      },
    }),
  } as Response);

  const quotes = await fetchStockQuotesViaRelay(["SHEL", "HYXS"], { fetchImpl, relayUrl: "https://relay.example", relayToken: "secret" });

  assert.equal(quotes.SHEL?.currency, "GBX");
  assert.equal(quotes.HYXS, undefined);
});

test("fetchStockQuotesViaRelay correlates HYXS with its expected KRW currency", async () => {
  const fetchQuote = async (currency: string) => fetchStockQuotesViaRelay(["HYXS"], {
    relayUrl: "https://relay.example",
    relayToken: "secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        quotes: {
          HYXS: { priceNative: 2180000, currency, yahooTicker: "000660.KS", source: "yahoo:relay" },
        },
      }),
    } as Response),
  });

  assert.deepEqual(await fetchQuote("USD"), {});
  assert.deepEqual((await fetchQuote("KRW")).HYXS, {
    priceNative: 2180000,
    currency: "KRW",
    yahooTicker: "000660.KS",
    source: "yahoo:relay",
  });
});

test("fetchStockQuotesViaRelay accepts the canonical TSFA Taiwan native contract", async () => {
  const quotes = await fetchStockQuotesViaRelay(["TSFA"], {
    relayUrl: "https://relay.example",
    relayToken: "secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        quotes: {
          TSFA: { priceNative: 100, currency: "TWD", yahooTicker: "2330.TW", source: "yahoo:relay" },
        },
      }),
    } as Response),
  });

  assert.deepEqual(quotes.TSFA, {
    priceNative: 100,
    currency: "TWD",
    yahooTicker: "2330.TW",
    source: "yahoo:relay",
  });
});

test("fetchStockQuotesViaRelay rejects more than 300 inputs before deduplication", async () => {
  let called = false;
  const quotes = await fetchStockQuotesViaRelay(Array.from({ length: 301 }, () => "AAPL"), {
    fetchImpl: async () => { called = true; return {} as Response; },
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.deepEqual(quotes, {});
  assert.equal(called, false);
});

test("fetchStockFxQuotesViaRelay rejects more than 20 inputs before deduplication", async () => {
  let called = false;
  const quotes = await fetchStockFxQuotesViaRelay(Array.from({ length: 21 }, () => "KRW"), {
    fetchImpl: async () => { called = true; return {} as Response; },
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.deepEqual(quotes, {});
  assert.equal(called, false);
});

test("fetchStockQuotesViaRelay canonicalizes Yahoo GBp pence to GBX", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      quotes: {
        SHEL: { priceNative: 2815, currency: "GBp", yahooTicker: "SHEL.L", source: "yahoo:relay" },
      },
    }),
  } as Response);

  const quotes = await fetchStockQuotesViaRelay(["SHEL"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.equal(quotes.SHEL?.currency, "GBX");
});

test("fetchStockFxQuotesViaRelay posts canonical currencies and validates quotes strictly", async () => {
  let captured: { url: string; body: unknown; signal: AbortSignal | null } | null = null;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")), signal: init?.signal ?? null };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        quotes: {
          KRW: { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" },
          GBP: { unitsPerEur: 0.86, currency: "GBP", yahooTicker: "EURGBP=X", source: "yahoo:relay" },
          BAD_ZERO: { unitsPerEur: 0, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" },
          BAD_TICKER: { unitsPerEur: 1, currency: "KRW", yahooTicker: 1, source: "yahoo:relay" },
          USD: { unitsPerEur: 1.1, currency: "USD", yahooTicker: "EURUSD=X", source: "yahoo:relay" },
        },
      }),
    } as Response;
  };

  const quotes = await fetchStockFxQuotesViaRelay(["krw", "GBX", "GBp"], { fetchImpl, relayUrl: "https://relay.example/", relayToken: "secret" });

  assert.equal(captured!.url, "https://relay.example/stock/fx-quotes");
  assert.deepEqual((captured!.body as { currencies: string[] }).currencies, ["KRW", "GBP"]);
  assert.ok(captured!.signal instanceof AbortSignal);
  assert.deepEqual(quotes, {
    KRW: { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" },
    GBP: { unitsPerEur: 0.86, currency: "GBP", yahooTicker: "EURGBP=X", source: "yahoo:relay" },
  });
});

test("fetchStockFxQuotesViaRelay returns empty on abort or malformed envelopes", async () => {
  const aborted = await fetchStockFxQuotesViaRelay(["KRW"], {
    relayUrl: "https://relay.example",
    relayToken: "secret",
    fetchImpl: async (_url, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new DOMException("aborted", "AbortError");
    },
  });
  const malformed = await fetchStockFxQuotesViaRelay(["KRW"], {
    relayUrl: "https://relay.example",
    relayToken: "secret",
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, quotes: [] }) } as Response),
  });

  assert.deepEqual(aborted, {});
  assert.deepEqual(malformed, {});
});

test("fetchStockFxQuotesViaRelay accepts only the exact relay EUR identity", async () => {
  for (const eurQuote of [
    { unitsPerEur: 2, currency: "EUR", yahooTicker: "EUR", source: "identity:eur" },
    { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR", source: "yahoo:relay" },
    { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR=X", source: "identity:eur" },
  ]) {
    const quotes = await fetchStockFxQuotesViaRelay(["EUR"], {
      relayUrl: "https://relay.example",
      relayToken: "secret",
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, quotes: { EUR: eurQuote } }) } as Response),
    });
    assert.deepEqual(quotes, {});
  }

  const valid = await fetchStockFxQuotesViaRelay(["EUR"], {
    relayUrl: "https://relay.example",
    relayToken: "secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        quotes: { EUR: { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR", source: "identity:eur" } },
      }),
    } as Response),
  });
  assert.deepEqual(valid.EUR, { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR", source: "identity:eur" });
});
