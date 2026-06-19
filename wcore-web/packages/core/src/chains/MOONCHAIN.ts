// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const MOONCHAIN: ChainConfig = {
  key: "MOONCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1111.rpc.thirdweb.com",
      "https://api.wemix.com"
    ],
  },
  CHAIN: {
    NAME: "Moonchain",
    CHAIN_ID: 1111,
    NATIVE_SYMBOL: "MHC",
    NATIVE_NAME: "Moonchain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moonchain",
    NATIVE_GECKO_ID: "moonchain",
    DEX_SLUG: "moonchain",
    GT_NETWORK: "moonchain",
  },
  LLAMA_ID_MAP: {"MHC":"coingecko:moonchain"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default MOONCHAIN;
