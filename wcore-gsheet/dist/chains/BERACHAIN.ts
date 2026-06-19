// Auto-generated from src/BERACHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BERACHAIN: ChainConfig = {
  key: "BERACHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.berachain.com",
      "https://berachain.drpc.org",
      "https://berachain-rpc.publicnode.com",
    ],
  },
  CHAIN: {
    NAME: "Berachain",
    CHAIN_ID: 80094,
    NATIVE_SYMBOL: "BERA",
    NATIVE_NAME: "Bera",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:berachain-bera",
    NATIVE_GECKO_ID: "berachain-bera",
    DEX_SLUG: "berachain",
    GT_NETWORK: "berachain",
  },
  LLAMA_ID_MAP: {
    BERA: "coingecko:berachain-bera",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BERACHAIN;
