// Auto-generated from src/MOCA_CHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MOCA_CHAIN: ChainConfig = {
  key: "MOCA_CHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://moca-mainnet.drpc.org",
      "https://2288.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Moca Chain",
    CHAIN_ID: 2288,
    NATIVE_SYMBOL: "MOCA",
    NATIVE_NAME: "Moca Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moca-network",
    NATIVE_GECKO_ID: "moca-network",
    DEX_SLUG: "moca-chain",
    GT_NETWORK: "moca-chain",
  },
  LLAMA_ID_MAP: {
    MOCA: "coingecko:moca-network",
  },
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MOCA_CHAIN;
