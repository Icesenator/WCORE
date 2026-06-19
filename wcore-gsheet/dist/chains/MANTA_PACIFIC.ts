// Auto-generated from src/MANTA_PACIFIC.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const MANTA_PACIFIC: ChainConfig = {
  key: "MANTA_PACIFIC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 64,
  RPC: {
    ENDPOINTS: [
      "https://pacific-rpc.manta.network/http",
      "https://manta-pacific.drpc.org",
      "https://1rpc.io/manta",
      "https://manta.nirvana.build",
      "https://169.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Manta Pacific",
    CHAIN_ID: 169,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "manta",
    GT_NETWORK: "manta-pacific",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default MANTA_PACIFIC;
