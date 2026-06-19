// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const IOTA_EVM: ChainConfig = {
  key: "IOTA_EVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8822.rpc.thirdweb.com",
      "https://json-rpc.evm.iotaledger.net"
    ],
  },
  CHAIN: {
    NAME: "IOTA EVM",
    CHAIN_ID: 8822,
    NATIVE_SYMBOL: "IOTA",
    NATIVE_NAME: "IOTA EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:iota",
    NATIVE_GECKO_ID: "iota",
    DEX_SLUG: "iota-evm",
    GT_NETWORK: "iota-evm",
  },
  LLAMA_ID_MAP: {"IOTA":"coingecko:iota"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default IOTA_EVM;
