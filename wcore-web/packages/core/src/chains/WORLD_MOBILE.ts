// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const WORLD_MOBILE: ChainConfig = {
  key: "WORLD_MOBILE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://869.rpc.thirdweb.com",
      "https://worldmobilechain-mainnet.g.alchemy.com/public"
    ],
  },
  CHAIN: {
    NAME: "World Mobile",
    CHAIN_ID: 869,
    NATIVE_SYMBOL: "WMTX",
    NATIVE_NAME: "World Mobile Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:world-mobile-token",
    NATIVE_GECKO_ID: "world-mobile-token",
    DEX_SLUG: "world-mobile",
    GT_NETWORK: "world-mobile",
  },
  LLAMA_ID_MAP: {"WMTX":"coingecko:world-mobile-token"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default WORLD_MOBILE;
