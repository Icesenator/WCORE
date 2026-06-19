// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const NEON: ChainConfig = {
  key: "NEON",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://245022934.rpc.thirdweb.com",
      "https://neon-proxy-mainnet.solana.p2p.org",
      "https://neon-evm.drpc.org"
    ],
  },
  CHAIN: {
    NAME: "Neon",
    CHAIN_ID: 245022934,
    NATIVE_SYMBOL: "NEON",
    NATIVE_NAME: "Neon Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:neon",
    NATIVE_GECKO_ID: "neon",
    DEX_SLUG: "neon",
    GT_NETWORK: "neon",
  },
  LLAMA_ID_MAP: {"NEON":"coingecko:neon"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default NEON;
