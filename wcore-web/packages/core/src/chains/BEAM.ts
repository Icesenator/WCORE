// Auto-generated from src/BEAM.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const BEAM: ChainConfig = {
  key: "BEAM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://build.onbeam.com/rpc",
      "https://subnets.avax.network/beam/mainnet/rpc",
      "https://4337.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "Beam",
    CHAIN_ID: 4337,
    NATIVE_SYMBOL: "BEAM",
    NATIVE_NAME: "Beam",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:beam-2",
    NATIVE_GECKO_ID: "beam-2",
    DEX_SLUG: "beam",
    GT_NETWORK: "beam",
  },
  LLAMA_ID_MAP: {
    BEAM: "coingecko:beam-2",
    DAI: "coingecko:dai",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBEAM: "coingecko:beam-2",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default BEAM;
