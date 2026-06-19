// Auto-generated from src/SOMNIA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SOMNIA: ChainConfig = {
  key: "SOMNIA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://somnia-rpc.publicnode.com",
      "https://somnia.publicnode.com",
      "https://api.infra.mainnet.somnia.network",
      "https://somnia-json-rpc.stakely.io",
      "https://5031.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Somnia",
    CHAIN_ID: 50311,
    NATIVE_SYMBOL: "STT",
    NATIVE_NAME: "Somnia Token",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:somnia",
    NATIVE_GECKO_ID: "somnia",
    DEX_SLUG: "somnia",
    GT_NETWORK: "somnia",
  },
  LLAMA_ID_MAP: {
    STT: "coingecko:somnia",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SOMNIA;
