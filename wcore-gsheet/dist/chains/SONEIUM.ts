// Auto-generated from src/SONEIUM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SONEIUM: ChainConfig = {
  key: "SONEIUM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.soneium.org",
      "https://soneium.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Soneium",
    CHAIN_ID: 1868,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "soneium",
    GT_NETWORK: "soneium",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SONEIUM;
