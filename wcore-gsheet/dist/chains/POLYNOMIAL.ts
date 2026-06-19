// Auto-generated from src/POLYNOMIAL.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const POLYNOMIAL: ChainConfig = {
  key: "POLYNOMIAL",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.polynomial.fi",
      "https://rpc-proxy.polynomial.fi",
    ],
  },
  CHAIN: {
    NAME: "Polynomial",
    CHAIN_ID: 8008,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "polynomial",
    GT_NETWORK: "polynomial",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
    sUSD: "coingecko:susd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default POLYNOMIAL;
