"use client";
import { ChainIcon } from "@/components/ChainIcon";

export function PostScanBanner({
  timedOutChains,
  circuitOpenChains,
  retryingTimedOut,
  onRetryTimedOut,
}: {
  timedOutChains: Array<{ chainKey: string; chainName: string; address: string; label: string }>;
  circuitOpenChains: Array<{ chainKey: string; chainName: string; address: string; label: string }>;
  retryingTimedOut: boolean;
  onRetryTimedOut: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-orange-500/40 bg-orange-950/10 px-4 py-3">
      {timedOutChains.length > 0 ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">⏱️</span>
            <span className="text-xs font-semibold text-orange-300">{timedOutChains.length} chain{timedOutChains.length > 1 ? "s" : ""} timed out</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {timedOutChains.map(c => (
              <span key={`${c.address}-${c.chainKey}`} className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-950/30 px-2 py-0.5 text-[10px] text-orange-200">
                <ChainIcon chainKey={c.chainKey} size="sm" />
                {c.chainName || c.chainKey}
                {c.label ? <span className="text-orange-300/50">· {c.label}</span> : null}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-orange-300/70">Balances may be incomplete — partial data is being saved. The next scan or a retry will show it.</p>
          <button
            type="button"
            onClick={onRetryTimedOut}
            disabled={retryingTimedOut}
            className={`mt-3 rounded-lg border border-orange-500/40 px-3 py-1.5 text-xs font-medium transition ${retryingTimedOut ? "text-orange-300/50 bg-orange-950/20 cursor-wait" : "text-orange-300 hover:bg-orange-500/10"}`}
          >{retryingTimedOut ? "Retrying..." : "↻ Retry timed-out chains"}</button>
        </>
      ) : null}
      {circuitOpenChains.length > 0 ? (
        <>
          <div className={`flex items-center gap-2 ${timedOutChains.length > 0 ? "mt-4 pt-3 border-t border-orange-500/20" : "mb-2"}`}>
            <span className="text-sm">⚡</span>
            <span className="text-xs font-semibold text-red-300">{circuitOpenChains.length} circuit{circuitOpenChains.length > 1 ? "s" : ""} open</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {circuitOpenChains.map(c => (
              <span key={`${c.address}-${c.chainKey}`} className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-950/30 px-2 py-0.5 text-[10px] text-red-200">
                <ChainIcon chainKey={c.chainKey} size="sm" />
                {c.chainName || c.chainKey}
                {c.label ? <span className="text-red-300/50">· {c.label}</span> : null}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-red-300/70">Circuit breaker active — chain skipped to save quota. Will reset automatically.</p>
        </>
      ) : null}
    </div>
  );
}
