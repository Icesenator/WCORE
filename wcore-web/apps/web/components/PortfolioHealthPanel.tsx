import React from "react";
import type { HealthState, PortfolioHealth } from "@wcore/shared";

const STATE_LABELS: Record<HealthState, string> = {
  KNOWN: "Known", PARTIAL: "Partial", DEGRADED: "Degraded", ERROR: "Error",
  UNKNOWN: "Unknown", NOT_SCANNED: "Not scanned",
};

/** Presentation only: freshness and coverage are never inferred here. */
export function PortfolioHealthPanel({ health, formatValue }: {
  health: PortfolioHealth;
  formatValue: (value: number) => string;
}) {
  const source = health.sources[0];
  const value = health.totals.knownValueEur;
  return (
    <section aria-label="Portfolio health" className="rounded-lg border border-border bg-card p-4 mb-6">
      <h2 className="text-sm font-semibold">Portfolio health</h2>
      <p className="mt-2 text-sm">{source ? STATE_LABELS[source.state] : "Unknown"}</p>
      <p className="mt-1 text-sm">
        {value === null ? "Known value: Unknown" : `${health.totals.valueComplete ? "Complete known value" : "Partial known value"}: ${formatValue(value)}`}
      </p>
      <p className="mt-1 text-xs text-muted">Not an exhaustive portfolio total.</p>
      <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <div><dt className="inline">Request scope source: </dt><dd className="inline">{source?.requestedChainsSource ?? "NONE"}</dd></div>
        <div><dt className="inline">Coverage: </dt><dd className="inline">{source?.requestedChainsSource === "NONE" ? "Unknown" : `${health.scope.covered.length} returned / ${health.scope.requested.length} requested chains`}</dd></div>
        <div><dt className="inline">Missing chains: </dt><dd className="inline break-words">{health.scope.missing.join(", ") || (source?.requestedChainsSource === "NONE" ? "Unknown" : "None")}</dd></div>
        <div><dt className="inline">Errors: </dt><dd className="inline">{source && source.state !== "NOT_SCANNED" ? source.errors.length : "Unknown"}</dd></div>
        <div><dt className="inline">Unknown-price positions: </dt><dd className="inline">{source && source.state !== "NOT_SCANNED" ? source.unknownPricePositions : "Unknown"}</dd></div>
        <div><dt className="inline">Unknown-balance chains: </dt><dd className="inline break-words">{source?.unknownBalanceChains.join(", ") || (source?.state === "NOT_SCANNED" ? "Unknown" : "None reported")}</dd></div>
        <div><dt className="inline">Raw scan timestamp: </dt><dd className="inline break-all">{source?.generatedAtRaw ?? "Unknown"}</dd></div>
        <div><dt className="inline">Scan age at receipt (ms): </dt><dd className="inline">{source?.scanAgeMs ?? "Unknown"}</dd></div>
        <div><dt className="inline">Cache timestamp: </dt><dd className="inline break-all">{source?.cacheObservedAt ?? "Unknown"}</dd></div>
        <div>Staleness: Not evaluated (no age policy)</div>
        <div>Price freshness: Unknown</div>
        <div>Balance freshness: Unknown</div>
      </dl>
    </section>
  );
}
