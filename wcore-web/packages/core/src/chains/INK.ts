// Auto-generated from src/INK.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const INK: ChainConfig = {
  key: "INK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc-gel.inkonchain.com",
      "https://ink.drpc.org",
      "https://rpc-qnd.inkonchain.com",
    ],
  },
  CHAIN: {
    NAME: "Ink",
    CHAIN_ID: 57073,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "ink",
    GT_NETWORK: "ink",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default INK;
