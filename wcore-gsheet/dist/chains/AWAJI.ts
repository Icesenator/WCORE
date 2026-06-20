// Auto-generated from src/AWAJI.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AWAJI: ChainConfig = {
  key: "AWAJI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://6497.rpc.thirdweb.com",
      "https://rpc.awaji.mizuhiki.io",
    ],
  },
  CHAIN: {
    NAME: "Awaji",
    CHAIN_ID: 6497,
    NATIVE_SYMBOL: "AWAJI",
    NATIVE_NAME: "Awaji Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "awaji",
    GT_NETWORK: "awaji",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default AWAJI;
