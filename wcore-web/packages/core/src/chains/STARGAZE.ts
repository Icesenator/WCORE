// Stargaze — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const STARGAZE: ChainConfig = {
  key: "STARGAZE",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://stargaze-rest.publicnode.com",
    RPC_URL: "https://stargaze-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Stargaze",
    DISPLAY_NAME: "Ledger - Stargaze",
    CHAIN_ID: "stargaze-1",
    BECH32_PREFIX: "stars",
    NATIVE_SYMBOL: "STARS",
    NATIVE_NAME: "Stargaze",
    NATIVE_DENOM: "ustars",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:stargaze",
    NATIVE_GECKO_ID: "stargaze",
  },
  DENOM_DECIMALS: {
    ustars: 6,
  },
  DENOM_SYMBOLS: {
    ustars: "STARS",
  },
  LLAMA_ID_MAP: {
    STARS: "coingecko:stargaze",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STARGAZE;
