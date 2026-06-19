// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ICB_NETWORK: ChainConfig = {
  key: "ICB_NETWORK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://73115.rpc.thirdweb.com",
      "https://rpc1-mainnet.icbnetwork.info/",
      "https://rpc2-mainnet.icbnetwork.info/"
    ],
  },
  CHAIN: {
    NAME: "ICB Network",
    CHAIN_ID: 73115,
    NATIVE_SYMBOL: "ICB",
    NATIVE_NAME: "ICB Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "icb-network",
    GT_NETWORK: "icb-network",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ICB_NETWORK;
