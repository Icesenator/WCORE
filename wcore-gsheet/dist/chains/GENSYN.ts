// Auto-generated from src/GENSYN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const GENSYN: ChainConfig = {
  key: "GENSYN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://685689.rpc.thirdweb.com",
      "https://gensyn-mainnet.g.alchemy.com/public",
    ],
  },
  CHAIN: {
    NAME: "Gensyn",
    CHAIN_ID: 685689,
    NATIVE_SYMBOL: "SYN",
    NATIVE_NAME: "Gensyn Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "gensyn",
    GT_NETWORK: "gensyn",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default GENSYN;
