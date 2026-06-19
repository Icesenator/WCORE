// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const PLAYNANCE_PLAYBLOCK: ChainConfig = {
  key: "PLAYNANCE_PLAYBLOCK",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1829.rpc.thirdweb.com",
      "https://rpc.playblock.io"
    ],
  },
  CHAIN: {
    NAME: "Playnance Playblock",
    CHAIN_ID: 1829,
    NATIVE_SYMBOL: "PAY",
    NATIVE_NAME: "Playnance Playblock Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:playnance",
    NATIVE_GECKO_ID: "play-2-earn",
    DEX_SLUG: "playnance-playblock",
    GT_NETWORK: "playnance-playblock",
  },
  LLAMA_ID_MAP: {"PAY":"coingecko:playnance"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default PLAYNANCE_PLAYBLOCK;
