// Auto-generated from src/ANCIENT8.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ANCIENT8: ChainConfig = {
  key: "ANCIENT8",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.ancient8.gg",
      "https://888888888.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Ancient8",
    CHAIN_ID: 888888888,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "ancient8",
    GT_NETWORK: "ancient8",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ANCIENT8;
