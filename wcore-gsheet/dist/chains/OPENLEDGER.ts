// Auto-generated from src/OPENLEDGER.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const OPENLEDGER: ChainConfig = {
  key: "OPENLEDGER",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.openledger.xyz",
    ],
  },
  CHAIN: {
    NAME: "OpenLedger",
    CHAIN_ID: 1612,
    NATIVE_SYMBOL: "OPEN",
    NATIVE_NAME: "OpenLedger",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:openledger-2",
    NATIVE_GECKO_ID: "openledger-2",
    DEX_SLUG: "openledger",
    GT_NETWORK: "openledger",
  },
  LLAMA_ID_MAP: {
    OPEN: "coingecko:openledger-2",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default OPENLEDGER;
