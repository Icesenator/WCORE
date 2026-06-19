// Auto-generated from src/STORY.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const STORY: ChainConfig = {
  key: "STORY",
  vm: "EVM",
  ...({
  CACHE_VERSION: 65,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.storyrpc.io",
      "https://story.drpc.org",
      "https://rpc.ankr.com/story",
      "https://story-mainnet-evmrpc.mandragora.io",
    ],
  },
  CHAIN: {
    NAME: "Story",
    CHAIN_ID: 1514,
    NATIVE_SYMBOL: "IP",
    NATIVE_NAME: "Story IP",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:story-2",
    NATIVE_GECKO_ID: "story-2",
    DEX_SLUG: "story",
    GT_NETWORK: "story",
  },
  LLAMA_ID_MAP: {
    IP: "coingecko:story-2",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WIP: "coingecko:story-2",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STORY;
