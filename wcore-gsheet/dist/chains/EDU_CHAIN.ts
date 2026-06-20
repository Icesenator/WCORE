// Auto-generated from src/EDU_CHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const EDU_CHAIN: ChainConfig = {
  key: "EDU_CHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://41923.rpc.thirdweb.com",
      "https://rpc.edu-chain.raas.gelato.cloud",
    ],
  },
  CHAIN: {
    NAME: "EDU Chain",
    CHAIN_ID: 41923,
    NATIVE_SYMBOL: "EDU",
    NATIVE_NAME: "EDU Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:edu-chain",
    NATIVE_GECKO_ID: "edu-chain",
    DEX_SLUG: "edu-chain",
    GT_NETWORK: "edu-chain",
  },
  LLAMA_ID_MAP: {
    EDU: "coingecko:edu-chain",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default EDU_CHAIN;
