// Auto-generated from src/MEGAETH.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MEGAETH: ChainConfig = {
  key: "MEGAETH",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.megaeth.com/rpc",
      "https://megaeth.drpc.org",
      "https://rpc-megaeth-mainnet.globalstake.io",
    ],
  },
  CHAIN: {
    NAME: "MegaETH",
    CHAIN_ID: 4326,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "megaeth",
    GT_NETWORK: "megaeth",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MEGAETH;
