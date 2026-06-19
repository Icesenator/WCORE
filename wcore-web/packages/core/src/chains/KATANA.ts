// Auto-generated from src/KATANA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const KATANA: ChainConfig = {
  key: "KATANA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.katana.network/",
      "https://katana.drpc.org/",
      "https://katana.gateway.tenderly.co",
      "https://747474.rpc.thirdweb.com/",
    ],
  },
  CHAIN: {
    NAME: "Katana",
    CHAIN_ID: 747474,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "katana",
    GT_NETWORK: "katana",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    UBTC: "coingecko:wrapped-bitcoin",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
  LLAMA_CONTRACT_MAP: {
    "0xf1143f3a8d76f1ca740d29d5671d365f66c44ed1": "coingecko:wrapped-bitcoin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default KATANA;
