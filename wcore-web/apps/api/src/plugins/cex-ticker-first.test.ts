// priceSymbolsViaBitpandaTicker — dcdeb923 restoration (v4.16.35).
// The Bitpanda public ticker is the authoritative quote for Bitpanda-listed
// crypto assets: a listed symbol with EUR 0.0000 (delisted/micro-cap, e.g. APP)
// must resolve to priceEur null + source "bitpanda-ticker" so the GSheet writes
// 0 instead of falling back to DefiLlama/priceMap (rank-5002 feedback loop).
// Symbols absent from the ticker are NOT authoritative (DefiLlama fallback).

import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { priceSymbolsViaBitpandaTicker, resetBitpandaTickerCacheForTest } from "./cex.js";

function withTicker(ticker: unknown, fn: () => void | Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(ticker), { status: 200 })) as typeof fetch;
  resetBitpandaTickerCacheForTest();
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = originalFetch;
      resetBitpandaTickerCacheForTest();
      mock.reset();
    });
}

test("listed symbol with positive EUR price resolves from the ticker", async () => {
  await withTicker({ BTC: { EUR: "66370.50" } }, async () => {
    const out = await priceSymbolsViaBitpandaTicker(["BTC"]);
    assert.deepEqual(out.BTC, { priceEur: 66370.5, source: "bitpanda-ticker" });
  });
});

test("listed symbol with EUR 0.0000 is an authoritative null (APP loop fix)", async () => {
  await withTicker({ APP: { EUR: "0.0000" } }, async () => {
    const out = await priceSymbolsViaBitpandaTicker(["APP"]);
    assert.deepEqual(out.APP, { priceEur: null, source: "bitpanda-ticker" });
  });
});

test("symbol absent from the ticker is not authoritative (empty entry, GAS falls back)", async () => {
  await withTicker({ BTC: { EUR: "1.00" } }, async () => {
    const out = await priceSymbolsViaBitpandaTicker(["NOTLISTED"]);
    assert.equal(out.NOTLISTED, undefined);
  });
});

test("ticker failure returns an empty map so callers keep their fallbacks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  resetBitpandaTickerCacheForTest();
  try {
    const out = await priceSymbolsViaBitpandaTicker(["BTC"]);
    assert.deepEqual(out, {});
  } finally {
    globalThis.fetch = originalFetch;
    resetBitpandaTickerCacheForTest();
  }
});
