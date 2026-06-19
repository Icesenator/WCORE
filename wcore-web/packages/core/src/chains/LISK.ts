// Auto-generated from src/LISK.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LISK: ChainConfig = {
  key: "LISK",
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
    ENDPOINTS: [
      "https://rpc.api.lisk.com",
      "https://lisk.drpc.org",
      "https://1135.rpc.thirdweb.com",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 60000,
  },
  CHAIN: {
    NAME: "Lisk",
    CHAIN_ID: 1135,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "lisk",
    GT_NETWORK: "lisk",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    LSK: "coingecko:lisk",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LISK;
