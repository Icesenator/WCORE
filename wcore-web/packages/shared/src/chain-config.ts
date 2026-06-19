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
