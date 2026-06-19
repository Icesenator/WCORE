// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const NUMINE: ChainConfig = {
  key: "NUMINE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://subnets.avax.network/numi/mainnet/rpc",
      "https://8021.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Numine",
    CHAIN_ID: 8021,
    NATIVE_SYMBOL: "NUMINE",
    NATIVE_NAME: "Numine Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "numine",
    GT_NETWORK: "numine",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default NUMINE;
