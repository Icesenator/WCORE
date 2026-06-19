// Auto-generated from src/SCROLL.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const SCROLL: ChainConfig = {
  key: "SCROLL",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.scroll.io",
      "https://scroll.drpc.org",
      "https://1rpc.io/scroll",
      "https://scroll-mainnet.public.blastapi.io",
    ],
  },
  CHAIN: {
    NAME: "Scroll",
    CHAIN_ID: 534352,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "scroll",
    GT_NETWORK: "scroll",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    SCR: "coingecko:scroll",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    wstETH: "coingecko:wrapped-steth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default SCROLL;
