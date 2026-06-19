// Auto-generated from src/LINEA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LINEA: ChainConfig = {
  key: "LINEA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://linea.drpc.org",
      "https://rpc.linea.build",
      "https://1rpc.io/linea",
    ],
  },
  CHAIN: {
    NAME: "Linea",
    CHAIN_ID: 59144,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "linea",
    GT_NETWORK: "linea",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:bridged-usd-coin-linea",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LINEA;
