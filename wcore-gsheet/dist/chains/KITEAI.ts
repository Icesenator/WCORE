// Auto-generated from src/KITEAI.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const KITEAI: ChainConfig = {
  key: "KITEAI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2366.rpc.thirdweb.com",
      "https://rpc.gokite.ai",
    ],
  },
  CHAIN: {
    NAME: "KiteAI",
    CHAIN_ID: 2366,
    NATIVE_SYMBOL: "KITE",
    NATIVE_NAME: "KiteAI Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "kiteai",
    GT_NETWORK: "kiteai",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default KITEAI;
