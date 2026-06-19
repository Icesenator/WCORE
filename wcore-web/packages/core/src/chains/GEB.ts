// Auto-generated from src/GEB.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const GEB: ChainConfig = {
  key: "GEB",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc-mainnet-1.bevm.io",
      "https://rpc-mainnet-2.bevm.io",
    ],
  },
  CHAIN: {
    NAME: "GEB",
    CHAIN_ID: 11501,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "bevm",
    GT_NETWORK: "bevm",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
    WSTBTC: "coingecko:bitcoin",
  },
  LLAMA_CONTRACT_MAP: {
    "0xf2692468666e459d87052f68ae474e36c1a34fbb": "coingecko:tether",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default GEB;
