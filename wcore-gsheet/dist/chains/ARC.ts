// Auto-generated from src/ARC.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ARC: ChainConfig = {
  key: "ARC",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mainnet.arc.io",
      "https://rpc.blockdaemon.mainnet.arc.io",
      "https://rpc.drpc.mainnet.arc.io",
      "https://rpc.quicknode.mainnet.arc.io",
    ],
  },
  CHAIN: {
    NAME: "Arc",
    CHAIN_ID: 5042,
    NATIVE_SYMBOL: "USDC",
    NATIVE_NAME: "USDC",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:usd-coin",
    NATIVE_GECKO_ID: "usd-coin",
  },
  KNOWN_TOKENS: {
    "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1": {
      symbol: "EURC",
      name: "EURC",
      decimals: 6,
      isStable: true,
      peg: "EUR",
    },
    "0x8a5D989Bbb96929F689B0200f435f53dA42bF490": {
      symbol: "USYC",
      name: "USYC",
      decimals: 6,
      isStable: false,
    },
  },
  FLAGS: {
    EXCLUDE_CONTRACTS: [
      "0x3600000000000000000000000000000000000000",
      "0xfffffffffffffffffffffffffffffffffffffffe",
    ],
  },
  LLAMA_ID_MAP: {
    USDC: "coingecko:usd-coin",
    EURC: "coingecko:euro-coin",
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ARC;
