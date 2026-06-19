// Auto-generated from src/WORLDCHAIN.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const WORLDCHAIN: ChainConfig = {
  key: "WORLDCHAIN",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://worldchain-mainnet.g.alchemy.com/public",
      "https://world-chain.drpc.org",
      "https://worldchain-mainnet.gateway.tenderly.co",
      "https://480.rpc.thirdweb.com",
    ],
  },
  CHAIN: {
    NAME: "World Chain",
    CHAIN_ID: 480,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "worldchain",
    GT_NETWORK: "world-chain",
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    WLD: "coingecko:worldcoin-wld",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default WORLDCHAIN;
