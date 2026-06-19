// Auto-generated from src/RONIN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const RONIN: ChainConfig = {
  key: "RONIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://api.roninchain.com/rpc",
      "https://ronin.drpc.org",
      "https://ronin.lgns.net/rpc",
    ],
  },
  CHAIN: {
    NAME: "Ronin",
    CHAIN_ID: 2020,
    NATIVE_SYMBOL: "RON",
    NATIVE_NAME: "Ronin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ronin",
    NATIVE_GECKO_ID: "ronin",
    DEX_SLUG: "ronin",
    GT_NETWORK: "ronin",
  },
  LLAMA_ID_MAP: {
    AXS: "coingecko:axie-infinity",
    RON: "coingecko:ronin",
    SLP: "coingecko:smooth-love-potion",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WRON: "coingecko:ronin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default RONIN;
