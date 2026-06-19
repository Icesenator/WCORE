// SurfLayer — EVM chain
import type { ChainConfig } from "../types.js";

export const SURFLAYER: ChainConfig = {
  key: "SURFLAYER",
  vm: "EVM",
  ...({
  CACHE_VERSION: 67,
  TIMEOUTS: {
    HTTP_MS: 3000,
  },
  RPC: {
    ENDPOINTS: [
      "https://rpc.surflayer.com",
      "https://surflayer.drpc.org",
    ],
  },
  CHAIN: {
    VM: "EVM",
    NAME: "SurfLayer",
    DISPLAY_NAME: "Ledger - SurfLayer",
    CHAIN_ID: 68775,
    NATIVE_SYMBOL: "SURF",
    NATIVE_NAME: "SurfLayer",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:surflayer",
    NATIVE_GECKO_ID: "surflayer",
    DEX_SLUG: "surflayer",
  },
  LLAMA_ID_MAP: {
    SURF: "coingecko:surflayer",
  },
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SURFLAYER;
