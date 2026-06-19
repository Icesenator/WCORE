// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const INEVM: ChainConfig = {
  key: "INEVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2525.rpc.thirdweb.com",
      "https://mainnet.rpc.inevm.com/http"
    ],
  },
  CHAIN: {
    NAME: "inEVM",
    CHAIN_ID: 2525,
    NATIVE_SYMBOL: "INJ",
    NATIVE_NAME: "inEVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:injective-protocol",
    NATIVE_GECKO_ID: "injective-protocol",
    DEX_SLUG: "inevm",
    GT_NETWORK: "inevm",
  },
  LLAMA_ID_MAP: {"INJ":"coingecko:injective-protocol"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default INEVM;
