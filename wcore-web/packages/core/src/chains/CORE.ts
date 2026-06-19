// Auto-generated from src/CORE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CORE: ChainConfig = {
  key: "CORE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://rpc.coredao.org",
      "https://rpc.ankr.com/core",
      "https://1rpc.io/core",
      "https://core.drpc.org",
      "https://rpcar.coredao.org",
    ],
  },
  CHAIN: {
    NAME: "Core",
    CHAIN_ID: 1116,
    NATIVE_SYMBOL: "CORE",
    NATIVE_NAME: "Core",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:coredaoorg",
    NATIVE_GECKO_ID: "coredaoorg",
    DEX_SLUG: "core",
    GT_NETWORK: "core",
  },
  LLAMA_ID_MAP: {},
} as Omit<ChainConfig, "key" | "vm">),
};

export default CORE;
