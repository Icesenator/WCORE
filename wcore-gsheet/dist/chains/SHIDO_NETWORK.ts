// Auto-generated from src/SHIDO_NETWORK.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SHIDO_NETWORK: ChainConfig = {
  key: "SHIDO_NETWORK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://9008.rpc.thirdweb.com",
      "https://shido-mainnet-archive-lb-nw5es9.zeeve.net/USjg7xqUmCZ4wCsqEOOE/rpc",
      "https://evm.shidoscan.net",
    ],
  },
  CHAIN: {
    NAME: "Shido Network",
    CHAIN_ID: 9008,
    NATIVE_SYMBOL: "SHIDO",
    NATIVE_NAME: "Shido Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:shido",
    NATIVE_GECKO_ID: "shido",
    DEX_SLUG: "shido",
    GT_NETWORK: "shido",
  },
  LLAMA_ID_MAP: {
    SHIDO: "coingecko:shido",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SHIDO_NETWORK;
