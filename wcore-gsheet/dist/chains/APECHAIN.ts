// Auto-generated from src/APECHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const APECHAIN: ChainConfig = {
  key: "APECHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.apechain.com/http",
      "https://apechain.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "ApeChain",
    CHAIN_ID: 33139,
    NATIVE_SYMBOL: "APE",
    NATIVE_NAME: "ApeCoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:apecoin",
    NATIVE_GECKO_ID: "apecoin",
    DEX_SLUG: "apechain",
    GT_NETWORK: "apechain",
  },
  LLAMA_ID_MAP: {
    APE: "coingecko:apecoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default APECHAIN;
