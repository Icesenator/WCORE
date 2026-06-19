// Auto-generated from src/ASTAR.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ASTAR: ChainConfig = {
  key: "ASTAR",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://evm.astar.network",
      "https://astar.public.blastapi.io",
      "https://astar.api.onfinality.io/public",
    ],
  },
  CHAIN: {
    NAME: "Astar",
    CHAIN_ID: 592,
    NATIVE_SYMBOL: "ASTR",
    NATIVE_NAME: "Astar",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:astar",
    NATIVE_GECKO_ID: "astar",
    DEX_SLUG: "astar",
    GT_NETWORK: "astr",
  },
  LLAMA_ID_MAP: {
    ASTR: "coingecko:astar",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ASTAR;
