// Auto-generated from src/POLYGON_ZKEVM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const POLYGON_ZKEVM: ChainConfig = {
  key: "POLYGON_ZKEVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://zkevm-rpc.com",
      "https://polygon-zkevm.drpc.org",
      "https://1rpc.io/polygon/zkevm",
    ],
  },
  CHAIN: {
    NAME: "Polygon zkEVM",
    CHAIN_ID: 1101,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "polygon-zkevm",
    GT_NETWORK: "polygon-zkevm",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    MATIC: "coingecko:matic-network",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default POLYGON_ZKEVM;
