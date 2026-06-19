// types.ts
// Source unique des types `VmType` et `ChainConfig` du package `@wcore/chains`.
// Les fichiers `dist/chains/<KEY>.ts` importent `ChainConfig` depuis `./types.js`.
// Le package est regenere depuis `wcore-gsheet/src/*.gs` via `node tools/extract-chains.mjs`.

export const VmType = {
  EVM: "EVM",
  SVM: "SVM",
  COSMOS: "COSMOS",
  TON: "TON",
} as const;

export type VmType = (typeof VmType)[keyof typeof VmType];

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
