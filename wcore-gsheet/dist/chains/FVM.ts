// Auto-generated from src/FVM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FVM: ChainConfig = {
  key: "FVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://314.rpc.thirdweb.com",
      "https://api.node.glif.io/",
      "https://rpc.ankr.com/filecoin",
      "https://filecoin-mainnet.chainstacklabs.com/rpc/v1",
      "https://filfox.info/rpc/v1",
    ],
  },
  CHAIN: {
    NAME: "Filecoin Virtual Machine",
    CHAIN_ID: 314,
    NATIVE_SYMBOL: "FIL",
    NATIVE_NAME: "Filecoin Virtual Machine Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:filecoin",
    NATIVE_GECKO_ID: "filecoin",
    DEX_SLUG: "filecoin",
    GT_NETWORK: "filecoin",
  },
  LLAMA_ID_MAP: {
    FIL: "coingecko:filecoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FVM;
