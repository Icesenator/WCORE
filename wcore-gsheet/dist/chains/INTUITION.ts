// Auto-generated from src/INTUITION.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const INTUITION: ChainConfig = {
  key: "INTUITION",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.intuition.systems",
      "https://intuition.calderachain.xyz/http",
    ],
  },
  CHAIN: {
    NAME: "Intuition",
    CHAIN_ID: 1155,
    NATIVE_SYMBOL: "TRUST",
    NATIVE_NAME: "Trust",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:intuition",
    NATIVE_GECKO_ID: "intuition",
    DEX_SLUG: "intuition",
    GT_NETWORK: "intuition",
  },
  LLAMA_ID_MAP: {
    TRUST: "coingecko:intuition",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default INTUITION;
