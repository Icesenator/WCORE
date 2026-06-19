// Auto-generated from src/MERLIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MERLIN: ChainConfig = {
  key: "MERLIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.merlinchain.io",
      "https://merlin.blockpi.network/v1/rpc/public",
      "https://merlin.drpc.org",
      "https://4200.rpc.thirdweb.com/",
    ],
  },
  CHAIN: {
    NAME: "Merlin",
    CHAIN_ID: 4200,
    NATIVE_SYMBOL: "BTC",
    NATIVE_NAME: "Bitcoin",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:bitcoin",
    NATIVE_GECKO_ID: "bitcoin",
    DEX_SLUG: "merlinchain",
    GT_NETWORK: "merlin-chain",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
    MERL: "coingecko:merlin-chain",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MERLIN;
