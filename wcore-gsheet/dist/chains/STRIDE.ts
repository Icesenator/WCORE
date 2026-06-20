// Auto-generated from src/STRIDE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const STRIDE: ChainConfig = {
  key: "STRIDE",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://stride-rest.publicnode.com",
    RPC_URL: "https://stride-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Stride",
    DISPLAY_NAME: "Ledger - Stride",
    CHAIN_ID: "stride-1",
    BECH32_PREFIX: "stride",
    NATIVE_SYMBOL: "STRD",
    NATIVE_NAME: "Stride",
    NATIVE_DENOM: "ustrd",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:stride",
    NATIVE_GECKO_ID: "stride",
  },
  DENOM_DECIMALS: {
    ustrd: 6,
  },
  DENOM_SYMBOLS: {
    ustrd: "STRD",
  },
  LLAMA_ID_MAP: {
    STRD: "coingecko:stride",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STRIDE;
