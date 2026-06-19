// Auto-generated from src/BASE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BASE: ChainConfig = {
  key: "BASE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://base.drpc.org",
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
      "https://1rpc.io/base",
    ],
  },
  CHAIN: {
    NAME: "Base",
    CHAIN_ID: 8453,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "base",
    GT_NETWORK: "base",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    USDbC: "coingecko:bridged-usd-coin-base",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    cbETH: "coingecko:coinbase-wrapped-staked-eth",
  },
  LLAMA_CONTRACT_MAP: {
    "0xba12bc7b210e61e5d3110b997a63ea216e0e18f7": "coingecko:chainbase",
    "0x5b2193fdc451c1f847be09ca9d13a4bf60f8c86b": "coingecko:superform",
    "0x50d7a818e5e339ebe13b17e130b5b608fac354dc": "coingecko:vision-ai-by-virtuals",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BASE;
