// Kava — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const KAVA: ChainConfig = {
  key: "KAVA",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://kava-rest.publicnode.com",
    RPC_URL: "https://kava-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Kava",
    DISPLAY_NAME: "Ledger - Kava",
    CHAIN_ID: "kava_2222-10",
    BECH32_PREFIX: "kava",
    NATIVE_SYMBOL: "KAVA",
    NATIVE_NAME: "Kava",
    NATIVE_DENOM: "ukava",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:kava",
    NATIVE_GECKO_ID: "kava",
  },
  DENOM_DECIMALS: {
    ukava: 6,
  },
  DENOM_SYMBOLS: {
    ukava: "KAVA",
  },
  LLAMA_ID_MAP: {
    KAVA: "coingecko:kava",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default KAVA;
