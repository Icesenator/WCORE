// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const EDGELESS: ChainConfig = {
  key: "EDGELESS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2026.rpc.thirdweb.com",
      "https://rpc.edgeless.network/http"
    ],
  },
  CHAIN: {
    NAME: "Edgeless",
    CHAIN_ID: 2026,
    NATIVE_SYMBOL: "EDG",
    NATIVE_NAME: "Edgeless Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:edgeless",
    NATIVE_GECKO_ID: "edgeless",
    DEX_SLUG: "edgeless",
    GT_NETWORK: "edgeless",
  },
  LLAMA_ID_MAP: {"EDG":"coingecko:edgeless"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default EDGELESS;
