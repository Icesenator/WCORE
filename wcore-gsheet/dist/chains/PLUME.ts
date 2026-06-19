// Auto-generated from src/PLUME.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const PLUME: ChainConfig = {
  key: "PLUME",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.plume.org",
      "https://plume.drpc.org",
      "https://plume-mainnet.gateway.tatum.io",
    ],
  },
  CHAIN: {
    NAME: "Plume",
    CHAIN_ID: 98866,
    NATIVE_SYMBOL: "PLUME",
    NATIVE_NAME: "Plume",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:plume",
    NATIVE_GECKO_ID: "plume",
    DEX_SLUG: "plume-network",
    GT_NETWORK: "plume-network",
  },
  LLAMA_ID_MAP: {
    PLUME: "coingecko:plume",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    pETH: "coingecko:plume-eth",
    pUSD: "coingecko:plume-usd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default PLUME;
