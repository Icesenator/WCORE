// Auto-generated from src/ARBITRUM_NOVA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ARBITRUM_NOVA: ChainConfig = {
  key: "ARBITRUM_NOVA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://nova.arbitrum.io/rpc",
      "https://arbitrum-nova.drpc.org",
      "https://arbitrum-nova.publicnode.com",
    ],
  },
  CHAIN: {
    NAME: "Arbitrum Nova",
    CHAIN_ID: 42170,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "arbitrum-nova",
    GT_NETWORK: "arbitrum_nova",
  },
  LLAMA_ID_MAP: {
    ARB: "coingecko:arbitrum",
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ARBITRUM_NOVA;
