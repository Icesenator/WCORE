// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const DOS_CHAIN: ChainConfig = {
  key: "DOS_CHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7979.rpc.thirdweb.com",
      "https://main.doschain.com"
    ],
  },
  CHAIN: {
    NAME: "DOS Chain",
    CHAIN_ID: 7979,
    NATIVE_SYMBOL: "DOS",
    NATIVE_NAME: "DOS Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dos",
    NATIVE_GECKO_ID: "dos",
    DEX_SLUG: "dos-chain",
    GT_NETWORK: "dos-chain",
  },
  LLAMA_ID_MAP: {"DOS":"coingecko:dos"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default DOS_CHAIN;
