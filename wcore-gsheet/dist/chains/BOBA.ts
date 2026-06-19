// Auto-generated from src/BOBA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BOBA: ChainConfig = {
  key: "BOBA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.boba.network",
      "https://boba-ethereum.drpc.org",
      "https://1rpc.io/boba/eth",
      "https://gateway.tenderly.co/public/boba-ethereum",
    ],
  },
  CHAIN: {
    NAME: "Boba",
    CHAIN_ID: 288,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "boba",
    GT_NETWORK: "boba",
  },
  LLAMA_ID_MAP: {
    BOBA: "coingecko:boba-network",
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BOBA;
