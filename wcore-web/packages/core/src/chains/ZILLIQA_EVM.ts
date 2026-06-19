// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ZILLIQA_EVM: ChainConfig = {
  key: "ZILLIQA_EVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://32769.rpc.thirdweb.com",
      "https://api.zilliqa.com"
    ],
  },
  CHAIN: {
    NAME: "Zilliqa EVM",
    CHAIN_ID: 32769,
    NATIVE_SYMBOL: "ZIL",
    NATIVE_NAME: "Zilliqa EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:zilliqa",
    NATIVE_GECKO_ID: "zilliqa",
    DEX_SLUG: "zilliqa-evm",
    GT_NETWORK: "zilliqa-evm",
  },
  LLAMA_ID_MAP: {"ZIL":"coingecko:zilliqa"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZILLIQA_EVM;
