// Auto-generated from src/PLASMA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const PLASMA: ChainConfig = {
  key: "PLASMA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.plasma.to",
      "https://plasma.drpc.org",
      "https://9745.rpc.thirdweb.com",
      "https://plasma.gateway.tenderly.co",
      "https://plasma-mainnet.gateway.tatum.io",
    ],
  },
  CHAIN: {
    NAME: "Plasma",
    CHAIN_ID: 9745,
    NATIVE_SYMBOL: "XPL",
    NATIVE_NAME: "Plasma",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:plasma",
    NATIVE_GECKO_ID: "plasma",
    DEX_SLUG: "plasma",
    GT_NETWORK: "plasma",
  },
  LLAMA_ID_MAP: {
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WXPL: "coingecko:plasma",
    XPL: "coingecko:plasma",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default PLASMA;
