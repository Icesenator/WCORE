// Auto-generated from src/DUCKCHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const DUCKCHAIN: ChainConfig = {
  key: "DUCKCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.duckchain.io",
      "https://rpc-hk.duckchain.io",
    ],
  },
  CHAIN: {
    NAME: "DuckChain",
    CHAIN_ID: 5545,
    NATIVE_SYMBOL: "GRAM",
    NATIVE_NAME: "Gram",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:the-open-network",
    NATIVE_GECKO_ID: "the-open-network",
    DEX_SLUG: "duckchain",
    GT_NETWORK: "duckchain",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    GRAM: "coingecko:the-open-network",
    TON: "coingecko:the-open-network",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default DUCKCHAIN;
