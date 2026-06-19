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
});
