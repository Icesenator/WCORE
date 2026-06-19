// Auto-generated from src/ABSTRACT.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ABSTRACT: ChainConfig = {
  key: "ABSTRACT",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://api.mainnet.abs.xyz",
      "https://abstract.drpc.org",
      "https://abstract.api.onfinality.io/public",
      "https://2741.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Abstract",
    CHAIN_ID: 2741,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    DEX_SLUG: "abstract",
    GT_NETWORK: "abstract",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ABSTRACT;
