// Auto-generated from src/SUPERPOSITION.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SUPERPOSITION: ChainConfig = {
  key: "SUPERPOSITION",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.superposition.so",
      "https://55244.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Superposition",
    CHAIN_ID: 55244,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "superposition",
    GT_NETWORK: "superposition",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SUPERPOSITION;
