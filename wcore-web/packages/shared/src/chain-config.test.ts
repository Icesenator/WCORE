import { describe, it, expect } from "vitest";
import { CHAIN_CONFIG_SCHEMA } from "./chain-config";

describe("CHAIN_CONFIG_SCHEMA", () => {
  it("parses valid TON config", () => {
    const config = CHAIN_CONFIG_SCHEMA.parse({
      key: "TON", vm: "TON", cacheVersion: 1,
      rpc: { endpoints: ["https://tonapi.io/v2"], timeoutMs: 4000 },
      chain: { name: "TON", nativeSymbol: "GRAM", nativeName: "Gram", nativeDecimals: 9 },
      timeouts: { httpMs: 4000, maxExecutionMs: 30000 },
      llamaIdMap: {},
    });
    expect(config.key).toBe("TON");
    expect(config.chain.nativeSymbol).toBe("GRAM");
  });

  it("parses valid EVM config with chainId and dexSlug", () => {
    const config = CHAIN_CONFIG_SCHEMA.parse({
      key: "ETHEREUM", vm: "EVM", cacheVersion: 1,
      rpc: { endpoints: ["https://eth.llamarpc.com"], timeoutMs: 4000 },
      chain: { name: "Ethereum", chainId: 1, nativeSymbol: "ETH", nativeName: "Ether", nativeDecimals: 18, dexSlug: "ethereum", gtNetwork: "ethereum" },
      timeouts: { httpMs: 4000, maxExecutionMs: 30000 },
      llamaIdMap: {},
    });
    expect(config.chain.chainId).toBe(1);
  });

  it("throws on missing nativeSymbol", () => {
    expect(() => CHAIN_CONFIG_SCHEMA.parse({
      key: "TON", vm: "TON", cacheVersion: 1,
      rpc: { endpoints: ["https://x"] },
      chain: { name: "TON", nativeName: "Ton", nativeDecimals: 9 },
      timeouts: { httpMs: 4000, maxExecutionMs: 30000 },
      llamaIdMap: {},
    })).toThrow();
  });

  it("throws on invalid vm", () => {
    expect(() => CHAIN_CONFIG_SCHEMA.parse({
      key: "X", vm: "INVALID", cacheVersion: 1,
      rpc: { endpoints: ["https://x"] },
      chain: { name: "X", nativeSymbol: "X", nativeName: "X", nativeDecimals: 9 },
      timeouts: { httpMs: 4000, maxExecutionMs: 30000 },
      llamaIdMap: {},
    })).toThrow();
  });

  it("parses valid ETHEREUM config with chainId, dexSlug, gtNetwork, and extra RPC fields", () => {
    const config = CHAIN_CONFIG_SCHEMA.parse({
      key: "ETHEREUM", vm: "EVM", cacheVersion: 63,
      rpc: {
        endpoints: ["https://eth.drpc.org", "https://1rpc.io/eth"],
        timeoutMs: 2500,
        CONSENSUS_MIN_RPCS: 2,
        CONSENSUS_MAX_RPCS: 2,
        MAX_FAILURES_BEFORE_BLOCK: 3,
        BLOCK_DURATION_MS: 90000,
        HEALTH_CHECK_INTERVAL_MS: 300000,
      },
      chain: {
        name: "Ethereum", chainId: 1, nativeSymbol: "ETH", nativeName: "Ether", nativeDecimals: 18,
        nativeLlamaId: "coingecko:ethereum", nativeGeckoId: "ethereum",
        dexSlug: "ethereum", gtNetwork: "eth",
      },
      timeouts: {
        httpMs: 2500, maxExecutionMs: 25000,
        SAFE_MARGIN_MS: 900, HARD_GUARD_MS: 22000,
      },
      llamaIdMap: { ETH: "coingecko:ethereum", USDC: "coingecko:usd-coin" },
    });
    expect(config.chain.chainId).toBe(1);
    expect(config.chain.dexSlug).toBe("ethereum");
    expect((config.rpc as Record<string, unknown>).CONSENSUS_MIN_RPCS).toBe(2);
    expect((config.timeouts as Record<string, unknown>).SAFE_MARGIN_MS).toBe(900);
  });

  it("parses valid SOLANA config with COMMITMENT", () => {
    const config = CHAIN_CONFIG_SCHEMA.parse({
      key: "SOLANA", vm: "SVM", cacheVersion: 64,
      rpc: {
        endpoints: ["https://api.mainnet-beta.solana.com"],
        timeoutMs: 20000,
        COMMITMENT: "confirmed",
      },
      chain: {
        name: "Solana", nativeSymbol: "SOL", nativeName: "Solana", nativeDecimals: 9,
        nativeLlamaId: "coingecko:solana", nativeGeckoId: "solana",
        dexSlug: "solana", gtNetwork: "solana",
      },
      timeouts: { httpMs: 20000, maxExecutionMs: 30000 },
      llamaIdMap: {},
    });
    expect(config.vm).toBe("SVM");
    expect((config.rpc as Record<string, unknown>).COMMITMENT).toBe("confirmed");
  });
});
