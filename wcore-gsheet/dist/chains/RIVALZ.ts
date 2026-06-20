// Auto-generated from src/RIVALZ.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const RIVALZ: ChainConfig = {
  key: "RIVALZ",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7534.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Rivalz",
    CHAIN_ID: 7534,
    NATIVE_SYMBOL: "RI",
    NATIVE_NAME: "Rivalz Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rivalz",
    NATIVE_GECKO_ID: "rivalz",
    DEX_SLUG: "rivalz",
    GT_NETWORK: "rivalz",
  },
  LLAMA_ID_MAP: {
    RI: "coingecko:rivalz",
  },
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default RIVALZ;
