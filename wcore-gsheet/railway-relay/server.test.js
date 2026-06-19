const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeCoinbasePrivateKeyPem, mapBybitTickerPricesEur, mapCoinbaseTickerPricesEur, mapOkxTickerPricesEur } = require("./server.js");

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
