// Auto-generated from src/REDSTONE.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const REDSTONE: ChainConfig = {
  key: "REDSTONE",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.redstonechain.com",
      "https://690.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Redstone",
    CHAIN_ID: 690,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "redstone",
    GT_NETWORK: "redstone",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default REDSTONE;
