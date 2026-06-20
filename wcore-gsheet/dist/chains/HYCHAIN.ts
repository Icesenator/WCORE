// Auto-generated from src/HYCHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const HYCHAIN: ChainConfig = {
  key: "HYCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2911.rpc.thirdweb.com",
      "https://rpc.hychain.com/http",
    ],
  },
  CHAIN: {
    NAME: "Hychain",
    CHAIN_ID: 2911,
    NATIVE_SYMBOL: "TOPIA",
    NATIVE_NAME: "Hychain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:hychain",
    NATIVE_GECKO_ID: "hychain",
    DEX_SLUG: "hychain",
    GT_NETWORK: "hychain",
  },
  LLAMA_ID_MAP: {
    TOPIA: "coingecko:hychain",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default HYCHAIN;
