// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const CROSS_MAINNET: ChainConfig = {
  key: "CROSS_MAINNET",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: ["https://612055.rpc.thirdweb.com"],
  },
  CHAIN: {
    NAME: "Cross Mainnet",
    CHAIN_ID: 612055,
    NATIVE_SYMBOL: "CROSS",
    NATIVE_NAME: "Cross Mainnet Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "cross-mainnet",
    GT_NETWORK: "cross-mainnet",
  },
  LLAMA_ID_MAP: {},
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CROSS_MAINNET;
