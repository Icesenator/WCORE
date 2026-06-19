// Auto-generated from src/MONAD.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MONAD: ChainConfig = {
  key: "MONAD",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.monad.xyz",
      "https://rpc1.monad.xyz",
      "https://rpc3.monad.xyz",
      "https://rpc-mainnet.monadinfra.com",
    ],
  },
  CHAIN: {
    NAME: "Monad",
    CHAIN_ID: 143,
    NATIVE_SYMBOL: "MON",
    NATIVE_NAME: "Monad",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:monad",
    NATIVE_GECKO_ID: "monad",
    DEX_SLUG: "monad",
    GT_NETWORK: "monad",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    MON: "coingecko:monad",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WMON: "coingecko:monad",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MONAD;
