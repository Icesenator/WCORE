// Auto-generated from src/ROLLUX.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ROLLUX: ChainConfig = {
  key: "ROLLUX",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://570.rpc.thirdweb.com",
      "https://rpc.rollux.com",
      "https://rpc.ankr.com/rollux",
    ],
  },
  CHAIN: {
    NAME: "Rollux",
    CHAIN_ID: 570,
    NATIVE_SYMBOL: "SYS",
    NATIVE_NAME: "Rollux Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:syscoin",
    NATIVE_GECKO_ID: "syscoin",
    DEX_SLUG: "rollux",
    GT_NETWORK: "rollux",
  },
  LLAMA_ID_MAP: {
    SYS: "coingecko:syscoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ROLLUX;
