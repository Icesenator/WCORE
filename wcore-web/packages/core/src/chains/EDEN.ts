// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const EDEN: ChainConfig = {
  key: "EDEN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://714.rpc.thirdweb.com",
      "https://rpc.eden.gateway.fm"
    ],
  },
  CHAIN: {
    NAME: "Eden",
    CHAIN_ID: 714,
    NATIVE_SYMBOL: "EDEN",
    NATIVE_NAME: "Eden Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "eden",
    GT_NETWORK: "eden",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default EDEN;
