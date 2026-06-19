// Auto-generated from src/SWAN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SWAN: ChainConfig = {
  key: "SWAN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet-rpc.swanchain.org",
      "https://mainnet-rpc-01.swanchain.org",
      "https://mainnet-rpc-02.swanchain.org",
    ],
  },
  CHAIN: {
    NAME: "Swan",
    CHAIN_ID: 254,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "swan",
    GT_NETWORK: "swanchain",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SWAN;
