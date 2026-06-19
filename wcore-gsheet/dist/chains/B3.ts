// Auto-generated from src/B3.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const B3: ChainConfig = {
  key: "B3",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet-rpc.b3.fun",
    ],
  },
  CHAIN: {
    NAME: "B3",
    CHAIN_ID: 8333,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "b3",
    GT_NETWORK: "b3",
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

export default B3;
