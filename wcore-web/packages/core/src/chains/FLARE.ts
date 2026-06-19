// Auto-generated from src/FLARE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FLARE: ChainConfig = {
  key: "FLARE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://flare-api.flare.network/ext/C/rpc",
      "https://rpc.ankr.com/flare",
      "https://flare.rpc.thirdweb.com",
      "https://rpc.au.cc/flare",
    ],
  },
  CHAIN: {
    NAME: "Flare",
    CHAIN_ID: 14,
    NATIVE_SYMBOL: "FLR",
    NATIVE_NAME: "Flare",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:flare-networks",
    NATIVE_GECKO_ID: "flare-networks",
    NATIVE_PRICE_CONTRACT: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
    DEX_SLUG: "flare",
    GT_NETWORK: "flare",
  },
  LLAMA_ID_MAP: {
    FLR: "coingecko:flare-networks",
    WFLR: "coingecko:flare-networks",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FLARE;
