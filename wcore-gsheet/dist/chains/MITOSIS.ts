// Auto-generated from src/MITOSIS.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MITOSIS: ChainConfig = {
  key: "MITOSIS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mitosis.org",
    ],
  },
  CHAIN: {
    NAME: "Mitosis",
    CHAIN_ID: 124816,
    NATIVE_SYMBOL: "MITO",
    NATIVE_NAME: "MITO",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:mitosis",
    NATIVE_GECKO_ID: "mitosis",
    DEX_SLUG: "mitosis",
    GT_NETWORK: "mitosis",
  },
  LLAMA_ID_MAP: {
    MITO: "coingecko:mitosis",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MITOSIS;
