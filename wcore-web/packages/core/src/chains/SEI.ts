// Auto-generated from src/SEI.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SEI: ChainConfig = {
  key: "SEI",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://evm-rpc.sei-apis.com",
      "https://1329.rpc.thirdweb.com",
    ],
    MAX_LOG_RANGE: 2000,
  },
  CHAIN: {
    NAME: "Sei",
    CHAIN_ID: 1329,
    NATIVE_SYMBOL: "SEI",
    NATIVE_NAME: "Sei",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:sei-network",
    NATIVE_GECKO_ID: "sei-network",
    NATIVE_PRICE_CONTRACT: "0xE30fEdD158A2e3b13e9badaeAbaFc5516e95e8C7",
    DEX_SLUG: "seiv2",
    GT_NETWORK: "sei-network",
  },
  LLAMA_ID_MAP: {
    SEI: "coingecko:sei-network",
    WSEI: "coingecko:sei-network",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SEI;
