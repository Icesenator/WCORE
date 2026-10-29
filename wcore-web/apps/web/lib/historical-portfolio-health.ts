import { projectPortfolioHealth, type ScanResult, type PortfolioHealth } from "@wcore/shared";

export interface HistoricalHealthInput {
  address: string;
  /** Persisted request scope, not the chains returned by the scanner. */
  chains: string[];
  result?: (Omit<ScanResult, "requestedChains" | "generatedAt"> & {
    requestedChains?: string[];
    generatedAt?: string;
  }) | null;
}

export interface HistoricalSummaryValue {
  /** null when no value is known: never rendered as 0. */
  value: number | null;
  qualifier: "COMPLETE" | "PARTIAL" | "UNKNOWN";
}

/**
 * Value shown in the history summary. The persisted totalEur sums only priced
 * tokens and is 0 when nothing is known, so it is shown only when health
 * proves a known value, and qualified as partial when coverage is incomplete.
 */
export function historicalSummaryValue(health: PortfolioHealth, totalEur: number): HistoricalSummaryValue {
  if (health.totals.knownValueEur === null || !Number.isFinite(totalEur)) return { value: null, qualifier: "UNKNOWN" };
  return { value: totalEur, qualifier: health.totals.valueComplete ? "COMPLETE" : "PARTIAL" };
}

/** Chain card value: totals.valueEur sums priced tokens only, so 0 with unpriced tokens is unknown, not zero. */
export function historicalChainValue(
  totals: { valueEur: number; tokenCount: number; pricedCount: number },
  status: { errors?: readonly unknown[]; degraded?: boolean } = {},
): HistoricalSummaryValue {
  const impaired = (status.errors?.length ?? 0) > 0 || status.degraded === true;
  if (!Number.isFinite(totals.valueEur) || (totals.pricedCount === 0 && totals.tokenCount > 0)) return { value: null, qualifier: "UNKNOWN" };
  // A failed or degraded chain cannot prove that a zero is a real zero.
  if (impaired && totals.valueEur === 0) return { value: null, qualifier: "UNKNOWN" };
  return { value: totals.valueEur, qualifier: impaired || totals.pricedCount < totals.tokenCount ? "PARTIAL" : "COMPLETE" };
}

/** Local read-only adapter for GET /api/scans/:id; no implicit clock or age policy. */
export function projectHistoricalPortfolioHealth(scan: HistoricalHealthInput, observedAt: string): PortfolioHealth {
  const result = scan.result;
  const health = projectPortfolioHealth({
    sources: [{ id: "history", address: scan.address }],
    results: result ? [{ ...result, requestedChains: result.requestedChains ?? scan.chains, generatedAt: result.generatedAt ?? "" }] : [],
    filter: result && !result.requestedChains ? { chains: scan.chains } : null,
    now: observedAt,
  });
  if (!result) return health;
  const source = health.sources[0];
  if (!source) return health;
  // The shared projection preserves future timestamps but cannot attest their age.
  // History must not display those records as healthy or their value as complete.
  const invalidTime = source.scanAgeMs === null;
  return {
    ...health,
    sources: [{ ...source, generatedAtRaw: result.generatedAt ?? null,
      ...(invalidTime ? { state: "UNKNOWN", knownValueEur: null, valueComplete: false } as const : {}),
    }],
    totals: invalidTime ? { ...health.totals, knownValueEur: null, valueComplete: false, sourcesWithUnknown: 1 } : health.totals,
  };
}
