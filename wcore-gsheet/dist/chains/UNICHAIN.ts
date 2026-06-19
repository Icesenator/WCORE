// Auto-generated from src/UNICHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const UNICHAIN: ChainConfig = {
  key: "UNICHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 20000,
    HTTP_MS: 4000,
    SAFE_MARGIN_MS: 800,
    FAST_FAIL_MS: 3500,
  },
  RPC: {
    MAX_BATCH_SIZE: 10,
    ENDPOINTS: [
      "https://mainnet.unichain.org",
      "https://rpc.unichain.org",
      "https://unichain.drpc.org",
      "https://rpc.ankr.com/unichain",
      "https://1rpc.io/unichain",
      "https://unichain.blockpi.network/v1/rpc/public",
      "https://130.rpc.thirdweb.com",
      "https://unichain-mainnet.g.alchemy.com/public",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 60000,
  },
  CHAIN: {
    NAME: "Unichain",
    CHAIN_ID: 130,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "unichain",
    GT_NETWORK: "unichain",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    UNI: "coingecko:uniswap",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default UNICHAIN;
