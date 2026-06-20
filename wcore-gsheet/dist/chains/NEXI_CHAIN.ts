// Auto-generated from src/NEXI_CHAIN.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const NEXI_CHAIN: ChainConfig = {
  key: "NEXI_CHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://4242.rpc.thirdweb.com",
      "https://rpc.chain.nexi.technology/",
      "https://chain.nexilix.com",
      "https://chain.nexi.evmnode.online",
    ],
  },
  CHAIN: {
    NAME: "Nexi Chain",
    CHAIN_ID: 4242,
    NATIVE_SYMBOL: "NEXI",
    NATIVE_NAME: "Nexi Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:nexi",
    NATIVE_GECKO_ID: "nexi",
    DEX_SLUG: "nexi-chain",
    GT_NETWORK: "nexi-chain",
  },
  LLAMA_ID_MAP: {
    NEXI: "coingecko:nexi",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default NEXI_CHAIN;
