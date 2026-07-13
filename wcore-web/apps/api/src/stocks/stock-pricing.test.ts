import assert from "node:assert/strict";
import test from "node:test";
import type { StockNativeQuote } from "../cex/stock-relay.js";
import { resolveStockPrice, type ResolvedStockPrice } from "./stock-pricing.js";

const NOW = "2026-07-10T12:00:00.000Z";

function quote(priceNative: number, currency: string): StockNativeQuote {
  return { priceNative, currency, yahooTicker: "TEST", source: "yahoo:relay" };
}

function lastGood(priceEur = 90): ResolvedStockPrice {
  return {
    priceNative: 100,
    currency: "EUR",
    priceEur,
    priceSource: "yahoo:relay",
    fallbackSource: null,
    appliedRatio: 1,
    stale: false,
    updatedAt: "2026-07-09T12:00:00.000Z",
    errors: [],
  };
}

test("converts the HYXS 000660.KS quote of 2,180,000 KRW to about 1,270 EUR", () => {
  const nativeToEur = 1 / 1717.17;
  const result = resolveStockPrice({
    quote: {
      priceNative: 2_180_000,
      currency: "KRW",
      yahooTicker: "000660.KS",
      source: "yahoo:relay",
    },
    nativeToEur,
    companiesMarketCapPriceEur: 1_270,
    lastGood: null,
    now: NOW,
  });

  assert.ok(result.priceEur! > 1_200 && result.priceEur! < 1_400);
  assert.deepEqual(result, {
    priceNative: 2_180_000,
    currency: "KRW",
    priceEur: 2_180_000 * nativeToEur,
    priceSource: "yahoo:relay",
    fallbackSource: "companiesmarketcap",
    appliedRatio: 1,
    stale: false,
    updatedAt: NOW,
    errors: [],
  });
});

test("converts EUR, USD, CHF, and JPY quotes with the supplied rates", () => {
  const cases = [
    { currency: "EUR", rate: undefined, expected: 100 },
    { currency: "USD", rate: 0.85, expected: 85 },
    { currency: "CHF", rate: 1.04, expected: 104 },
    { currency: "JPY", rate: 0.0054, expected: 0.54 },
  ];

  for (const { currency, rate, expected } of cases) {
    const result = resolveStockPrice({
      quote: quote(100, currency),
      nativeToEur: rate,
      companiesMarketCapPriceEur: null,
      lastGood: null,
      now: NOW,
    });
    assert.equal(result.priceEur, expected, currency);
  }
});

test("converts raw Yahoo GBp and canonical relay GBX as pence", () => {
  for (const currency of ["GBp", "GBX"]) {
    const result = resolveStockPrice({
      quote: quote(12_345, currency),
      nativeToEur: 1.18,
      companiesMarketCapPriceEur: null,
      lastGood: null,
      now: NOW,
    });

    assert.equal(result.priceEur, 145.671, currency);
  }
});

test("does not interpret GBP as pence", () => {
  const result = resolveStockPrice({
    quote: quote(12_345, "GBP"),
    nativeToEur: 1.18,
    companiesMarketCapPriceEur: null,
    lastGood: null,
    now: NOW,
  });

  assert.equal(result.priceEur, null);
  assert.deepEqual(result.errors, [{ code: "price_unavailable", message: "No valid stock price is available" }]);
});

test("keeps Yahoo at exact decimal 15% drift including 1 versus 0.85", () => {
  const cases: Array<[number, number]> = [[100, 85], [1, 0.85], [1e-7, 8.5e-8]];
  for (const [yahooPrice, companiesMarketCapPriceEur] of cases) {
    const result = resolveStockPrice({
      quote: quote(yahooPrice, "EUR"),
      nativeToEur: null,
      companiesMarketCapPriceEur,
      lastGood: lastGood(),
      now: NOW,
    });
    assert.equal(result.priceEur, yahooPrice);
    assert.equal(result.stale, false);
  }
});

test("keeps Yahoo at 14.99% drift but rejects 15.01%", () => {
  const accepted = resolveStockPrice({
    quote: quote(100, "EUR"),
    nativeToEur: null,
    companiesMarketCapPriceEur: 85.01,
    lastGood: lastGood(),
    now: NOW,
  });
  assert.equal(accepted.priceEur, 100);
  assert.equal(accepted.stale, false);

  const result = resolveStockPrice({
    quote: quote(100, "EUR"),
    nativeToEur: null,
    companiesMarketCapPriceEur: 84.99,
    lastGood: lastGood(95),
    now: NOW,
  });
  assert.equal(result.priceEur, 95);
  assert.equal(result.stale, true);
  assert.deepEqual(result.errors, [{ code: "source_drift", message: "Yahoo and CompaniesMarketCap prices differ by more than 15%" }]);
});

test("returns a structured drift error instead of averaging when no last-good exists", () => {
  const result = resolveStockPrice({
    quote: quote(200, "EUR"),
    nativeToEur: null,
    companiesMarketCapPriceEur: 100,
    lastGood: null,
    now: NOW,
  });

  assert.equal(result.priceEur, null);
  assert.equal(result.priceSource, null);
  assert.deepEqual(result.errors, [{ code: "source_drift", message: "Yahoo and CompaniesMarketCap prices differ by more than 15%" }]);
});

test("rejects the next representable CompaniesMarketCap price beyond 15%", () => {
  const result = resolveStockPrice({
    quote: quote(1, "EUR"),
    nativeToEur: null,
    companiesMarketCapPriceEur: 0.8499999999999999,
    lastGood: null,
    now: NOW,
  });

  assert.equal(result.priceEur, null);
  assert.deepEqual(result.errors, [{ code: "source_drift", message: "Yahoo and CompaniesMarketCap prices differ by more than 15%" }]);
});

test("accepts relay-supported non-USD stock quote currencies with supplied FX rates", () => {
  for (const currency of ["CNY", "HKD", "TWD", "SEK", "DKK", "NOK", "AUD", "CAD", "SAR", "AED"]) {
    const result = resolveStockPrice({
      quote: quote(100, currency),
      nativeToEur: 0.5,
      companiesMarketCapPriceEur: null,
      lastGood: null,
      now: NOW,
    });
    assert.equal(result.priceEur, 50, currency);
    assert.equal(result.currency, currency, currency);
    assert.deepEqual(result.errors, [], currency);
  }
});

test("never treats an unknown or missing currency as USD", () => {
  for (const currency of ["XYZ", ""]) {
    const result = resolveStockPrice({
      quote: quote(100, currency),
      nativeToEur: 0.85,
      companiesMarketCapPriceEur: null,
      lastGood: null,
      now: NOW,
    });
    assert.equal(result.priceEur, null, currency || "missing");
    assert.deepEqual(result.errors, [{ code: "price_unavailable", message: "No valid stock price is available" }]);
  }
});

test("uses CompaniesMarketCap when Yahoo is unavailable", () => {
  const result = resolveStockPrice({
    quote: null,
    nativeToEur: null,
    companiesMarketCapPriceEur: 123,
    lastGood: lastGood(),
    now: NOW,
  });

  assert.equal(result.priceEur, 123);
  assert.equal(result.priceSource, "companiesmarketcap");
  assert.equal(result.stale, false);
  assert.equal(result.updatedAt, NOW);
});

test("uses a valid last-good price when no fresh source is available", () => {
  const cached = lastGood(88);
  cached.errors = [{ code: "cached_warning", message: "Cached warning" }];
  const result = resolveStockPrice({
    quote: null,
    nativeToEur: null,
    companiesMarketCapPriceEur: null,
    lastGood: cached,
    now: NOW,
  });

  assert.equal(result.priceEur, 88);
  assert.equal(result.stale, true);
  assert.equal(result.updatedAt, cached.updatedAt);
  assert.deepEqual(result.errors, [
    { code: "cached_warning", message: "Cached warning" },
    { code: "price_unavailable", message: "No valid stock price is available" },
  ]);
  assert.notEqual(result.errors, cached.errors);
  result.errors.push({ code: "result_only", message: "Result only" });
  assert.deepEqual(cached.errors, [{ code: "cached_warning", message: "Cached warning" }]);
});

test("falls back to a valid ISO timestamp when now is invalid", () => {
  for (const now of [new Date(Number.NaN), "not-a-date"]) {
    const result = resolveStockPrice({
      quote: quote(100, "EUR"),
      nativeToEur: null,
      companiesMarketCapPriceEur: null,
      lastGood: null,
      now,
    });
    assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
    assert.equal(new Date(result.updatedAt).toISOString(), result.updatedAt);
  }
});

test("returns no price when all sources and last-good are unavailable or invalid", () => {
  for (const invalid of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = resolveStockPrice({
      quote: invalid === undefined ? null : quote(invalid ?? Number.NaN, "EUR"),
      nativeToEur: null,
      companiesMarketCapPriceEur: invalid,
      lastGood: null,
      now: NOW,
    });
    assert.equal(result.priceEur, null);
    assert.equal(result.updatedAt, NOW);
  }
});

test("reports appliedRatio as metadata without multiplying the ordinary-share price", () => {
  const result = resolveStockPrice({
    quote: quote(100, "EUR"),
    nativeToEur: null,
    companiesMarketCapPriceEur: null,
    lastGood: null,
    appliedRatio: 25,
    now: NOW,
  });

  assert.equal(result.priceEur, 100);
  assert.equal(result.appliedRatio, 25);
});

test("rejects invalid rates, ratios, and last-good prices", () => {
  const invalidCached = { ...lastGood(), priceEur: Number.POSITIVE_INFINITY };
  const result = resolveStockPrice({
    quote: quote(100, "USD"),
    nativeToEur: 0,
    companiesMarketCapPriceEur: -10,
    lastGood: invalidCached,
    appliedRatio: Number.NaN,
    now: NOW,
  });

  assert.equal(result.priceEur, null);
  assert.equal(result.appliedRatio, 1);
  assert.deepEqual(result.errors, [{ code: "price_unavailable", message: "No valid stock price is available" }]);
});

test("rejects last-good records containing other invalid numeric metadata", () => {
  for (const cached of [
    { ...lastGood(), priceNative: Number.POSITIVE_INFINITY },
    { ...lastGood(), appliedRatio: 0 },
  ]) {
    const result = resolveStockPrice({
      quote: null,
      nativeToEur: null,
      companiesMarketCapPriceEur: null,
      lastGood: cached,
      now: NOW,
    });
    assert.equal(result.priceEur, null);
    assert.equal(result.stale, false);
  }
});
