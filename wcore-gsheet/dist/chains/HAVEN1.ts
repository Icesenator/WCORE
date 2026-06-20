// Auto-generated from src/HAVEN1.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const HAVEN1: ChainConfig = {
  key: "HAVEN1",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8811.rpc.thirdweb.com",
      "https://rpc.haven1.org",
    ],
  },
  CHAIN: {
    NAME: "Haven1",
    CHAIN_ID: 8811,
    NATIVE_SYMBOL: "H1",
    NATIVE_NAME: "Haven1 Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:haven1",
    NATIVE_GECKO_ID: "haven1",
    DEX_SLUG: "haven1",
    GT_NETWORK: "haven1",
  },
  LLAMA_ID_MAP: {
    H1: "coingecko:haven1",
  },
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default HAVEN1;
