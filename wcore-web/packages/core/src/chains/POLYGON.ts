// Auto-generated from src/POLYGON.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const POLYGON: ChainConfig = {
  key: "POLYGON",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://polygon.drpc.org",
      "https://rpc.ankr.com/polygon",
      "https://polygon.publicnode.com",
      "https://polygon.meowrpc.com",
      "https://1rpc.io/matic",
    ],
  },
  CHAIN: {
    NAME: "Polygon",
    CHAIN_ID: 137,
    NATIVE_SYMBOL: "POL",
    NATIVE_NAME: "POL",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:polygon-ecosystem-token",
    NATIVE_GECKO_ID: "polygon-ecosystem-token",
    DEX_SLUG: "polygon",
    GT_NETWORK: "polygon_pos",
  },
  LLAMA_ID_MAP: {
    AAVE: "coingecko:aave",
    DAI: "coingecko:dai",
    LINK: "coingecko:chainlink",
    MATIC: "coingecko:matic-network",
    POL: "coingecko:polygon-ecosystem-token",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:bridged-usdc-polygon-pos-bridge",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WMATIC: "coingecko:wmatic",
    WPOL: "coingecko:polygon-ecosystem-token",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default POLYGON;
