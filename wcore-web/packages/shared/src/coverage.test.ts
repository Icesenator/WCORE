import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CEX_PROVIDERS } from "./coverage";

describe("CEX provider registry", () => {
  test("exposes the seven live CEX providers in a single tuple", () => {
    assert.deepEqual(CEX_PROVIDERS, ["binance", "bitpanda", "bitfinex", "bybit", "coinbase", "okx", "kraken"]);
    assert.equal(CEX_PROVIDERS.length, 7);
  });
});
