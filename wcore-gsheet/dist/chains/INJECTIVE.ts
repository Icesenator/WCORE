// Auto-generated from src/INJECTIVE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const INJECTIVE: ChainConfig = {
  key: "INJECTIVE",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://sentry.lcd.injective.network",
    LCD_URL: "https://sentry.lcd.injective.network",
    VERSION: "v1beta1",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Injective",
    DISPLAY_NAME: "Ledger - Injective",
    CHAIN_ID: "injective-1",
    NATIVE_SYMBOL: "INJ",
    NATIVE_NAME: "Injective",
    NATIVE_DENOM: "inj",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:injective-protocol",
    NATIVE_GECKO_ID: "injective-protocol",
  },
  DENOM_DECIMALS: {
    inj: 18,
  },
  DENOM_SYMBOLS: {
    inj: "INJ",
  },
  LLAMA_ID_MAP: {
    INJ: "coingecko:injective-protocol",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default INJECTIVE;
