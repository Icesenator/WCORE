// Auto-generated from src/BLAST.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BLAST: ChainConfig = {
  key: "BLAST",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.blast.io",
      "https://blast.din.dev/rpc",
      "https://blastl2-mainnet.public.blastapi.io",
    ],
  },
  CHAIN: {
    NAME: "Blast",
    CHAIN_ID: 81457,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "blast",
    GT_NETWORK: "blast",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BLAST;
