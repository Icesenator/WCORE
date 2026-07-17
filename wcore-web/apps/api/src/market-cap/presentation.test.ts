import assert from "node:assert/strict";
import { test } from "node:test";
import type { StockSnapshotRow } from "../stocks/stock-service.js";
import { toCryptoMarketCapRow, toStockMarketCapRow } from "./presentation.js";

test("toCryptoMarketCapRow preserves the public fields and adds the exact CMC logo", () => {
  assert.deepEqual(toCryptoMarketCapRow({
    id: 1,
    rank: 1,
    symbol: "BTC",
    name: "Bitcoin",
    priceEur: 50_000,
    marketCapEur: 1_000_000,
  }), {
    rank: 1,
    symbol: "BTC",
    name: "Bitcoin",
    priceEur: 50_000,
    marketCapEur: 1_000_000,
    logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  });
});

test("toCryptoMarketCapRow leaves the logo undefined for a legacy row without a CMC id", () => {
  const mapped = toCryptoMarketCapRow({
    rank: 1,
    symbol: "BTC",
    name: "Bitcoin",
    priceEur: 50_000,
    marketCapEur: 1_000_000,
  });

  assert.equal(mapped.logoUrl, undefined);
});

test("toStockMarketCapRow exposes canonical identity, country, and encoded source logo", () => {
  assert.deepEqual(toStockMarketCapRow({
    rank: 1,
    company: "Berkshire Hathaway",
    country: "USA",
    sourceTicker: "BRK B",
    canonicalTicker: "NYSE:BRK.B",
    priceEur: 170,
    marketCapEur: 4_000_000_000_000,
  } as StockSnapshotRow), {
    rank: 1,
    symbol: "NYSE:BRK.B",
    name: "Berkshire Hathaway",
    priceEur: 170,
    marketCapEur: 4_000_000_000_000,
    country: "USA",
    logoUrl: "https://companiesmarketcap.com/img/company-logos/64/BRK%20B.png",
  });
});

test("toStockMarketCapRow leaves empty optional branding undefined", () => {
  const mapped = toStockMarketCapRow({
    rank: 2,
    company: "Unbranded Company",
    country: "",
    sourceTicker: "   ",
    canonicalTicker: "UNBRANDED",
    priceEur: 10,
    marketCapEur: 100,
  } as StockSnapshotRow);

  assert.equal(mapped.country, undefined);
  assert.equal(mapped.logoUrl, undefined);
  assert.equal(mapped.symbol, "UNBRANDED");
});
