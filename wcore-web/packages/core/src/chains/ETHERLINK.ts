// Auto-generated from src/ETHERLINK.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ETHERLINK: ChainConfig = {
  key: "ETHERLINK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://node.mainnet.etherlink.com",
      "https://rpc.ankr.com/etherlink_mainnet",
    ],
  },
  CHAIN: {
    NAME: "Etherlink",
    CHAIN_ID: 42793,
    NATIVE_SYMBOL: "XTZ",
    NATIVE_NAME: "Tezos",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:tezos",
    NATIVE_GECKO_ID: "tezos",
    DEX_SLUG: "etherlink",
    GT_NETWORK: "etherlink",
  },
  LLAMA_ID_MAP: {
    XTZ: "coingecko:tezos",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ETHERLINK;
