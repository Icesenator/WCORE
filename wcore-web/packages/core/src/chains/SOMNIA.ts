// Auto-generated from src/SOMNIA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SOMNIA: ChainConfig = {
  key: "SOMNIA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://somnia-rpc.publicnode.com",
      "https://somnia.publicnode.com",
      "https://api.infra.mainnet.somnia.network",
      "https://5031.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Somnia",
    CHAIN_ID: 5031,
    NATIVE_SYMBOL: "SOMI",
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
