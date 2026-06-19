// Auto-generated from src/MOONBEAM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MOONBEAM: ChainConfig = {
  key: "MOONBEAM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.api.moonbeam.network",
      "https://moonbeam.drpc.org",
      "https://1rpc.io/glmr",
      "https://moonbeam.public.blastapi.io",
    ],
  },
  CHAIN: {
    NAME: "Moonbeam",
    CHAIN_ID: 1284,
    NATIVE_SYMBOL: "GLMR",
    NATIVE_NAME: "Glimmer",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moonbeam",
    NATIVE_GECKO_ID: "moonbeam",
    DEX_SLUG: "moonbeam",
    GT_NETWORK: "glmr",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    GLMR: "coingecko:moonbeam",
    USDC: "coingecko:usd-coin",
    "USDC.wh": "coingecko:usd-coin-wormhole-from-ethereum",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WELL: "coingecko:moonwell",
    WETH: "coingecko:weth",
    WGLMR: "coingecko:wrapped-moonbeam",
    xcDOT: "coingecko:polkadot",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MOONBEAM;
