// Auto-generated from src/TANGLE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TANGLE: ChainConfig = {
  key: "TANGLE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://5845.rpc.thirdweb.com",
      "https://rpc.tangle.tools",
    ],
  },
  CHAIN: {
    NAME: "Tangle",
    CHAIN_ID: 5845,
    NATIVE_SYMBOL: "TNT",
    NATIVE_NAME: "Tangle Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:tangle",
    NATIVE_GECKO_ID: "tangle",
    DEX_SLUG: "tangle",
    GT_NETWORK: "tangle",
  },
  LLAMA_ID_MAP: {
    TNT: "coingecko:tangle",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TANGLE;
