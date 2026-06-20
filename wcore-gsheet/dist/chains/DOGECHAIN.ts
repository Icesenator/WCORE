// Auto-generated from src/DOGECHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const DOGECHAIN: ChainConfig = {
  key: "DOGECHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2000.rpc.thirdweb.com",
      "https://rpc.dogechain.dog",
      "https://rpc01-sg.dogechain.dog",
      "https://rpc.ankr.com/dogechain",
    ],
  },
  CHAIN: {
    NAME: "Dogechain",
    CHAIN_ID: 2000,
    NATIVE_SYMBOL: "DOGE",
    NATIVE_NAME: "Dogechain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dogecoin",
    NATIVE_GECKO_ID: "dogecoin",
    DEX_SLUG: "dogechain",
    GT_NETWORK: "dogechain",
  },
  LLAMA_ID_MAP: {
    DOGE: "coingecko:dogecoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default DOGECHAIN;
