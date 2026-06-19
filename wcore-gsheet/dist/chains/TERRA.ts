// Auto-generated from src/TERRA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TERRA: ChainConfig = {
  key: "TERRA",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://terra-rest.publicnode.com",
    LCD_URL: "https://terra-rest.publicnode.com",
    RPC_URL: "https://terra-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Terra",
    DISPLAY_NAME: "Ledger - Terra",
    CHAIN_ID: "phoenix-1",
    BECH32_PREFIX: "terra",
    NATIVE_SYMBOL: "LUNA",
    NATIVE_NAME: "Terra Luna",
    NATIVE_DENOM: "uluna",
    NATIVE_DECIMALS: 6,
    INCLUDE_STAKED_NATIVE: true,
    NATIVE_LLAMA_ID: "coingecko:terra-luna-2",
    NATIVE_GECKO_ID: "terra-luna-2",
  },
  DENOM_DECIMALS: {
    uluna: 6,
  },
  DENOM_SYMBOLS: {
    uluna: "LUNA",
  },
  LLAMA_ID_MAP: {
    LUNA: "coingecko:terra-luna-2",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TERRA;
