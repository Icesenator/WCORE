// Auto-generated from src/ZETACHAIN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ZETACHAIN: ChainConfig = {
  key: "ZETACHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://zetachain-evm.blockpi.network/v1/rpc/public",
      "https://zeta-chain.drpc.org",
    ],
    TIMEOUT_MS: 15000,
  },
  CHAIN: {
    NAME: "ZetaChain",
    CHAIN_ID: 7000,
    NATIVE_SYMBOL: "ZETA",
    NATIVE_NAME: "Zeta",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:zetachain",
    NATIVE_GECKO_ID: "zetachain",
    DEX_SLUG: "zetachain",
    GT_NETWORK: "zetachain",
  },
  LLAMA_ID_MAP: {
    BTC: "coingecko:bitcoin",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WZETA: "coingecko:zetachain",
    ZETA: "coingecko:zetachain",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZETACHAIN;
