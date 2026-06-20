// Auto-generated from src/AEVO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AEVO: ChainConfig = {
  key: "AEVO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2999.rpc.thirdweb.com",
      "https://mainnet.bityuan.com/eth",
    ],
  },
  CHAIN: {
    NAME: "Aevo",
    CHAIN_ID: 2999,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Aevo Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "aevo",
    GT_NETWORK: "aevo",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default AEVO;
