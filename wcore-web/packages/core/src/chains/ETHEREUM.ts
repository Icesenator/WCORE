// ETHEREUM / Ethereum Mainnet — migrated to CHAIN_CONFIG_SCHEMA (Zod) in Chantier 2
// Auto-generated config preserved; native Ether (ETH), chainId 1.

import type { ChainConfig } from "../types.js";
import { CHAIN_CONFIG_SCHEMA } from "@wcore/shared";

const ETHEREUM_PARSED = CHAIN_CONFIG_SCHEMA.parse({
  key: "ETHEREUM",
  vm: "EVM",
  cacheVersion: 63,
  rpc: {
    endpoints: [
      "https://eth.drpc.org",
      "https://1rpc.io/eth",
      "https://gateway.tenderly.co/public/mainnet",
      "https://eth.merkle.io",
      "https://rpc.eth.gateway.fm",
      "https://cloudflare-eth.com",
      "https://eth.llamarpc.com",
      "https://ethereum-rpc.publicnode.com",
      "https://eth.public-rpc.com",
    ],
    timeoutMs: 2500,
    CONSENSUS_MIN_RPCS: 2,
    CONSENSUS_MAX_RPCS: 3,
    MAX_FAILURES_BEFORE_BLOCK: 3,
    BLOCK_DURATION_MS: 90000,
    HEALTH_CHECK_INTERVAL_MS: 300000,
  },
  chain: {
    name: "Ethereum",
    chainId: 1,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    nativeDecimals: 18,
    nativeLlamaId: "coingecko:ethereum",
    nativeGeckoId: "ethereum",
    dexSlug: "ethereum",
    gtNetwork: "eth",
  },
  timeouts: {
    httpMs: 2500,
    maxExecutionMs: 25000,
    SAFE_MARGIN_MS: 900,
    SAFE_SAVE_MARGIN_MS: 1400,
    SAFE_PRICE_MARGIN_MS: 4000,
    NATIVE_PRICE_MIN_LEFT_MS: 3500,
    HARD_GUARD_MS: 22000,
    HARD_PRICE_CUTOFF_MS: 3000,
    FAST_FAIL_MS: 2500,
  },
  llamaIdMap: {
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
});

export const ETHEREUM: ChainConfig = {
  ...ETHEREUM_PARSED,
  CACHE_VERSION: ETHEREUM_PARSED.cacheVersion,
  RPC: {
    ENDPOINTS: ETHEREUM_PARSED.rpc.endpoints,
    TIMEOUT_MS: ETHEREUM_PARSED.rpc.timeoutMs,
    CONSENSUS_MIN_RPCS: ETHEREUM_PARSED.rpc.CONSENSUS_MIN_RPCS as number,
    CONSENSUS_MAX_RPCS: ETHEREUM_PARSED.rpc.CONSENSUS_MAX_RPCS as number,
    MAX_FAILURES_BEFORE_BLOCK: ETHEREUM_PARSED.rpc.MAX_FAILURES_BEFORE_BLOCK as number,
    BLOCK_DURATION_MS: ETHEREUM_PARSED.rpc.BLOCK_DURATION_MS as number,
    HEALTH_CHECK_INTERVAL_MS: ETHEREUM_PARSED.rpc.HEALTH_CHECK_INTERVAL_MS as number,
  },
  CHAIN: {
    NAME: ETHEREUM_PARSED.chain.name,
    CHAIN_ID: ETHEREUM_PARSED.chain.chainId,
    NATIVE_SYMBOL: ETHEREUM_PARSED.chain.nativeSymbol,
    NATIVE_NAME: ETHEREUM_PARSED.chain.nativeName,
    NATIVE_DECIMALS: ETHEREUM_PARSED.chain.nativeDecimals,
    NATIVE_LLAMA_ID: ETHEREUM_PARSED.chain.nativeLlamaId,
    NATIVE_GECKO_ID: ETHEREUM_PARSED.chain.nativeGeckoId,
    DEX_SLUG: ETHEREUM_PARSED.chain.dexSlug,
    GT_NETWORK: ETHEREUM_PARSED.chain.gtNetwork,
  },
  TIMEOUTS: {
    HTTP_MS: ETHEREUM_PARSED.timeouts.httpMs,
    MAX_EXECUTION_MS: ETHEREUM_PARSED.timeouts.maxExecutionMs,
    SAFE_MARGIN_MS: ETHEREUM_PARSED.timeouts.SAFE_MARGIN_MS as number,
    SAFE_SAVE_MARGIN_MS: ETHEREUM_PARSED.timeouts.SAFE_SAVE_MARGIN_MS as number,
    SAFE_PRICE_MARGIN_MS: ETHEREUM_PARSED.timeouts.SAFE_PRICE_MARGIN_MS as number,
    NATIVE_PRICE_MIN_LEFT_MS: ETHEREUM_PARSED.timeouts.NATIVE_PRICE_MIN_LEFT_MS as number,
    HARD_GUARD_MS: ETHEREUM_PARSED.timeouts.HARD_GUARD_MS as number,
    HARD_PRICE_CUTOFF_MS: ETHEREUM_PARSED.timeouts.HARD_PRICE_CUTOFF_MS as number,
    FAST_FAIL_MS: ETHEREUM_PARSED.timeouts.FAST_FAIL_MS as number,
  },
  LLAMA_ID_MAP: ETHEREUM_PARSED.llamaIdMap,
};

export default ETHEREUM;
