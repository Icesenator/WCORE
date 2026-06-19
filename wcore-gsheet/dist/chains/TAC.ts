// Auto-generated from src/TAC.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TAC: ChainConfig = {
  key: "TAC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.tac.build",
    ],
  },
  CHAIN: {
    NAME: "TAC",
    CHAIN_ID: 239,
    NATIVE_SYMBOL: "TAC",
    NATIVE_NAME: "TAC",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:tac",
    NATIVE_GECKO_ID: "tac",
    DEX_SLUG: "tac",
    GT_NETWORK: "tac",
  },
  LLAMA_ID_MAP: {
    TAC: "coingecko:tac",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TAC;
