// Auto-generated from src/DOMA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const DOMA: ChainConfig = {
  key: "DOMA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://doma.drpc.org",
      "https://rpc.doma.xyz",
    ],
  },
  CHAIN: {
    NAME: "Doma",
    CHAIN_ID: 97477,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "doma",
    GT_NETWORK: "doma",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default DOMA;
