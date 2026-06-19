// Auto-generated from src/CELO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CELO: ChainConfig = {
  key: "CELO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://forno.celo.org",
      "https://celo.drpc.org",
      "https://1rpc.io/celo",
      "https://celo-mainnet.public.blastapi.io",
    ],
  },
  CHAIN: {
    NAME: "Celo",
    CHAIN_ID: 42220,
    NATIVE_SYMBOL: "CELO",
    NATIVE_NAME: "Celo",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:celo",
    NATIVE_GECKO_ID: "celo",
    DEX_SLUG: "celo",
    GT_NETWORK: "celo",
  },
  LLAMA_ID_MAP: {
    CELO: "coingecko:celo",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    cEUR: "coingecko:celo-euro",
    cREAL: "coingecko:celo-brazilian-real",
    cUSD: "coingecko:celo-dollar",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CELO;
