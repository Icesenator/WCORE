// Auto-generated from src/FLOW.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const FLOW: ChainConfig = {
  key: "FLOW",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.evm.nodes.onflow.org",
      "https://flow-mainnet.gateway.tatum.io",
    ],
  },
  CHAIN: {
    NAME: "Flow EVM",
    CHAIN_ID: 747,
    NATIVE_SYMBOL: "FLOW",
    NATIVE_NAME: "Flow",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:flow",
    NATIVE_GECKO_ID: "flow",
    DEX_SLUG: "flow",
    GT_NETWORK: "flow-evm",
  },
  LLAMA_ID_MAP: {
    FLOW: "coingecko:flow",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default FLOW;
