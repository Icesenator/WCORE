// Auto-generated from src/RARI.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const RARI: ChainConfig = {
  key: "RARI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.rpc.rarichain.org/http",
      "https://1380012617.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "RARI Chain",
    CHAIN_ID: 1380012617,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "rari",
    GT_NETWORK: "rari",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default RARI;
