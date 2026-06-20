// Auto-generated from src/FORMA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FORMA: ChainConfig = {
  key: "FORMA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://984122.rpc.thirdweb.com",
      "https://rpc.forma.art",
    ],
  },
  CHAIN: {
    NAME: "Forma",
    CHAIN_ID: 984122,
    NATIVE_SYMBOL: "TIA",
    NATIVE_NAME: "Forma Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:celestia",
    NATIVE_GECKO_ID: "celestia",
    DEX_SLUG: "forma",
    GT_NETWORK: "forma",
  },
  LLAMA_ID_MAP: {
    TIA: "coingecko:celestia",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FORMA;
