import { describe, it, expect } from "vitest";
import { cacheKey, cacheKeyGsheet, walletKey } from "./cache-keys";

describe("cacheKey", () => {
  it("builds web priceDex key preserving var casing", () => {
    expect(cacheKey("priceDex", { chainSlug: "ETHEREUM", contract: "0xABC" }))
      .toBe("price:dex:ETHEREUM:0xABC");
  });

  it("builds web scanResult key", () => {
    expect(cacheKey("scanResult", { address: "0x123", chainKey: "BASE" }))
      .toBe("scan:v2:0x123:BASE");
  });

  it("throws on missing var", () => {
    expect(() => cacheKey("priceDex", { chainSlug: "ethereum" }))
      .toThrow("Missing var contract");
  });

  it("returns null for web-only key on gsheet", () => {
    expect(cacheKeyGsheet("dynamicRpcs", { chainKey: "BASE" })).toBeNull();
  });
});

describe("cacheKeyGsheet", () => {
  it("builds gsheet priceDex key preserving var casing", () => {
    expect(cacheKeyGsheet("priceDex", { chainSlug: "ethereum", contract: "0xabc" }))
      .toBe("DEX:ethereum:0xabc");
  });
});

describe("walletKey", () => {
  it("builds wallet key with empty prefix", () => {
    expect(walletKey(null, "0xAbC")).toBe("WALLET_0xabc");
  });

  it("builds wallet key with custom prefix", () => {
    expect(walletKey("BASE_", "0xAbC")).toBe("BASE_WALLET_0xabc");
  });
});
