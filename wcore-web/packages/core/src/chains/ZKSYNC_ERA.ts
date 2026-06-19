// Auto-generated from src/ZKSYNC_ERA.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ZKSYNC_ERA: ChainConfig = {
  key: "ZKSYNC_ERA",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.era.zksync.io",
      "https://zksync.drpc.org",
      "https://1rpc.io/zksync2-era",
      "https://zksync-era.blockpi.network/v1/rpc/public",
    ],
  },
  CHAIN: {
    NAME: "zkSync Era",
    CHAIN_ID: 324,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "zksync",
    GT_NETWORK: "zksync",
  },
  LLAMA_ID_MAP: {
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    "USDC.e": "coingecko:bridged-usd-coin-zksync",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    ZK: "coingecko:zksync",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ZKSYNC_ERA;
