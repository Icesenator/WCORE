// Auto-generated from src/TARAXA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const TARAXA: ChainConfig = {
  key: "TARAXA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://841.rpc.thirdweb.com",
      "https://rpc.mainnet.taraxa.io/",
      "https://ws.mainnet.taraxa.io",
    ],
  },
  CHAIN: {
    NAME: "Taraxa",
    CHAIN_ID: 841,
    NATIVE_SYMBOL: "TARA",
    NATIVE_NAME: "Taraxa Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:taraxa",
    NATIVE_GECKO_ID: "taraxa",
    DEX_SLUG: "taraxa",
    GT_NETWORK: "taraxa",
  },
  LLAMA_ID_MAP: {
    TARA: "coingecko:taraxa",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default TARAXA;
