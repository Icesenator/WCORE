// Auto-generated from src/LORENZO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LORENZO: ChainConfig = {
  key: "LORENZO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8329.rpc.thirdweb.com",
      "https://rpc.lorenzo-protocol.xyz",
    ],
  },
  CHAIN: {
    NAME: "Lorenzo",
    CHAIN_ID: 8329,
    NATIVE_SYMBOL: "Lorenzo",
    NATIVE_NAME: "Lorenzo Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:lorenzo",
    NATIVE_GECKO_ID: "lorenzo-protocol",
    DEX_SLUG: "lorenzo",
    GT_NETWORK: "lorenzo",
  },
  LLAMA_ID_MAP: {
    Lorenzo: "coingecko:lorenzo",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LORENZO;
