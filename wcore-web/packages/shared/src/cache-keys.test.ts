import { describe, it, expect } from "vitest";
import { cacheKey, cacheKeyGsheet, walletKey } from "./cache-keys";

describe("cacheKey", () => {
  it("builds web priceDex key preserving var casing", () => {
    expect(cacheKey("priceDex", { chainSlug: "ETHEREUM", contract: "0xABC" }))
      .toBe("price:dex:ETHEREUM:0xABC");
  });

  it("builds web scanResult key", () => {
    expect(cacheKey("scanResult", { address: "0x123", chainKey: "BASE" }))
      .toBe("scan:result:0x123:BASE");
  });

  it("keeps versioned non-EVM empty-wallet keys in the registry", () => {
    expect(cacheKey("emptyWalletV2", { chainKey: "solana", address: "WalletABC" }))
      .toBe("empty:v2:solana:WalletABC");
    expect(cacheKeyGsheet("emptyWalletV2", { chainKey: "solana", address: "WalletABC" }))
      .toBeNull();
  });

  it("throws on missing var", () => {
    expect(() => cacheKey("priceDex", { chainSlug: "ethereum" }))
      .toThrow("Missing var contract");
  });

  it("returns null for web-only key on gsheet", () => {
    expect(cacheKeyGsheet("dynamicRpcs", { chainKey: "BASE" })).toBeNull();
  });

  it("builds canonical stock keys", () => {
    expect(cacheKey("stockPriceFresh", { ticker: "SMSN" })).toBe("stock:price:SMSN:fresh");
    expect(cacheKey("stockPriceLastGood", { ticker: "SMSN" })).toBe("stock:price:SMSN:last-good");
    expect(cacheKey("stockTopMarketCapFresh", {})).toBe("stock:top-market-cap:fresh");
    expect(cacheKey("stockTopMarketCapLastGood", {})).toBe("stock:top-market-cap:last-good");
    expect(cacheKey("stockTopMarketCapLock", {})).toBe("stock:top-market-cap:lock");
  });

  it("builds canonical crypto keys", () => {
    expect(cacheKey("cryptoTopMarketCapFresh", {})).toBe("crypto:top-market-cap:fresh");
    expect(cacheKey("cryptoTopMarketCapLastGood", {})).toBe("crypto:top-market-cap:last-good");
    expect(cacheKey("cryptoTopMarketCapLock", {})).toBe("crypto:top-market-cap:lock");
  });

  it("builds canonical Zerion keys and normalizes EVM addresses", () => {
    const mixedCaseAddress = "0xAbCdEf0123456789aBCdef0123456789AbCdEf01";
    const address = mixedCaseAddress.toLowerCase();

    expect(cacheKey("zerionPortfolioFresh", { address: mixedCaseAddress })).toBe(`zerion:portfolio:v1:${address}:fresh`);
    expect(cacheKey("zerionPortfolioLastGood", { address: mixedCaseAddress })).toBe(`zerion:portfolio:v1:${address}:last-good`);
    expect(cacheKey("zerionPortfolioFailure", { address: mixedCaseAddress })).toBe(`zerion:portfolio:v1:${address}:failure`);
    expect(cacheKey("zerionPortfolioUntracked", { address: mixedCaseAddress })).toBe(`zerion:portfolio:v1:${address}:untracked`);
    expect(cacheKey("zerionRequestLease", { address: mixedCaseAddress })).toBe(`provider:zerion:request:${address}`);
    expect(cacheKey("zerionHalfOpenLease", {})).toBe("provider:zerion:half-open-lease");
    expect(cacheKey("zerionDailyBudget", { date: "2026-07-17" })).toBe("provider:zerion:daily:2026-07-17");
    expect(cacheKey("zerionBreakerState", {})).toBe("provider:zerion:breaker");
  });

  it.each([
    "11111111111111111111111111111111",
    "So11111111111111111111111111111111111111112",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  ])("preserves valid 32-byte Solana address %s in Zerion wallet keys", (address) => {
    expect(cacheKey("zerionPortfolioFresh", { address })).toBe(`zerion:portfolio:v1:${address}:fresh`);
    expect(cacheKey("zerionRequestLease", { address })).toBe(`provider:zerion:request:${address}`);
  });

  it.each([
    "0x1234",
    "0xgggggggggggggggggggggggggggggggggggggggg",
    "1".repeat(44),
    "z".repeat(44),
    "00000000000000000000000000000000",
    "1111111111111111111111111111111:",
    "wallet:injection",
  ])("rejects malformed Zerion wallet address %s", (address) => {
    expect(() => cacheKey("zerionPortfolioFresh", { address })).toThrow("Invalid Zerion wallet address");
    expect(() => cacheKey("zerionRequestLease", { address })).toThrow("Invalid Zerion wallet address");
  });

  it.each(["2026-7-17", "2026-02-29", "2026-07-17:breaker", "not-a-date"])(
    "rejects invalid Zerion budget date %s",
    (date) => {
      expect(() => cacheKey("zerionDailyBudget", { date })).toThrow("Invalid Zerion budget date");
    },
  );

  it("rejects missing Zerion key arguments", () => {
    expect(() => cacheKey("zerionPortfolioFresh", {} as { address: string })).toThrow("Missing var address");
  });

  it("ignores undeclared variables for existing web cache keys", () => {
    expect(cacheKey("priceDex", { chainSlug: "ethereum", contract: "0xabc", extra: "ignored" }))
      .toBe("price:dex:ethereum:0xabc");
  });
});

describe("cacheKeyGsheet", () => {
  it("builds gsheet priceDex key preserving var casing", () => {
    expect(cacheKeyGsheet("priceDex", { chainSlug: "ethereum", contract: "0xabc" }))
      .toBe("DEX:ethereum:0xabc");
  });

  it("ignores undeclared variables for existing gsheet cache keys", () => {
    expect(cacheKeyGsheet("priceDex", { chainSlug: "ethereum", contract: "0xabc", extra: "ignored" }))
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
