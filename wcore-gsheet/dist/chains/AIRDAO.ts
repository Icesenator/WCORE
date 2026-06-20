// Auto-generated from src/AIRDAO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AIRDAO: ChainConfig = {
  key: "AIRDAO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://16718.rpc.thirdweb.com",
      "https://network.ambrosus.io",
    ],
  },
  CHAIN: {
    NAME: "AirDAO",
    CHAIN_ID: 16718,
    NATIVE_SYMBOL: "AMB",
    NATIVE_NAME: "AirDAO Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ambrosus",
    NATIVE_GECKO_ID: "ambrosus",
    DEX_SLUG: "airdao",
    GT_NETWORK: "airdao",
  },
  LLAMA_ID_MAP: {
    AMB: "coingecko:ambrosus",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default AIRDAO;
