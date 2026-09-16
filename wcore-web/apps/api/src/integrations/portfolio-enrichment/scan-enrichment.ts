// WC-11 — scan-facing enrichment wiring (flag-gated, never throwing, never mutating).
//
// This is the ONLY enrichment entry `scan.ts` uses. When disabled it is a no-op that
// returns null, so the scan behaves exactly as before. When enabled it runs the seam
// and returns diagnostics for logging; it never touches ChainScan status, `degraded`,
// chain circuit breakers, or WCORE balances.

import type { CacheStore, WalletAssets } from "@wcore/core";

import type { ZerionEnrichmentConfig } from "../../config.js";
import { createConfiguredPortfolioEnrichment } from "./factory.js";
import { createRpcContractVerifier } from "./rpc-verifier.js";
import type { EnrichmentCache, EnrichmentCacheEntry } from "./service.js";
import { createPortfolioEnrichmentScanStep, type PortfolioEnrichmentScanStep } from "./scan-step.js";

/** Backs the provider-agnostic enrichment cache with the shared scan CacheStore. */
export function createEnrichmentCache(store: CacheStore): EnrichmentCache {
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // hard ceiling; staleness is policy-driven
  return {
    async get(key) {
      const value = await store.get<EnrichmentCacheEntry>(key);
      return value ?? null;
    },
    async set(key, entry) {
      await store.set(key, entry, RETENTION_MS);
    },
  };
}

/**
 * Build the enrichment scan step only when the config already authorizes it
 * (enabled AND a non-blank credential). Returns undefined otherwise, so `scan.ts`
 * stays byte-for-byte on the pre-WC-11 path.
 */
export function createEnrichmentScanStepIfConfigured(args: {
  zerion: ZerionEnrichmentConfig;
  store: CacheStore;
  now?: () => number;
  warn?: (message: string) => void;
  fetchImpl?: typeof fetch;
}): PortfolioEnrichmentScanStep | undefined {
  const apiKey = typeof args.zerion.apiKey === "string" ? args.zerion.apiKey.trim() : "";
  if (!args.zerion.enabled || apiKey.length === 0) return undefined;
  const framework = createConfiguredPortfolioEnrichment({
    zerion: args.zerion,
    cache: createEnrichmentCache(args.store),
    now: args.now,
    warn: args.warn,
    fetchImpl: args.fetchImpl,
  });
  return createPortfolioEnrichmentScanStep({ framework, verifyContract: createRpcContractVerifier(), enabled: true });
}

export interface EnrichmentDiagnosticsArgs {
  readonly enabled: boolean;
  readonly step: PortfolioEnrichmentScanStep | undefined;
  readonly address: string;
  readonly chains: readonly string[];
  readonly chainAssets: ReadonlyMap<string, WalletAssets>;
  readonly log?: (message: string, data?: unknown) => void;
}

/**
 * Run the enrichment seam for one wallet and return its diagnostics, or null when the
 * feature is disabled/unavailable. Guarantees: never throws, never mutates `chainAssets`.
 */
export async function runEnrichmentDiagnostics(
  args: EnrichmentDiagnosticsArgs,
): Promise<Readonly<Record<string, number | string | boolean>> | null> {
  if (!args.enabled || !args.step) return null;
  try {
    const result = await args.step.run({
      address: args.address,
      requestedChains: args.chains,
      assetsByChain: args.chainAssets,
    });
    args.log?.("[scan] enrichment diagnostics", { address: args.address, ...result.diagnostics });
    return result.diagnostics;
  } catch {
    // Enrichment must never affect a scan, even on an unexpected failure.
    args.log?.("[scan] enrichment swallowed an unexpected error", { address: args.address });
    return null;
  }
}
