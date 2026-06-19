// SOLANA / Solana Mainnet — migrated to CHAIN_CONFIG_SCHEMA (Zod) in Chantier 2
// Auto-generated config preserved; native SOL, SVM (Solana Virtual Machine).

import type { ChainConfig } from "../types.js";
import { CHAIN_CONFIG_SCHEMA } from "@wcore/shared";

const SOLANA_PARSED = CHAIN_CONFIG_SCHEMA.parse({
  key: "SOLANA",
  vm: "SVM",
  cacheVersion: 64,
  rpc: {
    endpoints: [
      "https://api.mainnet-beta.solana.com",
      "https://solana.drpc.org",
      "https://solana-rpc.publicnode.com",
    ],
    timeoutMs: 20000,
    COMMITMENT: "confirmed",
  },
  chain: {
    name: "Solana",
    nativeSymbol: "SOL",
    nativeName: "Solana",
    nativeDecimals: 9,
    nativeLlamaId: "coingecko:solana",
    nativeGeckoId: "solana",
    dexSlug: "solana",
    gtNetwork: "solana",
  },
  timeouts: {
    httpMs: 20000,
    maxExecutionMs: 30000,
  },
  llamaIdMap: {
    LAYER: "coingecko:solayer",
  },
});

export const SOLANA: ChainConfig = {
  ...SOLANA_PARSED,
  CACHE_VERSION: SOLANA_PARSED.cacheVersion,
  RPC: {
    ENDPOINTS: SOLANA_PARSED.rpc.endpoints,
    TIMEOUT_MS: SOLANA_PARSED.rpc.timeoutMs,
    COMMITMENT: SOLANA_PARSED.rpc.COMMITMENT as string,
  },
  CHAIN: {
    VM: SOLANA_PARSED.vm,
    NAME: SOLANA_PARSED.chain.name,
    NATIVE_SYMBOL: SOLANA_PARSED.chain.nativeSymbol,
    NATIVE_NAME: SOLANA_PARSED.chain.nativeName,
    NATIVE_DECIMALS: SOLANA_PARSED.chain.nativeDecimals,
    NATIVE_LLAMA_ID: SOLANA_PARSED.chain.nativeLlamaId,
    NATIVE_GECKO_ID: SOLANA_PARSED.chain.nativeGeckoId,
    DEX_SLUG: SOLANA_PARSED.chain.dexSlug,
    GT_NETWORK: SOLANA_PARSED.chain.gtNetwork,
  },
  TIMEOUTS: {
    HTTP_MS: SOLANA_PARSED.timeouts.httpMs,
    MAX_EXECUTION_MS: SOLANA_PARSED.timeouts.maxExecutionMs,
  },
  LLAMA_ID_MAP: SOLANA_PARSED.llamaIdMap,
};

export default SOLANA;
