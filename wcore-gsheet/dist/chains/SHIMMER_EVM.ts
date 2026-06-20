// Auto-generated from src/SHIMMER_EVM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SHIMMER_EVM: ChainConfig = {
  key: "SHIMMER_EVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://148.rpc.thirdweb.com",
      "https://json-rpc.evm.shimmer.network",
    ],
  },
  CHAIN: {
    NAME: "Shimmer EVM",
    CHAIN_ID: 148,
    NATIVE_SYMBOL: "SMR",
    NATIVE_NAME: "Shimmer EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:shimmer",
    NATIVE_GECKO_ID: "shimmer",
    DEX_SLUG: "shimmer-evm",
    GT_NETWORK: "shimmer-evm",
  },
  LLAMA_ID_MAP: {
    SMR: "coingecko:shimmer",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SHIMMER_EVM;
