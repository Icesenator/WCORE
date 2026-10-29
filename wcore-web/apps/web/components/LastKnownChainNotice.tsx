import React from "react";
import type { LastKnownEntry } from "@/lib/refresh-outcome";

function formatObservedAt(observedAt: string | null): string {
  if (!observedAt) return "Unknown";
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Display-only view of a value kept after a failed refresh. Never part of totals, share or export. */
export function LastKnownChainNotice({ entry, formatValue }: { entry: LastKnownEntry; formatValue: (n: number) => string }) {
  return (
    <div data-testid="last-known-chain" className="mt-3 rounded-md border border-dashed border-yellow-500/40 bg-yellow-950/10 px-3 py-2 text-xs text-yellow-200">
      <p className="font-semibold">Last known value (not current): {formatValue(entry.chain.totals.valueEur)}</p>
      <p className="text-yellow-200/80">
        Refresh failed, so the current balance is unknown. This older value is not included in totals, share or export.
      </p>
      <p className="text-yellow-200/60">Observed: {formatObservedAt(entry.observedAt)} (earlier result in this browser session)</p>
    </div>
  );
}
