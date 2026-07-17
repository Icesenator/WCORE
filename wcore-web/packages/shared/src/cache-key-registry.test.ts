import { describe, it, expect } from "vitest";
import { CACHE_KEY_REGISTRY } from "./cache-key-registry";

describe("CACHE_KEY_REGISTRY", () => {
  it("defines priceDex with gsheet and web patterns", () => {
    const def = CACHE_KEY_REGISTRY.priceDex;
    expect(def.vars).toEqual(["chainSlug", "contract"]);
    expect(def.gsheet).toBe("DEX:{chainSlug}:{contract}");
    expect(def.web).toBe("price:dex:{chainSlug}:{contract}");
    expect(def.storage).toBe("local");
  });

  it("defines tokenMetadata as web-backed", () => {
    expect(CACHE_KEY_REGISTRY.tokenMetadata.storage).toBe("web-backed");
  });

  it("defines dynamicRpcs as web-only with no gsheet key", () => {
    expect(CACHE_KEY_REGISTRY.dynamicRpcs.gsheet).toBeNull();
    expect(CACHE_KEY_REGISTRY.dynamicRpcs.storage).toBe("web-only");
  });

  it("defines stock fresh, last-good and lock lifetimes", () => {
    expect(CACHE_KEY_REGISTRY.stockPriceFresh.ttl).toBe("1h");
    expect(CACHE_KEY_REGISTRY.stockPriceLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapFresh.ttl).toBe("1h");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapLock.ttl).toBe("15m");
  });

  it("defines crypto fresh, last-good and lock lifetimes", () => {
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapFresh.ttl).toBe("1h");
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapLock.ttl).toBe("60s");
  });

  it("defines versioned Zerion portfolio cache keys", () => {
    expect(CACHE_KEY_REGISTRY.zerionPortfolioFresh).toMatchObject({
      vars: ["address"],
      web: "zerion:portfolio:v1:{address}:fresh",
      storage: "web-only",
      ttl: "10m",
    });
    expect(CACHE_KEY_REGISTRY.zerionPortfolioLastGood.web).toBe("zerion:portfolio:v1:{address}:last-good");
    expect(CACHE_KEY_REGISTRY.zerionPortfolioFailure.web).toBe("zerion:portfolio:v1:{address}:failure");
    expect(CACHE_KEY_REGISTRY.zerionPortfolioUntracked.web).toBe("zerion:portfolio:v1:{address}:untracked");
  });

  it("defines Zerion provider coordination cache keys", () => {
    expect(CACHE_KEY_REGISTRY.zerionRequestLease.web).toBe("provider:zerion:request:{address}");
    expect(CACHE_KEY_REGISTRY.zerionHalfOpenLease.web).toBe("provider:zerion:half-open-lease");
    expect(CACHE_KEY_REGISTRY.zerionDailyBudget.web).toBe("provider:zerion:daily:{date}");
    expect(CACHE_KEY_REGISTRY.zerionBreakerState.web).toBe("provider:zerion:breaker");
  });
});
