// Auto-generated from src/AURORA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AURORA: ChainConfig = {
  key: "AURORA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.aurora.dev",
      "https://1rpc.io/aurora",
      "https://aurora.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Aurora",
    CHAIN_ID: 1313161554,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "aurora",
    GT_NETWORK: "aurora",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default AURORA;
