// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const CYSIC: ChainConfig = {
  key: "CYSIC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://rpc-evm.cysic.xyz",
      "https://4399.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Cysic",
    CHAIN_ID: 4399,
    NATIVE_SYMBOL: "CYS",
    NATIVE_NAME: "Cysic Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:cysic",
    NATIVE_GECKO_ID: "cysic",
    DEX_SLUG: "cysic",
    GT_NETWORK: "cysic",
  },
  LLAMA_ID_MAP: {"CYS":"coingecko:cysic"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default CYSIC;
