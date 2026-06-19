// Auto-generated from src/X_LAYER.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const X_LAYER: ChainConfig = {
  key: "X_LAYER",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.xlayer.tech",
      "https://xlayerrpc.okx.com",
      "https://xlayer.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "X Layer",
    CHAIN_ID: 196,
    NATIVE_SYMBOL: "OKB",
    NATIVE_NAME: "OKB",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:okb",
    NATIVE_GECKO_ID: "okb",
    DEX_SLUG: "xlayer",
    GT_NETWORK: "x-layer",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    OKB: "coingecko:okb",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WOKB: "coingecko:okb",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default X_LAYER;
