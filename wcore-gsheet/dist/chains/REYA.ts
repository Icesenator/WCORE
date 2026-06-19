// Auto-generated from src/REYA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const REYA: ChainConfig = {
  key: "REYA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.reya.network",
      "https://reya.drpc.org",
      "https://1729.rpc.thirdweb.com",
      "https://rpc.reya-cronos.gelato.digital",
    ],
  },
  CHAIN: {
    NAME: "Reya Network",
    CHAIN_ID: 1729,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "reya",
    GT_NETWORK: "reya",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
    rUSD: "coingecko:reya-usd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default REYA;
