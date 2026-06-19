// Auto-generated from src/ZKLINKNOVA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ZKLINKNOVA: ChainConfig = {
  key: "ZKLINKNOVA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://810180.rpc.thirdweb.com",
      "https://zklink-nova.api.pocket.network/",
      "https://rpc.zklink.io",
    ],
  },
  CHAIN: {
    NAME: "zkLink Nova",
    CHAIN_ID: 810180,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "zklink-nova",
    GT_NETWORK: "zklink-nova",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZKLINKNOVA;
