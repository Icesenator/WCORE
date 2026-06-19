// Auto-generated from src/OPTIMISM.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const OPTIMISM: ChainConfig = {
  key: "OPTIMISM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.optimism.io",
      "https://1rpc.io/op",
      "https://optimism.drpc.org",
    ],
    MAX_BATCH_SIZE: 10,
  },
  CHAIN: {
    NAME: "Optimism",
    CHAIN_ID: 10,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "optimism",
    GT_NETWORK: "optimism",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    LINK: "coingecko:chainlink",
    OP: "coingecko:optimism",
    SNX: "coingecko:havven",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:bridged-usd-coin-optimism",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default OPTIMISM;
