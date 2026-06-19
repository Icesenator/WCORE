// Auto-generated from src/KCC.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const KCC: ChainConfig = {
  key: "KCC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc-mainnet.kcc.network",
      "https://kcc.drpc.org",
      "https://kcc-rpc.com",
    ],
  },
  CHAIN: {
    NAME: "KCC",
    CHAIN_ID: 321,
    NATIVE_SYMBOL: "KCS",
    NATIVE_NAME: "KuCoin Token",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:kucoin-shares",
    NATIVE_GECKO_ID: "kucoin-shares",
    DEX_SLUG: "kcc",
    GT_NETWORK: "kcc",
  },
  LLAMA_ID_MAP: {
    KCS: "coingecko:kucoin-shares",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default KCC;
