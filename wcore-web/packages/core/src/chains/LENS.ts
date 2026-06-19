// Auto-generated from src/LENS.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LENS: ChainConfig = {
  key: "LENS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.lens.xyz",
      "https://lens.drpc.org",
      "https://232.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Lens",
    CHAIN_ID: 232,
    NATIVE_SYMBOL: "GHO",
    NATIVE_NAME: "GHO",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:gho",
    NATIVE_GECKO_ID: "gho",
    DEX_SLUG: "lens",
    GT_NETWORK: "lens",
  },
  LLAMA_ID_MAP: {
    GHO: "coingecko:gho",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WBTC: "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LENS;
