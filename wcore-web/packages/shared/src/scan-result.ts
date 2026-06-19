import { z } from "zod";
import { VmType } from "./vm";

export const TokenAsset = z.object({
  contract: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().nonnegative(),
  balance: z.number(),
  priceEur: z.number().nullable(),
  priceSource: z.string().nullable(),
  valueEur: z.number().nullable(),
  flags: z.array(z.string()).default([]),
  logoUrl: z.string().optional(),
});
export type TokenAsset = z.infer<typeof TokenAsset>;

export const ChainScan = z.object({
  chainKey: z.string(),
  chainName: z.string(),
  vm: VmType,
  native: TokenAsset.nullable(),
  tokens: z.array(TokenAsset),
  totals: z.object({
    valueEur: z.number(),
    tokenCount: z.number().int().nonnegative(),
    pricedCount: z.number().int().nonnegative(),
  }),
  errors: z.array(
    z.object({
      stage: z.string(),
      message: z.string(),
    }),
  ),
  degraded: z.boolean(),
  fxRate: z.number(),
  scanMs: z.number().int().nonnegative(),
  phases: z.object({
    nativeMs: z.number().int().nonnegative(),
    discoveryMs: z.number().int().nonnegative(),
    balancesMs: z.number().int().nonnegative(),
    pricingMs: z.number().int().nonnegative(),
  }).optional(),
  cachedAt: z.string().datetime().nullable(),
  scriptVersion: z.string(),
});
export type ChainScan = z.infer<typeof ChainScan>;

export const ScanResult = z.object({
  address: z.string(),
  requestedChains: z.array(z.string()),
  chains: z.array(ChainScan),
  totals: z.object({
    valueEur: z.number(),
    tokenCount: z.number().int().nonnegative(),
    pricedCount: z.number().int().nonnegative(),
    chainsWithErrors: z.number().int().nonnegative(),
  }),
  generatedAt: z.string().datetime(),
  metrics: z.object({
    totalMs: z.number().int().nonnegative(),
    chainsScanned: z.number().int().nonnegative(),
    chainsWithErrors: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    pricedTokens: z.number().int().nonnegative(),
  }).optional(),
});
export type ScanResult = z.infer<typeof ScanResult>;
