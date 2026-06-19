// Auto-generated from src/APPCHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const APPCHAIN: ChainConfig = {
  key: "APPCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.appchain.xyz",
      "https://466.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "AppChain",
    CHAIN_ID: 466,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "appchain",
    GT_NETWORK: "appchain",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default APPCHAIN;
