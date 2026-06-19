// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const CREDITCOIN: ChainConfig = {
  key: "CREDITCOIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://102030.rpc.thirdweb.com",
      "https://mainnet3.creditcoin.network"
    ],
  },
  CHAIN: {
    NAME: "Creditcoin",
    CHAIN_ID: 102030,
    NATIVE_SYMBOL: "CTC",
    NATIVE_NAME: "Creditcoin Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:creditcoin",
    NATIVE_GECKO_ID: "creditcoin",
    DEX_SLUG: "creditcoin",
    GT_NETWORK: "creditcoin",
  },
  LLAMA_ID_MAP: {"CTC":"coingecko:creditcoin"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default CREDITCOIN;
