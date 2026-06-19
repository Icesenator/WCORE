// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ETHO_PROTOCOL: ChainConfig = {
  key: "ETHO_PROTOCOL",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: ["https://1577.rpc.thirdweb.com"],
  },
  CHAIN: {
    NAME: "Etho Protocol",
    CHAIN_ID: 1577,
    NATIVE_SYMBOL: "ETHO",
    NATIVE_NAME: "Etho Protocol Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:etho-protocol",
    NATIVE_GECKO_ID: "etho-protocol",
    DEX_SLUG: "etho-protocol",
    GT_NETWORK: "etho-protocol",
  },
  LLAMA_ID_MAP: {"ETHO":"coingecko:etho-protocol"},
  FLAGS: {
    DISABLE_CHAIN: true,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ETHO_PROTOCOL;
