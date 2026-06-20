// Auto-generated from src/PROOF_OF_PLAY_APEX.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const PROOF_OF_PLAY_APEX: ChainConfig = {
  key: "PROOF_OF_PLAY_APEX",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://70700.rpc.thirdweb.com",
      "https://rpc.apex.proofofplay.com",
    ],
  },
  CHAIN: {
    NAME: "Proof of Play Apex",
    CHAIN_ID: 70700,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Proof of Play Apex Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "proof-of-play-apex",
    GT_NETWORK: "proof-of-play-apex",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default PROOF_OF_PLAY_APEX;
