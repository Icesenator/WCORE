// Auto-generated from src/HASHKEY.gs by tools/migrate/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/migrate/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const HASHKEY: ChainConfig = {
  key: "HASHKEY",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.hsk.xyz",
      "https://hashkey.drpc.org",
      "https://rpc.hashkey.hsk.xyz",
      "https://hashkeychain-mainnet.alt.technology",
    ],
  },
  CHAIN: {
    NAME: "HashKey",
    CHAIN_ID: 177,
    NATIVE_SYMBOL: "HSK",
    NATIVE_NAME: "HashKey Token",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:hashkey-ecopoints",
    NATIVE_GECKO_ID: "hashkey-ecopoints",
    DEX_SLUG: "hashkey",
    GT_NETWORK: "hashkey",
  },
  LLAMA_ID_MAP: {
    HSK: "coingecko:hashkey-ecopoints",
    USDC: "coingecko:usd-coin",
    USDT: "coingecko:tether",
    WHSK: "coingecko:hashkey-ecopoints",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default HASHKEY;
