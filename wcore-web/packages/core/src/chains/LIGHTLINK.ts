// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const LIGHTLINK: ChainConfig = {
  key: "LIGHTLINK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1890.rpc.thirdweb.com",
      "https://replicator.phoenix.lightlink.io/rpc/v1"
    ],
  },
  CHAIN: {
    NAME: "LightLink Phoenix",
    CHAIN_ID: 1890,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "LightLink Phoenix Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "lightlink",
    GT_NETWORK: "lightlink",
  },
  LLAMA_ID_MAP: {"ETH":"coingecko:ethereum"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default LIGHTLINK;
