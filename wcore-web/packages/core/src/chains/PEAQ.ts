// Auto-generated from src/PEAQ.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const PEAQ: ChainConfig = {
  key: "PEAQ",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 25000,
    HTTP_MS: 2500,
    SAFE_MARGIN_MS: 900,
    SAFE_SAVE_MARGIN_MS: 1400,
    SAFE_PRICE_MARGIN_MS: 4000,
    NATIVE_PRICE_MIN_LEFT_MS: 3500,
    HARD_GUARD_MS: 22000,
    HARD_PRICE_CUTOFF_MS: 3000,
    FAST_FAIL_MS: 2500,
  },
  RPC: {
    ENDPOINTS: [
      "https://peaq-rpc.publicnode.com",
      "https://peaq.api.onfinality.io/public",
      "https://quicknode1.peaq.xyz",
    ],
  },
  CHAIN: {
    NAME: "Peaq",
    CHAIN_ID: 3338,
    NATIVE_SYMBOL: "PEAQ",
    NATIVE_NAME: "Peaq",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:peaq-2",
    NATIVE_GECKO_ID: "peaq-2",
    DEX_SLUG: "peaq",
    GT_NETWORK: "peaq",
  },
  LLAMA_ID_MAP: {
    PEAQ: "coingecko:peaq-2",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default PEAQ;
