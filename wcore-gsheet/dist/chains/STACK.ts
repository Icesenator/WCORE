// Auto-generated from src/STACK.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const STACK: ChainConfig = {
  key: "STACK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://78225.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Stack",
    CHAIN_ID: 78225,
    NATIVE_SYMBOL: "STACK",
    NATIVE_NAME: "Stack Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:stack",
    NATIVE_GECKO_ID: "stack-2",
    DEX_SLUG: "stack",
    GT_NETWORK: "stack",
  },
  LLAMA_ID_MAP: {
    STACK: "coingecko:stack",
  },
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STACK;
