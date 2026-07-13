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
    expect(CACHE_KEY_REGISTRY.stockPriceFresh.ttl).toBe("6h");
    expect(CACHE_KEY_REGISTRY.stockPriceLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapFresh.ttl).toBe("6h");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.stockTopMarketCapLock.ttl).toBe("60s");
  });

  it("defines crypto fresh, last-good and lock lifetimes", () => {
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapFresh.ttl).toBe("6h");
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapLastGood.ttl).toBe("30d");
    expect(CACHE_KEY_REGISTRY.cryptoTopMarketCapLock.ttl).toBe("60s");
  });
});
