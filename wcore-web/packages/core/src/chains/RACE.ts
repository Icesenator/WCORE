// Auto-generated from src/RACE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const RACE: ChainConfig = {
  key: "RACE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://racemainnet.io",
      "https://6805.rpc.thirdweb.com",
    ],
  },
  ACTIVITY_EXPLORER: {
    TYPE: "blockscout",
    BASE_URL: "https://racescan.io",
    TX_PATH: "/api/v2/addresses/{address}/transactions",
  },
  CHAIN: {
    NAME: "RACE",
    CHAIN_ID: 6805,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "race",
    GT_NETWORK: "race",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default RACE;
