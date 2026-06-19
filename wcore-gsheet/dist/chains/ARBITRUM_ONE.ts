// Auto-generated from src/ARBITRUM_ONE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ARBITRUM_ONE: ChainConfig = {
  key: "ARBITRUM_ONE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://arb1.arbitrum.io/rpc",
      "https://1rpc.io/arb",
      "https://arbitrum.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Arbitrum One",
    CHAIN_ID: 42161,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "arbitrum",
    GT_NETWORK: "arbitrum",
  },
  LLAMA_ID_MAP: {
    ARB: "coingecko:arbitrum",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:bridged-usdc-arbitrum",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ARBITRUM_ONE;
