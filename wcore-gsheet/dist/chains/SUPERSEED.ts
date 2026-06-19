// Auto-generated from src/SUPERSEED.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SUPERSEED: ChainConfig = {
  key: "SUPERSEED",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.superseed.xyz",
      "https://superseed.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Superseed",
    CHAIN_ID: 5330,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "superseed",
    GT_NETWORK: "superseed",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SUPERSEED;
