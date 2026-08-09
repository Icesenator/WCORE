// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const LAYERAI: ChainConfig = {
  key: "LAYERAI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    // Kept in sync with wcore-gsheet/src/LAYERAI.gs (enforced by test:phase3-chains).
    // 2026-08-02: thirdweb was the only endpoint and is dead, demoted behind aere.
    ENDPOINTS: [
      "https://rpc.aere.network",
      "https://rpc2.aere.network",
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
  LLAMA_ID_MAP: {"LAI":"coingecko:layerai"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default LAYERAI;
