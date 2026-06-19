// Auto-generated from src/B2.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const B2: ChainConfig = {
  key: "B2",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.bsquared.network",
      "https://b2-mainnet.alt.technology",
    ],
  },
  CHAIN: {
    NAME: "B2",
    CHAIN_ID: 223,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "b2-network",
    GT_NETWORK: "bsquared-network",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default B2;
