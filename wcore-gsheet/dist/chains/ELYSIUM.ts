// Auto-generated from src/ELYSIUM.gs by tools/extract-chains.mjs
// Do not edit by hand. Re-run: node tools/extract-chains.mjs

import type { ChainConfig } from "../types.js";

export const ELYSIUM: ChainConfig = {
  key: "ELYSIUM",
  vm: "EVM",
  ...({
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.elysiumchain.tech",
      "https://1339.rpc.thirdweb.com",
    ],
    MAX_LOG_RANGE: 1000,
  },
  CHAIN: {
    NAME: "Elysium",
    CHAIN_ID: 1339,
    NATIVE_SYMBOL: "LAVA",
    NATIVE_NAME: "LAVA",
    NATIVE_DECIMALS: 18,
  },
} as Omit<ChainConfig, "key" | "vm">),
};

export default ELYSIUM;
