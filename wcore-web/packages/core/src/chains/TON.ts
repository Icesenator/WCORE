// TON / The Open Network — v0.3.0
// Native GRAM (Gram, ex-Toncoin, rebrand du 9 juin 2026) + jettons via TonAPI primary, Toncenter fallback.
// Address format: base64url (EQ/UQ/Ef/Uf, 48 chars) or raw (-1:hex64).
// Standalone engine — no EVM/SVM/Cosmos compat layer.

import type { ChainConfig } from "../types.js";
import { CHAIN_CONFIG_SCHEMA } from "@wcore/shared";

const TON_PARSED = CHAIN_CONFIG_SCHEMA.parse({
  key: "TON",
  vm: "TON",
  cacheVersion: 1,
  rpc: {
    endpoints: [
      "https://tonapi.io/v2",
      "https://toncenter.com/api/v2",
    ],
    timeoutMs: 4000,
  },
  chain: {
    name: "TON",
    nativeSymbol: "GRAM",
    nativeName: "Gram",
    nativeDecimals: 9,
    nativeLlamaId: "coingecko:the-open-network",
    nativeGeckoId: "the-open-network",
  },
  timeouts: {
    httpMs: 4000,
    maxExecutionMs: 30000,
  },
  llamaIdMap: {
    TON: "coingecko:the-open-network",
    USDT: "coingecko:tether",
  },
});

export const TON: ChainConfig = {
  ...TON_PARSED,
  CACHE_VERSION: TON_PARSED.cacheVersion,
  RPC: {
    ENDPOINTS: TON_PARSED.rpc.endpoints,
    TIMEOUT_MS: TON_PARSED.rpc.timeoutMs,
  },
  CHAIN: {
    NAME: TON_PARSED.chain.name,
    NATIVE_SYMBOL: TON_PARSED.chain.nativeSymbol,
    NATIVE_NAME: TON_PARSED.chain.nativeName,
    NATIVE_DECIMALS: TON_PARSED.chain.nativeDecimals,
    NATIVE_LLAMA_ID: TON_PARSED.chain.nativeLlamaId,
    NATIVE_GECKO_ID: TON_PARSED.chain.nativeGeckoId,
  },
  TIMEOUTS: {
    HTTP_MS: TON_PARSED.timeouts.httpMs,
    MAX_EXECUTION_MS: TON_PARSED.timeouts.maxExecutionMs,
  },
  LLAMA_ID_MAP: TON_PARSED.llamaIdMap,
};

export default TON;
