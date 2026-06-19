// Chain config types — extracted from the .gs ChainFactory shape and
// kept loose because field availability varies between EVM / SVM / Cosmos.

import type { VmType } from "@wcore/shared";

export interface RpcEndpoints {
  ENDPOINTS?: string[];
  COMMITMENT?: string;
  CONSENSUS_MIN_RPCS?: number;
  CONSENSUS_MAX_RPCS?: number;
  MAX_FAILURES_BEFORE_BLOCK?: number;
  BLOCK_DURATION_MS?: number;
  HEALTH_CHECK_INTERVAL_MS?: number;
  TOKEN_DECIMALS?: Record<string, number>;
  [k: string]: unknown;
}

export interface CosmosApi {
  REST_URL?: string;
  REST_URLS?: string[];
  LCD_URL?: string;
  RPC_URL?: string;
  [k: string]: unknown;
}

export interface ChainMeta {
  NAME?: string;
  DISPLAY_NAME?: string;
  CHAIN_ID?: number | string;
  VM?: string;
  NATIVE_SYMBOL?: string;
  NATIVE_NAME?: string;
  NATIVE_DECIMALS?: number;
  NATIVE_LLAMA_ID?: string;
  NATIVE_GECKO_ID?: string;
  NATIVE_DENOM?: string;
  BECH32_PREFIX?: string;
  INCLUDE_STAKED_NATIVE?: boolean;
  DEX_SLUG?: string;
  GT_NETWORK?: string;
  LLAMA_CHAIN_SLUG?: string;
  // Opt-out flag: skips DefiLlama bulk pre-fetch when the chain returns poor
  // batch coverage (e.g. RealTokens on Gnosis priced by api.realtoken.community
  // instead of DefiLlama). Per-token cascade still runs.
  SKIP_LLAMA_BATCH?: boolean;
  [k: string]: unknown;
}

export interface ChainTimeouts {
  HTTP_MS?: number;
  FAST_FAIL_MS?: number;
  MAX_EXECUTION_MS?: number;
  SAFE_MARGIN_MS?: number;
  SAFE_SAVE_MARGIN_MS?: number;
  SAFE_PRICE_MARGIN_MS?: number;
  NATIVE_PRICE_MIN_LEFT_MS?: number;
  HARD_GUARD_MS?: number;
  HARD_PRICE_CUTOFF_MS?: number;
  [k: string]: unknown;
}

export interface ChainConfig {
  key: string;
  vm: VmType;
  CACHE_VERSION?: number;
  RPC?: RpcEndpoints;
  API?: CosmosApi;
  CHAIN?: ChainMeta;
  TIMEOUTS?: ChainTimeouts;
  LLAMA_ID_MAP?: Record<string, string>;
  LLAMA_CONTRACT_MAP?: Record<string, string>;
  DENOM_DECIMALS?: Record<string, number>;
  DENOM_SYMBOLS?: Record<string, string>;
  FLAGS?: Record<string, unknown>;
  [k: string]: unknown;
}
