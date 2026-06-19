// Auto-generated from src/BSC.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BSC: ChainConfig = {
  key: "BSC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc.drpc.org",
      "https://bsc-dataseed.binance.org",
    ],
    DISABLE_JSON_RPC_BATCH: true,
  },
  CHAIN: {
    NAME: "BNB Chain",
    CHAIN_ID: 56,
    NATIVE_SYMBOL: "BNB",
    NATIVE_NAME: "BNB",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:binancecoin",
    NATIVE_GECKO_ID: "binancecoin",
    DEX_SLUG: "bsc",
    GT_NETWORK: "bsc",
  },
  LLAMA_ID_MAP: {
    BNB: "coingecko:binancecoin",
    DAI: "coingecko:dai",
    HLG: "coingecko:holograph",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBNB: "coingecko:wbnb",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
  LLAMA_CONTRACT_MAP: {
    "0x51e667e91b4b8cb8e6e0528757f248406bd34b57": "bsc:0x51e667e91b4b8cb8e6e0528757f248406bd34b57",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BSC;
