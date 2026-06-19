// Neutron — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const NEUTRON: ChainConfig = {
  key: "NEUTRON",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://neutron-rest.publicnode.com",
    RPC_URL: "https://neutron-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Neutron",
    DISPLAY_NAME: "Ledger - Neutron",
    CHAIN_ID: "neutron-1",
    BECH32_PREFIX: "neutron",
    NATIVE_SYMBOL: "NTRN",
    NATIVE_NAME: "Neutron",
    NATIVE_DENOM: "untrn",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:neutron-3",
    NATIVE_GECKO_ID: "neutron-3",
  },
  DENOM_DECIMALS: {
    untrn: 6,
  },
  DENOM_SYMBOLS: {
    untrn: "NTRN",
  },
  LLAMA_ID_MAP: {
    NTRN: "coingecko:neutron-3",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default NEUTRON;
