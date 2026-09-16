// WC-11 — scan-facing integration seam.
//
// `scan.ts` should call exactly this function and nothing else. It composes the
// provider framework with the authoritative merge, and it can never affect a scan:
//   * opt-in (default passthrough when disabled),
//   * never throws (any failure returns the untouched assets with a diagnostic),
//   * never mutates assetsByChain,
//   * on-chain verification stays required — providers only ever propose candidates.

import { mergeEnrichmentIntoAssets, type EnrichmentMergeDeps } from "./merge.js";
import type { EnrichmentOutcome, PortfolioEnrichmentFramework } from "./service.js";
import type { PortfolioEnrichmentInput, PortfolioEnrichmentResult } from "./types.js";

export interface PortfolioEnrichmentScanStepDeps {
  readonly framework: PortfolioEnrichmentFramework;
  readonly verifyContract: EnrichmentMergeDeps["verifyContract"];
  /** Config gate. When false (default), the step is a pure passthrough. */
  readonly enabled?: boolean;
}

export interface PortfolioEnrichmentScanStep {
  run(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult>;
}

export function createPortfolioEnrichmentScanStep(deps: PortfolioEnrichmentScanStepDeps): PortfolioEnrichmentScanStep {
  const enabled = deps.enabled === true;
  return {
    async run(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult> {
      const passthrough = (reason: string): PortfolioEnrichmentResult => ({
        assetsByChain: new Map(input.assetsByChain),
        diagnostics: { enrichment: reason },
      });
      if (!enabled) return passthrough("disabled");

      let outcomes: readonly EnrichmentOutcome[];
      try {
        outcomes = await deps.framework.run(input);
      } catch {
        return passthrough("provider_layer_error"); // must never break the scan
      }

      try {
        const merged = await mergeEnrichmentIntoAssets(
          { address: input.address, assetsByChain: input.assetsByChain, outcomes },
          { verifyContract: deps.verifyContract },
        );
        const diagnostics: Record<string, number | string | boolean> = { enrichment: "ran", ...merged.diagnostics };
        for (const outcome of outcomes) diagnostics[`enrich_${outcome.provider}`] = outcome.stale ? "STALE" : outcome.status;
        return { assetsByChain: merged.assetsByChain, diagnostics };
      } catch {
        return passthrough("merge_error");
      }
    },
  };
}
