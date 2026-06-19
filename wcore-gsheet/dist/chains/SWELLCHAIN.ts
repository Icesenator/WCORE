// Auto-generated from src/SWELLCHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SWELLCHAIN: ChainConfig = {
  key: "SWELLCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://swell.drpc.org",
      "https://rpc.ankr.com/swell",
      "https://swell-mainnet.alt.technology",
      "https://swell.hypersync.xyz",
      "https://swellchain.gateway.tenderly.co",
    ],
  },
  CHAIN: {
    NAME: "Swell Chain",
    CHAIN_ID: 1923,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "swellchain",
    GT_NETWORK: "swellchain",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    SWELL: "coingecko:swell-network",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
    rswETH: "coingecko:restaked-swell-eth",
    swETH: "coingecko:sweth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SWELLCHAIN;
