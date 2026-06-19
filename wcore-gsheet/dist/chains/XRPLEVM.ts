// Auto-generated from src/XRPLEVM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const XRPLEVM: ChainConfig = {
  key: "XRPLEVM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://rpc.xrplevm.org",
      "https://xrpl.drpc.org",
      "https://evmrpc.xrp.nodestake.org",
    ],
  },
  CHAIN: {
    NAME: "XRPL EVM",
    CHAIN_ID: 1440000,
    NATIVE_SYMBOL: "XRP",
    NATIVE_NAME: "XRP",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ripple",
    NATIVE_GECKO_ID: "ripple",
    DEX_SLUG: "xrpl-evm",
    GT_NETWORK: "xrpl-evm",
  },
  LLAMA_ID_MAP: {
    XRP: "coingecko:ripple",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default XRPLEVM;
