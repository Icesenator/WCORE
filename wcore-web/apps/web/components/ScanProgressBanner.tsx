"use client";
import { LogoSpinner } from "./LogoSpinner";
import { ChainIcon } from "./ChainIcon";
import type { ScanProgressDisplay } from "./scan-progress";

export function ScanProgressBanner({
  elapsed,
  scanningAddr,
  scanningSince,
  scanChains,
  scanProgressDisplay,
  activeScanChains,
}: {
  elapsed: number;
  scanningAddr: string | null;
  scanningSince: number;
  scanChains: string[];
  scanProgressDisplay: ScanProgressDisplay;
  activeScanChains: Map<string, Set<string>>;
}) {
  return (
    <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
      <div className="mb-3 flex items-center gap-3">
        <LogoSpinner className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent whitespace-nowrap">Scanning portfolio</p>
            {activeScanChains.size > 0 ? (
              <div className="flex flex-wrap items-center gap-0.5">
                {scanChains.map((ch) => (
                  <div key={ch} className="animate-pulse shrink-0">
                    <ChainIcon chainKey={ch} size="sm" />
                  </div>
                ))}
              </div>
            ) : null}
            <span className="text-xs tabular-nums text-muted whitespace-nowrap">{elapsed}s</span>
          </div>
          {scanningAddr ? <p className="mt-0.5 truncate text-[11px] text-muted">Current: {scanningAddr}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden relative">
          <div className="h-full rounded-full bg-accent/30 transition-all" style={{ width: `${scanProgressDisplay.percent}%` }} />
          <div className="animate-scan w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(132,204,22,0.6)]" />
        </div>
        <span className="text-xs text-accent font-semibold tabular-nums whitespace-nowrap">
          {scanProgressDisplay.percent}%
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span>{scanProgressDisplay.primaryLabel}</span>
        {scanProgressDisplay.secondaryLabel ? <span>· {scanProgressDisplay.secondaryLabel}</span> : null}
        {/* eslint-disable-next-line react-hooks/purity */}
        {scanningSince ? <span className="ml-auto tabular-nums">current {Math.round((Date.now()-scanningSince)/1000)}s</span> : null}
      </div>
    </div>
  );
}
