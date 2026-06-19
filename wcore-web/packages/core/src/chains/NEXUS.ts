import type { ChainConfig } from "../types.js";

export const NEXUS: ChainConfig = {
  key: "NEXUS",
  vm: "EVM",
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.rpc.nexus.xyz/",
    ],
  },
  CHAIN: {
    NAME: "Nexus Mainnet",
    CHAIN_ID: 3946,
    NATIVE_SYMBOL: "NEX",
    NATIVE_NAME: "NEX",
    NATIVE_DECIMALS: 18,
    DEX_SLUG: "nexus",
    GT_NETWORK: "nexus",
  },
};

export default NEXUS;
