// Auto-generated from src/MATCHAIN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MATCHAIN: ChainConfig = {
  key: "MATCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.matchain.io",
      "https://rpc.ankr.com/matchain_mainnet",
      "https://698.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Matchain",
    CHAIN_ID: 698,
    NATIVE_SYMBOL: "BNB",
    NATIVE_NAME: "BNB",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:binancecoin",
    NATIVE_GECKO_ID: "binancecoin",
    DEX_SLUG: "matchain",
    GT_NETWORK: "matchain",
  },
  LLAMA_ID_MAP: {
    BNB: "coingecko:binancecoin",
    DAI: "coingecko:dai",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBNB: "coingecko:wbnb",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MATCHAIN;
