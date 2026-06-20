// Auto-generated from src/NEO_X.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const NEO_X: ChainConfig = {
  key: "NEO_X",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://47763.rpc.thirdweb.com",
      "https://mainnet-1.rpc.banelabs.org",
      "https://mainnet-2.rpc.banelabs.org",
    ],
  },
  CHAIN: {
    NAME: "Neo X",
    CHAIN_ID: 47763,
    NATIVE_SYMBOL: "GAS",
    NATIVE_NAME: "Neo X Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:neo",
    NATIVE_GECKO_ID: "neo",
    DEX_SLUG: "neo-x",
    GT_NETWORK: "neo-x",
  },
  LLAMA_ID_MAP: {
    GAS: "coingecko:neo",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default NEO_X;
