// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const FANTOM: ChainConfig = {
  key: "FANTOM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://250.rpc.thirdweb.com",
      "https://rpc.ftm.tools",
      "https://fantom-rpc.publicnode.com",
      "https://fantom.drpc.org"
    ],
  },
  CHAIN: {
    NAME: "Fantom",
    CHAIN_ID: 250,
    NATIVE_SYMBOL: "FTM",
    NATIVE_NAME: "Fantom Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:fantom",
    NATIVE_GECKO_ID: "fantom",
    DEX_SLUG: "fantom",
    GT_NETWORK: "fantom",
  },
  LLAMA_ID_MAP: {"FTM":"coingecko:fantom"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default FANTOM;
