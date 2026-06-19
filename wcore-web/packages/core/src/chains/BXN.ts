// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const BXN: ChainConfig = {
  key: "BXN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://488.rpc.thirdweb.com",
      "https://rpc.blackfort.network/mainnet/rpc"
    ],
  },
  CHAIN: {
    NAME: "BXN",
    CHAIN_ID: 488,
    NATIVE_SYMBOL: "BXN",
    NATIVE_NAME: "BXN Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "bxn",
    GT_NETWORK: "bxn",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default BXN;
