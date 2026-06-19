// Auto-generated from src/TAIKO_ALETHIA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TAIKO_ALETHIA: ChainConfig = {
  key: "TAIKO_ALETHIA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mainnet.taiko.xyz",
      "https://taiko.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Taiko Alethia",
    CHAIN_ID: 167000,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "taiko",
    GT_NETWORK: "taiko",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    TAIKO: "coingecko:taiko",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TAIKO_ALETHIA;
