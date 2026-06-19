// Auto-generated from src/IMMUTABLE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const IMMUTABLE: ChainConfig = {
  key: "IMMUTABLE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.immutable.com",
      "https://immutable-zkevm.drpc.org",
      "https://immutable.gateway.tenderly.co",
    ],
  },
  CHAIN: {
    NAME: "Immutable zkEVM",
    CHAIN_ID: 13371,
    NATIVE_SYMBOL: "IMX",
    NATIVE_NAME: "Immutable X",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:immutable-x",
    NATIVE_GECKO_ID: "immutable-x",
    DEX_SLUG: "immutable",
    GT_NETWORK: "immutable-zkevm",
  },
  LLAMA_ID_MAP: {
    IMX: "coingecko:immutable-x",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default IMMUTABLE;
