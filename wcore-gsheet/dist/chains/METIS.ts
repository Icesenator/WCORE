// Auto-generated from src/METIS.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const METIS: ChainConfig = {
  key: "METIS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://andromeda.metis.io/?owner=1088",
      "https://metis-rpc.publicnode.com",
      "https://metis.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Metis",
    CHAIN_ID: 1088,
    NATIVE_SYMBOL: "METIS",
    NATIVE_NAME: "Metis",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:metis-token",
    NATIVE_GECKO_ID: "metis-token",
    DEX_SLUG: "metis",
    GT_NETWORK: "metis",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    METIS: "coingecko:metis-token",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WMETIS: "coingecko:metis-token",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default METIS;
