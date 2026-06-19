// Auto-generated from src/CAMP.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CAMP: ChainConfig = {
  key: "CAMP",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [],
    BLOCKSCOUT_RPC: "https://camp.cloud.blockscout.com/api/eth-rpc",
  },
  CHAIN: {
    NAME: "Camp",
    CHAIN_ID: 484,
    NATIVE_SYMBOL: "CAMP",
    NATIVE_NAME: "Camp",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:camp-network",
    NATIVE_GECKO_ID: "camp-network",
    DEX_SLUG: "camp",
    GT_NETWORK: "camp-network",
  },
  LLAMA_ID_MAP: {
    CAMP: "coingecko:camp-network",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CAMP;
