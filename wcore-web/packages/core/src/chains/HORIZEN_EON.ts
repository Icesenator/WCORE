// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const HORIZEN_EON: ChainConfig = {
  key: "HORIZEN_EON",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: ["https://7332.rpc.thirdweb.com"],
  },
  CHAIN: {
    NAME: "Horizen Eon",
    CHAIN_ID: 7332,
    NATIVE_SYMBOL: "ZEN",
    NATIVE_NAME: "Horizen Eon Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:horizen",
    NATIVE_GECKO_ID: "horizen",
    DEX_SLUG: "horizen-eon",
    GT_NETWORK: "horizen-eon",
  },
  LLAMA_ID_MAP: {"ZEN":"coingecko:horizen"},
} as Omit<ChainConfig, "key" | "vm">),
};

export default HORIZEN_EON;
