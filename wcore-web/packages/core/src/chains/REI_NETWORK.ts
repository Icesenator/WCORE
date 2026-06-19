// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const REI_NETWORK: ChainConfig = {
  key: "REI_NETWORK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://47805.rpc.thirdweb.com",
      "https://rpc.rei.network"
    ],
  },
  CHAIN: {
    NAME: "Rei Network",
    CHAIN_ID: 47805,
    NATIVE_SYMBOL: "REI",
    NATIVE_NAME: "Rei Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rei-network",
    NATIVE_GECKO_ID: "rei-network",
    DEX_SLUG: "rei-network",
    GT_NETWORK: "rei-network",
  },
  LLAMA_ID_MAP: {"REI":"coingecko:rei-network"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default REI_NETWORK;
