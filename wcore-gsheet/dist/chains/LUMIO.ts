// Auto-generated from src/LUMIO.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const LUMIO: ChainConfig = {
  key: "LUMIO",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8866.rpc.thirdweb.com",
      "https://mainnet.lumio.io/",
    ],
  },
  CHAIN: {
    NAME: "Lumio",
    CHAIN_ID: 8866,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Lumio Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "lumio",
    GT_NETWORK: "lumio",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default LUMIO;
