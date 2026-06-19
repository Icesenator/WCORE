// Auto-generated from src/CRONOS.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const CRONOS: ChainConfig = {
  key: "CRONOS",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://evm.cronos.org",
      "https://cronos.drpc.org",
      "https://cronos-evm-rpc.publicnode.com",
      "https://cronos.blockpi.network/v1/rpc/public",
    ],
  },
  CHAIN: {
    NAME: "Cronos",
    CHAIN_ID: 25,
    NATIVE_SYMBOL: "CRO",
    NATIVE_NAME: "Cronos",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:crypto-com-chain",
    NATIVE_GECKO_ID: "crypto-com-chain",
    DEX_SLUG: "cronos",
    GT_NETWORK: "cro",
  },
  LLAMA_ID_MAP: {
    CRO: "coingecko:crypto-com-chain",
    DAI: "coingecko:dai",
    FERRO: "coingecko:ferro",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    VVS: "coingecko:vvs-finance",
    WBTC: "coingecko:wrapped-bitcoin",
    WCRO: "coingecko:wrapped-cro",
    WETH: "coingecko:weth",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default CRONOS;
