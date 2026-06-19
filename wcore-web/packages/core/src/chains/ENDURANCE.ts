// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ENDURANCE: ChainConfig = {
  key: "ENDURANCE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://648.rpc.thirdweb.com",
      "https://rpc-endurance.fusionist.io/"
    ],
  },
  CHAIN: {
    NAME: "Endurance",
    CHAIN_ID: 648,
    NATIVE_SYMBOL: "ACE",
    NATIVE_NAME: "Endurance Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:fusionist",
    NATIVE_GECKO_ID: "fusionist",
    DEX_SLUG: "endurance",
    GT_NETWORK: "endurance",
  },
  LLAMA_ID_MAP: {"ACE":"coingecko:fusionist"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ENDURANCE;
