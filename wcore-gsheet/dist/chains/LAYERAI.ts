// Auto-generated from src/LAYERAI.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LAYERAI: ChainConfig = {
  key: "LAYERAI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2800.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "LayerAI",
    CHAIN_ID: 2800,
    NATIVE_SYMBOL: "LAI",
    NATIVE_NAME: "LayerAI Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:layerai",
    NATIVE_GECKO_ID: "layerai",
    DEX_SLUG: "layerai",
    GT_NETWORK: "layerai",
  },
  LLAMA_ID_MAP: {
    LAI: "coingecko:layerai",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LAYERAI;
