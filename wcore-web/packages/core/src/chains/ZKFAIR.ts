// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ZKFAIR: ChainConfig = {
  key: "ZKFAIR",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://42766.rpc.thirdweb.com",
      "https://rpc.zkfair.io"
    ],
  },
  CHAIN: {
    NAME: "zkFair",
    CHAIN_ID: 42766,
    NATIVE_SYMBOL: "ZKF",
    NATIVE_NAME: "zkFair Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:zkfair",
    NATIVE_GECKO_ID: "zkfair-token",
    DEX_SLUG: "zkfair",
    GT_NETWORK: "zkfair",
  },
  LLAMA_ID_MAP: {"ZKF":"coingecko:zkfair"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZKFAIR;
