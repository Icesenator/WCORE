// Auto-generated from src/SONIC.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SONIC: ChainConfig = {
  key: "SONIC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.soniclabs.com",
      "https://sonic-rpc.publicnode.com",
      "https://sonic.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Sonic",
    CHAIN_ID: 146,
    NATIVE_SYMBOL: "S",
    NATIVE_NAME: "Sonic",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:sonic-3",
    NATIVE_GECKO_ID: "sonic-3",
    DEX_SLUG: "sonic",
    GT_NETWORK: "sonic",
  },
  LLAMA_ID_MAP: {
    S: "coingecko:sonic-3",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    wS: "coingecko:wrapped-sonic",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SONIC;
