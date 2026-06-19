// Auto-generated from src/BOTANIX.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BOTANIX: ChainConfig = {
  key: "BOTANIX",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.ankr.com/botanix_mainnet",
      "https://rpc.botanixlabs.com",
    ],
  },
  CHAIN: {
    NAME: "Botanix",
    CHAIN_ID: 3637,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "botanix",
    GT_NETWORK: "botanix",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BOTANIX;
