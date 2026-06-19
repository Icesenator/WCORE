// Auto-generated from src/PULSECHAIN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const PULSECHAIN: ChainConfig = {
  key: "PULSECHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.pulsechain.com",
      "https://pulsechain-rpc.publicnode.com",
      "https://rpc-pulsechain.g4mm4.io",
    ],
  },
  CHAIN: {
    NAME: "PulseChain",
    CHAIN_ID: 369,
    NATIVE_SYMBOL: "PLS",
    NATIVE_NAME: "Pulse",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:pulsechain",
    NATIVE_GECKO_ID: "pulsechain",
    DEX_SLUG: "pulsechain",
    GT_NETWORK: "pulsechain",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai-pulsechain",
    HEX: "coingecko:hex-pulsechain",
    PLS: "coingecko:pulsechain",
    PLSX: "coingecko:pulsex",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WPLS: "coingecko:wrapped-pulse",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default PULSECHAIN;
