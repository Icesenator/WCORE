// Auto-generated from src/CAMP.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CAMP: ChainConfig = {
  key: "CAMP",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.camp.raas.gelato.cloud",
      "https://484.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Camp",
    CHAIN_ID: 484,
    NATIVE_SYMBOL: "CAMP",
    NATIVE_NAME: "Camp",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:camp-network",
    NATIVE_GECKO_ID: "camp-network",
    DEX_SLUG: "camp",
    GT_NETWORK: "camp-network",
  },
  LLAMA_ID_MAP: {
    CAMP: "coingecko:camp-network",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CAMP;
