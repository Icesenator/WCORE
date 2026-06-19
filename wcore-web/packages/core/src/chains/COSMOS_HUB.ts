// Auto-generated from src/COSMOS_HUB.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const COSMOS_HUB: ChainConfig = {
  key: "COSMOS_HUB",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://cosmos-rest.publicnode.com",
    REST_URLS: [
      "https://cosmos-rest.publicnode.com",
      "https://rest.cosmos.directory/cosmoshub",
      "https://cosmoshub-api.lavenderfive.com",
    ],
    LCD_URL: "https://cosmos-rest.publicnode.com",
    RPC_URL: "https://cosmos-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Cosmos Hub",
    DISPLAY_NAME: "Ledger - Cosmos Hub",
    CHAIN_ID: "cosmoshub-4",
    BECH32_PREFIX: "cosmos",
    NATIVE_SYMBOL: "ATOM",
    NATIVE_NAME: "Cosmos",
    NATIVE_DENOM: "uatom",
    NATIVE_DECIMALS: 6,
    INCLUDE_STAKED_NATIVE: true,
    NATIVE_LLAMA_ID: "coingecko:cosmos",
    NATIVE_GECKO_ID: "cosmos",
  },
  DENOM_DECIMALS: {
    uatom: 6,
  },
  DENOM_SYMBOLS: {
    uatom: "ATOM",
  },
  LLAMA_ID_MAP: {
    ATOM: "coingecko:cosmos",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default COSMOS_HUB;
