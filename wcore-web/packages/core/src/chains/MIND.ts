// Auto-generated from src/MIND.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MIND: ChainConfig = {
  key: "MIND",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc-mainnet.mindnetwork.xyz",
      "https://228.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Mind Network",
    CHAIN_ID: 228,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "mind",
    GT_NETWORK: "mind",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    FHE: "coingecko:mind-network",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MIND;
