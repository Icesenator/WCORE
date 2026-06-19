// Auto-generated from src/FUSE.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FUSE: ChainConfig = {
  key: "FUSE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.fuse.io",
      "https://fuse.drpc.org",
      "https://fuse-mainnet.chainstacklabs.com",
    ],
  },
  CHAIN: {
    NAME: "Fuse",
    CHAIN_ID: 122,
    NATIVE_SYMBOL: "FUSE",
    NATIVE_NAME: "Fuse",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:fuse-network-token",
    NATIVE_GECKO_ID: "fuse-network-token",
    DEX_SLUG: "fuse",
    GT_NETWORK: "fuse",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    FUSE: "coingecko:fuse-network-token",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WFUSE: "coingecko:fuse-network-token",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FUSE;
