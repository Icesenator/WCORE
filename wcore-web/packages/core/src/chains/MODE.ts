// Auto-generated from src/MODE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MODE: ChainConfig = {
  key: "MODE",
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
      "https://mainnet.mode.network",
      "https://mode.drpc.org",
      "https://1rpc.io/mode",
      "https://rpc.ankr.com/mode",
      "https://mode-mainnet.public.blastapi.io",
      "https://34443.rpc.thirdweb.com",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 60000,
  },
  CHAIN: {
    NAME: "Mode",
    CHAIN_ID: 34443,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "mode",
    GT_NETWORK: "mode",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    MODE: "coingecko:mode",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MODE;
