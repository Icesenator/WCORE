// Auto-generated from src/FRAXTAL.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FRAXTAL: ChainConfig = {
  key: "FRAXTAL",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.frax.com",
      "https://fraxtal.drpc.org",
      "https://fraxtal.gateway.tenderly.co",
    ],
  },
  CHAIN: {
    NAME: "Fraxtal",
    CHAIN_ID: 252,
    NATIVE_SYMBOL: "FRAX",
    NATIVE_NAME: "Frax",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:frax-share",
    NATIVE_GECKO_ID: "frax-share",
    DEX_SLUG: "fraxtal",
    GT_NETWORK: "fraxtal",
  },
  LLAMA_ID_MAP: {
    FRAX: "coingecko:frax-share",
    FXS: "coingecko:frax-share",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
    frxETH: "coingecko:frax-ether",
    sfrxETH: "coingecko:staked-frax-ether",
    frxUSD: "coingecko:frax-usd",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FRAXTAL;
