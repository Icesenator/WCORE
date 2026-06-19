// Auto-generated from src/GNOSIS.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const GNOSIS: ChainConfig = {
  key: "GNOSIS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 65,
  RPC: {
    ENDPOINTS: [
      "https://rpc.gnosischain.com",
      "https://gnosis.publicnode.com",
      "https://gnosis.drpc.org",
    ],
  },
  CHAIN: {
    NAME: "Gnosis",
    CHAIN_ID: 100,
    NATIVE_SYMBOL: "xDAI",
    NATIVE_NAME: "xDAI",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:xdai",
    NATIVE_GECKO_ID: "xdai",
    DEX_SLUG: "gnosis",
    GT_NETWORK: "xdai",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    WXDAI: "coingecko:wrapped-xdai",
    XDAI: "coingecko:xdai",
    xDAI: "coingecko:xdai",
    REG: "coingecko:realtoken-ecosystem-governance",
  },
  LLAMA_CONTRACT_MAP: {
    "0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce": "coingecko:realtoken-ecosystem-governance",
  },
  PRICE_IGNORE_CONTRACTS: [
    "0x9908801df7902675c3fedd6fea0294d18d5d5d34",
    "0xf3220cd8f66aeb86fc2a82502977eab4bfd2f647",
  ],
} as Omit<ChainConfig, "key" | "vm">),
};

export default GNOSIS;
