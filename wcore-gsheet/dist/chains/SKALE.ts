// Auto-generated from src/SKALE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SKALE: ChainConfig = {
  key: "SKALE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2046399126.rpc.thirdweb.com",
      "https://mainnet.skalenodes.com/v1/elated-tan-skat",
    ],
  },
  CHAIN: {
    NAME: "Skale",
    CHAIN_ID: 2046399126,
    NATIVE_SYMBOL: "sFUEL",
    NATIVE_NAME: "Skale Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "skale",
    GT_NETWORK: "skale",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default SKALE;
