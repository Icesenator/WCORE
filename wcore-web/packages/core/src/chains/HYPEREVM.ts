// Auto-generated from src/HYPEREVM.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const HYPEREVM: ChainConfig = {
  key: "HYPEREVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.hyperliquid.xyz/evm",
      "https://1rpc.io/hyperliquid",
      "https://hyperliquid.drpc.org",
      "https://rpc.hypurrscan.io",
    ],
    MAX_LOG_RANGE: 1000,
  },
  CHAIN: {
    NAME: "HyperEVM",
    CHAIN_ID: 999,
    NATIVE_SYMBOL: "HYPE",
    NATIVE_NAME: "Hyperliquid",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:hyperliquid",
    NATIVE_GECKO_ID: "hyperliquid",
    DEX_SLUG: "hyperevm",
    GT_NETWORK: "hyperliquid",
  },
  LLAMA_ID_MAP: {
    HYPE: "coingecko:hyperliquid",
    WHYPE: "coingecko:hyperliquid",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WBTC: "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default HYPEREVM;
