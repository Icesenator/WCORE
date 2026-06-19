// Auto-generated from src/OSMOSIS.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const OSMOSIS: ChainConfig = {
  key: "OSMOSIS",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://osmosis-rest.publicnode.com",
    RPC_URL: "https://osmosis-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Osmosis",
    DISPLAY_NAME: "Ledger - Osmosis",
    CHAIN_ID: "osmosis-1",
    BECH32_PREFIX: "osmo",
    NATIVE_SYMBOL: "OSMO",
    NATIVE_NAME: "Osmosis",
    NATIVE_DENOM: "uosmo",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:osmosis",
    NATIVE_GECKO_ID: "osmosis",
  },
  DENOM_DECIMALS: {
    uosmo: 6,
  },
  DENOM_SYMBOLS: {
    uosmo: "OSMO",
  },
  LLAMA_ID_MAP: {
    OSMO: "coingecko:osmosis",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default OSMOSIS;
