// Auto-generated from src/CORN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CORN: ChainConfig = {
  key: "CORN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://maizenet-rpc.usecorn.com",
    ],
  },
  CHAIN: {
    NAME: "Corn",
    CHAIN_ID: 21000000,
    NATIVE_SYMBOL: "BTCN",
    NATIVE_NAME: "BTCN",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "corn",
    GT_NETWORK: "corn",
  },
  LLAMA_ID_MAP: {
    BTCN: "coingecko:bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CORN;
