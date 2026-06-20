// Auto-generated from src/AVES_NETWORK.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AVES_NETWORK: ChainConfig = {
  key: "AVES_NETWORK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://3333.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Aves Network",
    CHAIN_ID: 3333,
    NATIVE_SYMBOL: "AVES",
    NATIVE_NAME: "Aves Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:aves",
    NATIVE_GECKO_ID: "aves",
    DEX_SLUG: "aves-network",
    GT_NETWORK: "aves-network",
  },
  LLAMA_ID_MAP: {
    AVES: "coingecko:aves",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default AVES_NETWORK;
