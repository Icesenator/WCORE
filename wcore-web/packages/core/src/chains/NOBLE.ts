// Noble — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const NOBLE: ChainConfig = {
  key: "NOBLE",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://noble-rest.publicnode.com",
    RPC_URL: "https://noble-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Noble",
    DISPLAY_NAME: "Ledger - Noble",
    CHAIN_ID: "noble-1",
    BECH32_PREFIX: "noble",
    NATIVE_SYMBOL: "USDC",
    NATIVE_NAME: "Noble USDC",
    NATIVE_DENOM: "uusdc",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:usd-coin",
    NATIVE_GECKO_ID: "usd-coin",
  },
  DENOM_DECIMALS: {
    uusdc: 6,
  },
  DENOM_SYMBOLS: {
    uusdc: "USDC",
  },
  LLAMA_ID_MAP: {
    USDC: "coingecko:usd-coin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default NOBLE;
