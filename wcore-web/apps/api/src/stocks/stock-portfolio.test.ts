import assert from "node:assert/strict";
import test from "node:test";
import { buildGsheetStockPortfolioSnapshot } from "./stock-portfolio.js";
import type { StockSnapshotRow } from "./stock-service.js";

function row(rank: number, canonicalTicker: string, aliases: string[] = []): StockSnapshotRow {
  return {
    rank,
    company: `Company ${rank}`,
    country: "US",
    sourceTicker: canonicalTicker,
    canonicalTicker,
    yahooTicker: canonicalTicker,
    bitpandaAliases: aliases,
    priceNative: 100,
    currency: "USD",
    priceEur: 90,
    priceSource: "yahoo:relay",
    fallbackSource: null,
    appliedRatio: 1,
    stale: false,
    updatedAt: "2026-07-11T12:00:00.000Z",
    errors: [],
    marketCapUsd: 1_000_000_000 / rank,
    marketCapEur: 900_000_000 / rank,
    supply: 10_000_000,
  };
}

test("caps ranked rows so the sheet does not expand to thousands of companies", () => {
  const snapshot = buildGsheetStockPortfolioSnapshot({
    generatedAt: "2026-07-11T12:00:00.000Z",
    ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
    rankedRows: Array.from({ length: 420 }, (_, index) => row(index + 1, `T${index + 1}`, index === 349 ? ["HELD"] : [])),
    holdings: [{ symbol: "HELD", balance: 2, updatedAt: "2026-07-11T11:00:00.000Z" }],
    holdingsStale: false,
  });

  assert.equal(snapshot.dynamicLimit, 420);
  assert.equal(snapshot.rows.length, 301);
  const held = snapshot.rows.find((item) => item.bitpandaSymbol === "HELD");
  assert.equal(held?.rank, null);
  assert.equal(held?.heldQuantity, 2);
  assert.equal(held?.heldValueEur, null);
  assert.equal(snapshot.stats.held, 1);
});

test("keeps minimum 300 rows and appends held positions outside the ranked universe", () => {
  const snapshot = buildGsheetStockPortfolioSnapshot({
    generatedAt: "2026-07-11T12:00:00.000Z",
    ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
    rankedRows: Array.from({ length: 300 }, (_, index) => row(index + 1, `T${index + 1}`)),
    holdings: [{ symbol: "OUTSIDE", balance: 3, updatedAt: "2026-07-11T11:00:00.000Z" }],
    holdingsStale: true,
    heldPrices: {
      OUTSIDE: {
        priceNative: 50,
        currency: "USD",
        priceEur: 45,
        priceSource: "yahoo:relay",
        fallbackSource: null,
        appliedRatio: 1,
        stale: true,
        updatedAt: "2026-07-10T12:00:00.000Z",
        errors: [{ code: "price_unavailable", message: "Using last-good price" }],
      },
    },
  });

  assert.equal(snapshot.dynamicLimit, 300);
  assert.equal(snapshot.rows.length, 301);
  const outside = snapshot.rows.at(-1)!;
  assert.equal(outside.canonicalTicker, "OUTSIDE");
  assert.equal(outside.rank, null);
  assert.equal(outside.bitpandaSymbol, "OUTSIDE");
  assert.equal(outside.heldQuantity, 3);
  assert.equal(outside.heldValueEur, 135);
  assert.equal(outside.holdingStale, true);
  assert.equal(snapshot.stats.heldOutsideRankedUniverse, 1);
  assert.equal(snapshot.stats.pricedStale, 1);
});

test("deduplicates exchange-prefixed Bitpanda holdings into ranked CMC rows", () => {
  const snapshot = buildGsheetStockPortfolioSnapshot({
    generatedAt: "2026-07-11T12:00:00.000Z",
    ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
    rankedRows: [row(20, "ASML"), row(40, "SAP"), row(50, "NVO"), row(60, "TSM")],
    holdings: [
      { symbol: "ASML", balance: 0.01 },
      { symbol: "SAP", balance: 0.02 },
      { symbol: "NOVO-B", balance: 0.03 },
      { symbol: "TSFA", balance: 0.04 },
    ],
    holdingsStale: false,
    heldPrices: {
      "AMS:ASML": { priceNative: 1, currency: "EUR", priceEur: 1, priceSource: "test", fallbackSource: null, appliedRatio: 1, stale: false, updatedAt: "2026-07-11T12:00:00.000Z", errors: [] },
      "ETR:SAP": { priceNative: 1, currency: "EUR", priceEur: 1, priceSource: "test", fallbackSource: null, appliedRatio: 1, stale: false, updatedAt: "2026-07-11T12:00:00.000Z", errors: [] },
      "CPH:NOVO-B": { priceNative: 1, currency: "DKK", priceEur: 1, priceSource: "test", fallbackSource: null, appliedRatio: 1, stale: false, updatedAt: "2026-07-11T12:00:00.000Z", errors: [] },
      "TPE:2330": { priceNative: 1, currency: "TWD", priceEur: 1, priceSource: "test", fallbackSource: null, appliedRatio: 1, stale: false, updatedAt: "2026-07-11T12:00:00.000Z", errors: [] },
    },
  });

  assert.equal(snapshot.rows.length, 4);
  assert.deepEqual(snapshot.rows.map((item) => item.canonicalTicker), ["ASML", "SAP", "NVO", "TSM"]);
  assert.deepEqual(snapshot.rows.map((item) => item.bitpandaSymbol), ["ASML", "SAP", "NOVO-B", "TSFA"]);
  assert.equal(snapshot.stats.heldOutsideRankedUniverse, 0);
});

test("deduplicates TSM receipts even when Bitpanda reports the exchange ticker", () => {
  const snapshot = buildGsheetStockPortfolioSnapshot({
    generatedAt: "2026-07-11T12:00:00.000Z",
    ownerAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
    rankedRows: [row(6, "TSM"), ...Array.from({ length: 4995 }, (_, index) => row(index + 7, `T${index + 7}`))],
    holdings: [{ symbol: "TPE:2330", balance: 0.2 }],
    holdingsStale: false,
    heldPrices: {
      "TPE:2330": { priceNative: 1, currency: "TWD", priceEur: 1, priceSource: "test", fallbackSource: null, appliedRatio: 1, stale: false, updatedAt: "2026-07-11T12:00:00.000Z", errors: [] },
    },
  });

  assert.equal(snapshot.dynamicLimit, 300);
  assert.equal(snapshot.rows.length, 300);
  assert.equal(snapshot.rows[0]?.canonicalTicker, "TSM");
  assert.equal(snapshot.rows[0]?.bitpandaSymbol, "TPE:2330");
  assert.equal(snapshot.rows.some((item) => item.canonicalTicker === "TPE:2330"), false);
  assert.equal(snapshot.stats.heldOutsideRankedUniverse, 0);
});
