// Auto-generated from src/MANTLE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MANTLE: ChainConfig = {
  key: "MANTLE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mantle.xyz",
      "https://1rpc.io/mantle",
      "https://mantle.drpc.org",
      "https://mantle-rpc.publicnode.com",
    ],
  },
  CHAIN: {
    NAME: "Mantle",
    CHAIN_ID: 5000,
    NATIVE_SYMBOL: "MNT",
    NATIVE_NAME: "Mantle",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:mantle",
    NATIVE_GECKO_ID: "mantle",
    DEX_SLUG: "mantle",
    GT_NETWORK: "mantle",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    MNT: "coingecko:mantle",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WMNT: "coingecko:mantle",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MANTLE;
