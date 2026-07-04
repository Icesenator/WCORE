// Auto-generated from src/ROBINHOOD_CHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ROBINHOOD_CHAIN: ChainConfig = {
  key: "ROBINHOOD_CHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mainnet.chain.robinhood.com",
    ],
  },
  ACTIVITY_EXPLORER: {
    TYPE: "blockscout",
    BASE_URL: "https://robinhoodchain.blockscout.com",
    TX_PATH: "/api/v2/addresses/{address}/transactions",
  },
  CHAIN: {
    NAME: "Robinhood Chain",
    CHAIN_ID: 4663,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ROBINHOOD_CHAIN;
