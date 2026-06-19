// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const HARMONY: ChainConfig = {
  key: "HARMONY",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1666600000.rpc.thirdweb.com",
      "https://api.harmony.one",
      "https://a.api.s0.t.hmny.io",
      "https://api.s0.t.hmny.io",
      "https://rpc.ankr.com/harmony"
    ],
  },
  CHAIN: {
    NAME: "Harmony",
    CHAIN_ID: 1666600000,
    NATIVE_SYMBOL: "ONE",
    NATIVE_NAME: "Harmony Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:harmony",
    NATIVE_GECKO_ID: "harmony",
    DEX_SLUG: "harmony",
    GT_NETWORK: "harmony",
  },
  LLAMA_ID_MAP: {"ONE":"coingecko:harmony"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default HARMONY;
