// Auto-generated from src/MEZO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MEZO: ChainConfig = {
  key: "MEZO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 22000,
    HTTP_MS: 5000,
    SAFE_MARGIN_MS: 900,
  },
  RPC: {
    ENDPOINTS: [
      "https://rpc-http.mezo.boar.network",
      "https://mainnet.mezo.public.validationcloud.io",
      "https://mezo.drpc.org",
      "https://rpc_evm-mezo.imperator.co",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 60000,
  },
  CHAIN: {
    NAME: "Mezo",
    CHAIN_ID: 31612,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "mezo",
    GT_NETWORK: "mezo",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    MUSD: "coingecko:musd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MEZO;
