// Auto-generated from src/SOLANA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SOLANA: ChainConfig = {
  key: "SOLANA",
  vm: "SVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://solana-rpc.publicnode.com",
      "https://solana.publicnode.com",
      "https://api.mainnet-beta.solana.com",
    ],
    COMMITMENT: "confirmed",
  },
  CHAIN: {
    VM: "SVM",
    NAME: "Solana",
    NATIVE_SYMBOL: "SOL",
    NATIVE_NAME: "Solana",
    NATIVE_DECIMALS: 9,
    NATIVE_LLAMA_ID: "coingecko:solana",
    NATIVE_GECKO_ID: "solana",
    DEX_SLUG: "solana",
    GT_NETWORK: "solana",
  },
  LLAMA_ID_MAP: {
    LAYER: "coingecko:solayer",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SOLANA;
