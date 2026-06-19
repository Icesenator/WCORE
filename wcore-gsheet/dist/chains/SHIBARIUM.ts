// Auto-generated from src/SHIBARIUM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SHIBARIUM: ChainConfig = {
  key: "SHIBARIUM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://shibarium.drpc.org",
      "https://rpc.shibarium.shib.io",
    ],
  },
  CHAIN: {
    NAME: "Shibarium",
    CHAIN_ID: 109,
    NATIVE_SYMBOL: "BONE",
    NATIVE_NAME: "Bone ShibaSwap",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bone-shibaswap",
    NATIVE_GECKO_ID: "bone-shibaswap",
    DEX_SLUG: "shibarium",
    GT_NETWORK: "shibarium",
  },
  LLAMA_ID_MAP: {
    BONE: "coingecko:bone-shibaswap",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SHIBARIUM;
