import { z } from "zod";

export const CHAIN_VM = ["EVM", "SVM", "COSMOS", "TON"] as const;

export const CHAIN_CONFIG_SCHEMA = z.object({
  key: z.string().min(2),
  vm: z.enum(CHAIN_VM),
  cacheVersion: z.number().int().nonnegative(),
  rpc: z.object({
    endpoints: z.array(z.string().url()).min(1),
    timeoutMs: z.number().int().positive().default(4000),
    maxBatchSize: z.number().int().positive().optional(),
  }).passthrough(),
  chain: z.object({
    name: z.string().min(1),
    chainId: z.number().int().positive().optional(),
    nativeSymbol: z.string().min(1),
    nativeName: z.string().min(1),
    nativeDecimals: z.number().int().min(0).max(36),
    nativeLlamaId: z.string().optional(),
    nativeGeckoId: z.string().optional(),
    dexSlug: z.string().optional(),
    gtNetwork: z.string().optional(),
  }).passthrough(),
  timeouts: z.object({
    httpMs: z.number().int().positive().default(4000),
    maxExecutionMs: z.number().int().positive().default(30000),
  }).passthrough(),
  llamaIdMap: z.record(z.string(), z.string()).default({}),
});

export type ChainConfig = z.infer<typeof CHAIN_CONFIG_SCHEMA>;

/**
 * Contract of the generated `@wcore/chains` package consumed by the API.
 *
 * The lowercase schema above is the target format used by the chains already
 * migrated to Zod. The published package still exposes the historical GAS
 * shape (`RPC.ENDPOINTS`, `CHAIN.NATIVE_SYMBOL`, ...), so applying the target
 * schema directly would reject every legacy config without protecting the
 * runtime. This schema validates the actual boundary until that migration is
 * complete.
 */
export const RUNTIME_CHAIN_CONFIG_SCHEMA = z.object({
  key: z.string().regex(/^[A-Z0-9_]+$/),
  vm: z.enum(CHAIN_VM),
  CACHE_VERSION: z.number().int().nonnegative(),
  RPC: z.object({
    ENDPOINTS: z.array(z.string().url()).optional(),
  }).passthrough().optional(),
  API: z.object({
    REST_URL: z.string().url().optional(),
    REST_URLS: z.array(z.string().url()).optional(),
    LCD_URL: z.string().url().optional(),
    RPC_URL: z.string().url().optional(),
  }).passthrough().optional(),
  CHAIN: z.object({
    NAME: z.string().min(1),
    CHAIN_ID: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    NATIVE_SYMBOL: z.string(),
    NATIVE_NAME: z.string(),
    NATIVE_DECIMALS: z.number().int().min(0).max(36),
  }).passthrough(),
  TIMEOUTS: z.object({}).passthrough().optional(),
  LLAMA_ID_MAP: z.record(z.string(), z.string()).optional(),
  LLAMA_CONTRACT_MAP: z.record(z.string(), z.string()).optional(),
  DENOM_DECIMALS: z.record(z.string(), z.number().int().min(0).max(36)).optional(),
  DENOM_SYMBOLS: z.record(z.string(), z.string()).optional(),
  FLAGS: z.record(z.string(), z.unknown()).optional(),
}).passthrough().superRefine((config, ctx) => {
  if (config.CHAIN.NATIVE_SYMBOL.trim() === "" && config.FLAGS?.DISABLE_NATIVE_BALANCE !== true) {
    ctx.addIssue({ code: "custom", path: ["CHAIN", "NATIVE_SYMBOL"], message: "required unless native balance is disabled" });
  }
  if (config.CHAIN.NATIVE_NAME.trim() === "" && config.FLAGS?.DISABLE_NATIVE_BALANCE !== true) {
    ctx.addIssue({ code: "custom", path: ["CHAIN", "NATIVE_NAME"], message: "required unless native balance is disabled" });
  }
  if (config.vm === "EVM" && typeof config.CHAIN.CHAIN_ID !== "number") {
    ctx.addIssue({ code: "custom", path: ["CHAIN", "CHAIN_ID"], message: "EVM chains require a numeric chainId" });
  }
  if ((config.vm === "SVM" || config.vm === "TON") && !config.RPC?.ENDPOINTS?.length) {
    ctx.addIssue({ code: "custom", path: ["RPC", "ENDPOINTS"], message: `${config.vm} chains require at least one endpoint` });
  }
  if (config.vm === "COSMOS" && !config.API) {
    ctx.addIssue({ code: "custom", path: ["API"], message: "Cosmos chains require API endpoints" });
  }
});

export type RuntimeChainConfig = z.infer<typeof RUNTIME_CHAIN_CONFIG_SCHEMA>;
