// Auto-generated from src/ETHEREUM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ETHEREUM: ChainConfig = {
  key: "ETHEREUM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 65,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 25000,
    HTTP_MS: 2500,
    SAFE_MARGIN_MS: 900,
    SAFE_SAVE_MARGIN_MS: 1400,
    SAFE_PRICE_MARGIN_MS: 4000,
    NATIVE_PRICE_MIN_LEFT_MS: 3500,
    HARD_GUARD_MS: 22000,
    HARD_PRICE_CUTOFF_MS: 3000,
    FAST_FAIL_MS: 2500,
  },
  RPC: {
    ENDPOINTS: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.drpc.org",
      "https://1rpc.io/eth",
      "https://gateway.tenderly.co/public/mainnet",
      "https://eth.merkle.io",
    ],
    CONSENSUS_MIN_RPCS: 2,
    CONSENSUS_MAX_RPCS: 2,
    TOKEN_DECIMALS: {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,
      "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 8,
      "0x66a3c2fa3e467aa586e90912f977e648589cabaf": 8,
      "0x49b5a631f54927c0007232844f06fe18cbf69786": 6,
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 8,
    },
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 90000,
    HEALTH_CHECK_INTERVAL_MS: 300000,
  },
  CHAIN: {
    NAME: "Ethereum",
    CHAIN_ID: 1,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "ethereum",
    GT_NETWORK: "eth",
  },
  LLAMA_ID_MAP: {
    AAVE: "coingecko:aave",
    DAI: "coingecko:dai",
    ETH: "coingecko:ethereum",
    LINK: "coingecko:chainlink",
    UNI: "coingecko:uniswap",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WBTC: "coingecko:wrapped-bitcoin",
    WETH: "coingecko:weth",
    cbETH: "coingecko:coinbase-wrapped-staked-eth",
    rETH: "coingecko:rocket-pool-eth",
    stETH: "coingecko:staked-ether",
    RANGE: "coingecko:range-protocol",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ETHEREUM;
