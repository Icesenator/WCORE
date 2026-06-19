// Auto-generated from src/KAIA.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const KAIA: ChainConfig = {
  key: "KAIA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://public-en.node.kaia.io",
      "https://kaia.blockpi.network/v1/rpc/public",
      "https://klaytn.api.onfinality.io/public",
      "https://klaytn.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Kaia",
    CHAIN_ID: 8217,
    NATIVE_SYMBOL: "KAIA",
    NATIVE_NAME: "Kaia",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:kaia",
    NATIVE_GECKO_ID: "kaia",
    DEX_SLUG: "kaia",
    GT_NETWORK: "kaia",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    KAIA: "coingecko:kaia",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WETH: "coingecko:weth",
    WKAIA: "coingecko:wrapped-klay",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default KAIA;
