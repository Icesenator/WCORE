// Auto-generated from src/ZORA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ZORA: ChainConfig = {
  key: "ZORA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 20000,
    HTTP_MS: 4000,
    SAFE_MARGIN_MS: 800,
  },
  RPC: {
    ENDPOINTS: [
      "https://rpc.zora.energy",
      "https://zora.drpc.org",
      "https://1rpc.io/zora",
      "https://rpc.ankr.com/zora",
      "https://zora-mainnet.public.blastapi.io",
      "https://7777777.rpc.thirdweb.com",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 60000,
  },
  CHAIN: {
    NAME: "Zora",
    CHAIN_ID: 7777777,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "zora",
    GT_NETWORK: "zora-network",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZORA;
