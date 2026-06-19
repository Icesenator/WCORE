// Auto-generated from src/VANA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const VANA: ChainConfig = {
  key: "VANA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.vana.org/"
    ],
  },
  CHAIN: {
    NAME: "Vana",
    CHAIN_ID: 1480,
    NATIVE_SYMBOL: "VANA",
    NATIVE_NAME: "Vana",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:vana",
    NATIVE_GECKO_ID: "vana",
    DEX_SLUG: "vana",
    GT_NETWORK: "vana",
  },
  LLAMA_ID_MAP: {
    VANA: "coingecko:vana",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default VANA;
