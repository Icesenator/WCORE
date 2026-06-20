// Auto-generated from src/STEP_NETWORK.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const STEP_NETWORK: ChainConfig = {
  key: "STEP_NETWORK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1234.rpc.thirdweb.com",
      "https://rpc.step.network",
    ],
  },
  CHAIN: {
    NAME: "Step Network",
    CHAIN_ID: 1234,
    NATIVE_SYMBOL: "FITFI",
    NATIVE_NAME: "Step Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:step-app-fit-to-earn",
    NATIVE_GECKO_ID: "step-app-fit-to-earn",
    DEX_SLUG: "step-network",
    GT_NETWORK: "step-network",
  },
  LLAMA_ID_MAP: {
    FITFI: "coingecko:step-app-fit-to-earn",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default STEP_NETWORK;
