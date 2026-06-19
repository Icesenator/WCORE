// Auto-generated from src/DEGEN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const DEGEN: ChainConfig = {
  key: "DEGEN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.degen.tips",
      "https://degen.drpc.org",
      "https://666666666.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Degen",
    CHAIN_ID: 666666666,
    NATIVE_SYMBOL: "DEGEN",
    NATIVE_NAME: "Degen",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:degen-base",
    NATIVE_GECKO_ID: "degen-base",
    DEX_SLUG: "degenchain",
    GT_NETWORK: "degenchain",
  },
  LLAMA_ID_MAP: {
    DEGEN: "coingecko:degen-base",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WBTC: "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default DEGEN;
