// Auto-generated from src/ZIRCUIT.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ZIRCUIT: ChainConfig = {
  key: "ZIRCUIT",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.zircuit.com",
      "https://48900.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Zircuit",
    CHAIN_ID: 48900,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "zircuit",
    GT_NETWORK: "zircuit",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    ZRC: "coingecko:zircuit",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZIRCUIT;
