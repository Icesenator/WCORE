// Auto-generated from src/STABLE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const STABLE: ChainConfig = {
  key: "STABLE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.stable.xyz"
    ],
  },
  CHAIN: {
    NAME: "Stable",
    CHAIN_ID: 988,
    NATIVE_SYMBOL: "gUSDT",
    NATIVE_NAME: "gUSDT",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:tether",
    NATIVE_GECKO_ID: "tether",
    DEX_SLUG: "stable",
    GT_NETWORK: "stable",
  },
  LLAMA_ID_MAP: {
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    gUSDT: "coingecko:tether",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STABLE;
