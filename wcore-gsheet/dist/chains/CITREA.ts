// Auto-generated from src/CITREA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CITREA: ChainConfig = {
  key: "CITREA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mainnet.citrea.xyz",
    ],
  },
  CHAIN: {
    NAME: "Citrea",
    CHAIN_ID: 4114,
    NATIVE_SYMBOL: "cBTC",
    NATIVE_NAME: "Citrea Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "citrea",
    GT_NETWORK: "citrea",
  },
  LLAMA_ID_MAP: {
    cBTC: "coingecko:bitcoin",
    WBTC: "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CITREA;
