import { describe, it, expect } from "vitest";
import { CEX_PROVIDERS } from "./coverage";

describe("CEX provider registry", () => {
  it("exposes the seven live CEX providers in a single tuple", () => {
    expect(CEX_PROVIDERS).toEqual(["binance", "bitpanda", "bitfinex", "bybit", "coinbase", "okx", "kraken"]);
    expect(CEX_PROVIDERS.length).toBe(7);
  });
});
