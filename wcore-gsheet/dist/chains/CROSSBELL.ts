// Auto-generated from src/CROSSBELL.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CROSSBELL: ChainConfig = {
  key: "CROSSBELL",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://3737.rpc.thirdweb.com",
      "https://rpc.crossbell.io",
    ],
  },
  CHAIN: {
    NAME: "Crossbell",
    CHAIN_ID: 3737,
    NATIVE_SYMBOL: "CSB",
    NATIVE_NAME: "Crossbell Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:crossbell",
    NATIVE_GECKO_ID: "crossbell",
    DEX_SLUG: "crossbell",
    GT_NETWORK: "crossbell",
  },
  LLAMA_ID_MAP: {
    CSB: "coingecko:crossbell",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CROSSBELL;
