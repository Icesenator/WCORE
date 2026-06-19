// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ARENA_Z: ChainConfig = {
  key: "ARENA_Z",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7897.rpc.thirdweb.com",
      "https://rpc.arena-z.gg"
    ],
  },
  CHAIN: {
    NAME: "Arena-Z",
    CHAIN_ID: 7897,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Arena-Z Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "arena-z",
    GT_NETWORK: "arena-z",
  },
  LLAMA_ID_MAP: {"ETH":"coingecko:ethereum"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ARENA_Z;
