// Auto-generated from src/MOCA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MOCA: ChainConfig = {
  key: "MOCA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mocachain.org",
      "https://moca.drpc.org",
    ],
  },
  ACTIVITY_EXPLORER: {
    TYPE: "blockscout",
    BASE_URL: "https://scan.mocachain.org",
    TX_PATH: "/api/v2/addresses/{address}/transactions",
  },
  CHAIN: {
    NAME: "Moca Chain",
    CHAIN_ID: 2288,
    NATIVE_SYMBOL: "MOCA",
    NATIVE_NAME: "MOCA",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:mocaverse",
    NATIVE_GECKO_ID: "mocaverse",
  },
  LLAMA_ID_MAP: {
    MOCA: "coingecko:mocaverse",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MOCA;
