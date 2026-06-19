// dYdX — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const DYDX: ChainConfig = {
  key: "DYDX",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://dydx-rest.publicnode.com",
    RPC_URL: "https://dydx-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "dYdX",
    DISPLAY_NAME: "Ledger - dYdX",
    CHAIN_ID: "dydx-mainnet-1",
    BECH32_PREFIX: "dydx",
    NATIVE_SYMBOL: "DYDX",
    NATIVE_NAME: "dYdX",
    NATIVE_DENOM: "adydx",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dydx-chain",
    NATIVE_GECKO_ID: "dydx-chain",
  },
  DENOM_DECIMALS: {
    adydx: 18,
  },
  DENOM_SYMBOLS: {
    adydx: "DYDX",
  },
  LLAMA_ID_MAP: {
    DYDX: "coingecko:dydx-chain",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default DYDX;
