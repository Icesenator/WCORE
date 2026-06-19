// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const RSS3: ChainConfig = {
  key: "RSS3",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://12553.rpc.thirdweb.com",
      "https://rpc.rss3.io"
    ],
  },
  CHAIN: {
    NAME: "RSS3",
    CHAIN_ID: 12553,
    NATIVE_SYMBOL: "RSS3",
    NATIVE_NAME: "RSS3 Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rss3",
    NATIVE_GECKO_ID: "rss3",
    DEX_SLUG: "rss3",
    GT_NETWORK: "rss3",
  },
  LLAMA_ID_MAP: {"RSS3":"coingecko:rss3"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default RSS3;
