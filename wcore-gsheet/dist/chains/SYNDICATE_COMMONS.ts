// Auto-generated from src/SYNDICATE_COMMONS.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SYNDICATE_COMMONS: ChainConfig = {
  key: "SYNDICATE_COMMONS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 25000,
    HTTP_MS: 8000,
    SAFE_MARGIN_MS: 1000,
    FAST_FAIL_MS: 7000,
  },
  RPC: {
    ENDPOINTS: [
      "https://commons.rpc.syndicate.io",
      "https://510003.rpc.thirdweb.com",
      "https://rpc.commons.syndicate.io",
    ],
    MAX_FAILURES_BEFORE_BLOCK: 5,
    BLOCK_DURATION_MS: 30000,
    RETRY_COUNT: 3,
    RETRY_DELAY_MS: 1000,
  },
  CHAIN: {
    NAME: "Syndicate Commons",
    CHAIN_ID: 510003,
    NATIVE_SYMBOL: "SYND",
    NATIVE_NAME: "Syndicate",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "base:0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
    NATIVE_GECKO_ID: "syndicate-3",
    NATIVE_PRICE_CONTRACT: "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
    DEX_SLUG: "base",
    GT_NETWORK: "base",
  },
  LLAMA_ID_MAP: {
    SYND: "base:0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SYNDICATE_COMMONS;
