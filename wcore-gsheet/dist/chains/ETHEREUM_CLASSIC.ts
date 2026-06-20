// Auto-generated from src/ETHEREUM_CLASSIC.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ETHEREUM_CLASSIC: ChainConfig = {
  key: "ETHEREUM_CLASSIC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://61.rpc.thirdweb.com",
      "https://etc.rivet.link",
      "https://besu-at.etc-network.info",
      "https://geth-at.etc-network.info",
      "https://etc.etcdesktop.com",
    ],
  },
  CHAIN: {
    NAME: "Ethereum Classic",
    CHAIN_ID: 61,
    NATIVE_SYMBOL: "ETC",
    NATIVE_NAME: "Ethereum Classic Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum-classic",
    NATIVE_GECKO_ID: "ethereum-classic",
    DEX_SLUG: "ethereum-classic",
    GT_NETWORK: "ethereum-classic",
  },
  LLAMA_ID_MAP: {
    ETC: "coingecko:ethereum-classic",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ETHEREUM_CLASSIC;
