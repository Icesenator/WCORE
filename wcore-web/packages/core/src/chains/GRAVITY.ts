// Auto-generated from src/GRAVITY.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const GRAVITY: ChainConfig = {
  key: "GRAVITY",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.gravity.xyz",
      "https://1625.rpc.thirdweb.com",
    ],
    MAX_LOG_RANGE: 2000,
  },
  CHAIN: {
    NAME: "Gravity",
    CHAIN_ID: 1625,
    NATIVE_SYMBOL: "G",
    NATIVE_NAME: "Gravity",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:g-token",
    NATIVE_GECKO_ID: "g-token",
    DEX_SLUG: "gravity",
    GT_NETWORK: "gravity-alpha",
  },
  LLAMA_ID_MAP: {
    G: "coingecko:g-token",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default GRAVITY;
