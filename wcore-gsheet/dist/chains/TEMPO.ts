// Auto-generated from src/TEMPO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TEMPO: ChainConfig = {
  key: "TEMPO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 72,
  RPC: {
    ENDPOINTS: [
      "https://tempo-mainnet.drpc.org",
    ],
    MAX_BATCH_SIZE: 3,
    TOKEN_DECIMALS: {
      "0x20c0000000000000000000000000000000000000": 6,
      "0x20c000000000000000000000b9537d11c60e8b50": 6,
    },
  },
  CHAIN: {
    NAME: "Tempo",
    CHAIN_ID: 4217,
    NATIVE_SYMBOL: "",
    NATIVE_NAME: "",
    NATIVE_DECIMALS: 0,
    NATIVE_LLAMA_ID: "",
    NATIVE_GECKO_ID: "",
    DEX_SLUG: null,
    GT_NETWORK: null,
    LLAMA_CHAIN_SLUG: "tempo",
  },
  FLAGS: {
    DISABLE_NATIVE_BALANCE: true,
    NATIVE_BALANCE_DISABLED_REASON: "sentinel",
  },
  LLAMA_ID_MAP: {
    USD: "coingecko:usd-coin",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:usd-coin",
    "USDC.E": "coingecko:usd-coin",
    USDT: "coingecko:tether",
    DAI: "coingecko:dai",
    pathUSD: "coingecko:pathusd",
    PATHUSD: "coingecko:pathusd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TEMPO;
