// Auto-generated from src/TON.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TON: ChainConfig = {
  key: "TON",
  vm: "TON",
  ...({
  VERSION: "TON_v4.15.81",
  CACHE_VERSION: 5,
  RPC: {
    ENDPOINTS: [
      "https://tonapi.io/v2",
      "https://toncenter.com/api/v2",
    ],
    TIMEOUT_MS: 4000,
  },
  TIMEOUTS: {
    MAX_EXECUTION_MS: 30000,
    HTTP_MS: 4000,
  },
  CACHE: {
    WALLET_CACHE_TTL_SECONDS: 86400,
    WALLET_TTL_MS: 86400000,
    PRICE_TTL_MS: 43200000,
  },
  KEYS: {
    WALLET_CACHE_PREFIX: "TON_CACHE_WALLET_",
    NATIVE_PRICE: "native",
  },
  CHAIN: {
    VM: "TON",
    NAME: "TON",
    DISPLAY_NAME: "Space - TON",
    NATIVE_SYMBOL: "GRAM",
    NATIVE_NAME: "Gram",
    NATIVE_DECIMALS: 9,
    NATIVE_LLAMA_ID: "coingecko:the-open-network",
    NATIVE_GECKO_ID: "the-open-network",
  },
  API: {
    TONAPI_BASE: "https://tonapi.io/v2",
    TONCENTER_BALANCE: "https://toncenter.com/api/v2/getAddressBalance",
  },
  LLAMA_ID_MAP: {
    GRAM: "coingecko:the-open-network",
    TON: "coingecko:the-open-network",
    USDT: "coingecko:tether",
    "USD₮": "coingecko:tether",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TON;
