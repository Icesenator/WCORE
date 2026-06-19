// Auto-generated from src/MOONRIVER.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MOONRIVER: ChainConfig = {
  key: "MOONRIVER",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.api.moonriver.moonbeam.network",
      "https://moonriver.drpc.org",
      "https://moonriver-rpc.publicnode.com",
    ],
  },
  CHAIN: {
    NAME: "Moonriver",
    CHAIN_ID: 1285,
    NATIVE_SYMBOL: "MOVR",
    NATIVE_NAME: "Moonriver",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moonriver",
    NATIVE_GECKO_ID: "moonriver",
    DEX_SLUG: "moonriver",
    GT_NETWORK: "movr",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    MOVR: "coingecko:moonriver",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WMOVR: "coingecko:wrapped-moonriver",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MOONRIVER;
