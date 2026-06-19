// Auto-generated from src/ROOTSTOCK.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ROOTSTOCK: ChainConfig = {
  key: "ROOTSTOCK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://public-node.rsk.co",
      "https://rsk.drpc.org",
      "https://rpc.ankr.com/rsk",
    ],
  },
  CHAIN: {
    NAME: "Rootstock",
    CHAIN_ID: 30,
    NATIVE_SYMBOL: "RBTC",
    NATIVE_NAME: "Rootstock Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "rootstock",
    GT_NETWORK: "rootstock",
  },
  LLAMA_ID_MAP: {
    RBTC: "bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ROOTSTOCK;
