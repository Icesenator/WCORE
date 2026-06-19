// Auto-generated from src/BITLAYER.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BITLAYER: ChainConfig = {
  key: "BITLAYER",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.bitlayer.org",
      "https://rpc.bitlayer-rpc.com",
      "https://rpc.ankr.com/bitlayer",
    ],
  },
  CHAIN: {
    NAME: "Bitlayer",
    CHAIN_ID: 200901,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "bitlayer",
    GT_NETWORK: "bitlayer",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
    DAI: "coingecko:dai",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BITLAYER;
