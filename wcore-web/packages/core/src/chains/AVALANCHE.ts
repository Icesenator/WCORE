// Auto-generated from src/AVALANCHE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const AVALANCHE: ChainConfig = {
  key: "AVALANCHE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avalanche.public-rpc.com",
      "https://avalanche.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Avalanche",
    CHAIN_ID: 43114,
    NATIVE_SYMBOL: "AVAX",
    NATIVE_NAME: "Avalanche",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:avalanche-2",
    NATIVE_GECKO_ID: "avalanche-2",
    DEX_SLUG: "avalanche",
    GT_NETWORK: "avax",
    LLAMA_CHAIN_SLUG: "avax",
  },
  LLAMA_ID_MAP: {
    AVAX: "coingecko:avalanche-2",
    DAI: "coingecko:dai",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WAVAX: "coingecko:wrapped-avax",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default AVALANCHE;
