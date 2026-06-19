// Auto-generated from src/OPBNB.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const OPBNB: ChainConfig = {
  key: "OPBNB",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://opbnb-mainnet-rpc.bnbchain.org",
      "https://opbnb.drpc.org",
      "https://opbnb-rpc.publicnode.com",
      "https://1rpc.io/opbnb",
    ],
  },
  CHAIN: {
    NAME: "opBNB",
    CHAIN_ID: 204,
    NATIVE_SYMBOL: "BNB",
    NATIVE_NAME: "BNB",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:binancecoin",
    NATIVE_GECKO_ID: "binancecoin",
    DEX_SLUG: "opbnb",
    GT_NETWORK: "opbnb",
  },
  LLAMA_ID_MAP: {
    BNB: "coingecko:binancecoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default OPBNB;
