// Auto-generated from src/ELYSIUM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ELYSIUM: ChainConfig = {
  key: "ELYSIUM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.elysium.kinetiq.xyz",
    ],
    MIN_LOG_SCAN_BLOCKS: 500000,
    LOG_CHUNK_BLOCKS: 600000,
  },
  CHAIN: {
    NAME: "Elysium",
    CHAIN_ID: 99901,
    NATIVE_SYMBOL: "HYPE",
    NATIVE_NAME: "Hyperliquid",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:hyperliquid",
    NATIVE_GECKO_ID: "hyperliquid",
    DEX_SLUG: "elysium",
  },
  LLAMA_ID_MAP: {
    HYPE: "coingecko:hyperliquid",
    WHYPE: "coingecko:hyperliquid",
    USDC: "coingecko:usd-coin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ELYSIUM;
