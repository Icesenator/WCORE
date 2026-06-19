// Auto-generated from src/FOGO.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FOGO: ChainConfig = {
  key: "FOGO",
  vm: "SVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.fogo.io/",
    ],
    COMMITMENT: "confirmed",
  },
  CHAIN: {
    VM: "SVM",
    NAME: "Fogo",
    NATIVE_SYMBOL: "FOGO",
    NATIVE_NAME: "Fogo",
    NATIVE_DECIMALS: 9,
    NATIVE_LLAMA_ID: "coingecko:fogo",
    NATIVE_GECKO_ID: "fogo",
    DEX_SLUG: "fogo",
    GT_NETWORK: "fogo",
  },
  KNOWN_TOKENS: {
    uSd2czE61Evaf76RNbq4KPpXnkiL3irdzgLFUMe3NoG: {
      symbol: "USDC",
      name: "USD Coin (Wormhole)",
      decimals: 6,
      isStable: true,
      peg: "USD",
    },
    GPK71dya1H975s3U4gYaJjrRCp3BGyAD8fmZCtSmBCcz: {
      symbol: "CHASE",
      name: "Chase Dog",
      decimals: 9,
      isStable: false,
    },
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FOGO;
