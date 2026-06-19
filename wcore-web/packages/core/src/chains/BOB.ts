// Auto-generated from src/BOB.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BOB: ChainConfig = {
  key: "BOB",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.gobob.xyz/",
      "https://bob.drpc.org",
      "https://bob-mainnet.public.blastapi.io",
    ],
  },
  CHAIN: {
    NAME: "BOB",
    CHAIN_ID: 60808,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "bob",
    GT_NETWORK: "bob-network",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BOB;
