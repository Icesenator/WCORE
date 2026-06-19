// Celestia — Cosmos SDK chain
import type { ChainConfig } from "../types.js";

export const CELESTIA: ChainConfig = {
  key: "CELESTIA",
  vm: "COSMOS",
  ...({
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://celestia-rest.publicnode.com",
    RPC_URL: "https://celestia-rpc.publicnode.com",
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Celestia",
    DISPLAY_NAME: "Ledger - Celestia",
    CHAIN_ID: "celestia",
    BECH32_PREFIX: "celestia",
    NATIVE_SYMBOL: "TIA",
    NATIVE_NAME: "Celestia",
    NATIVE_DENOM: "utia",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:celestia",
    NATIVE_GECKO_ID: "celestia",
  },
  DENOM_DECIMALS: {
    utia: 6,
  },
  DENOM_SYMBOLS: {
    utia: "TIA",
  },
  LLAMA_ID_MAP: {
    TIA: "coingecko:celestia",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CELESTIA;
