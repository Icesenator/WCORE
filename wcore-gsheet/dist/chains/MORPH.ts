// Auto-generated from src/MORPH.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MORPH: ChainConfig = {
  key: "MORPH",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.morphl2.io",
      "https://morph.drpc.org",
      "https://rpc.ankr.com/morph",
    ],
  },
  CHAIN: {
    NAME: "Morph",
    CHAIN_ID: 2818,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "morph",
    GT_NETWORK: "morph-l2",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MORPH;
