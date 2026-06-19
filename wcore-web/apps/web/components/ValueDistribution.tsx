"use client";

import { useState } from "react";
import type { ChainScan } from "@wcore/shared";
import { usePreferences } from "./PreferencesProvider";
import { ChainIcon } from "./ChainIcon";
import { getDistributionVm, isCexDistributionChain } from "@/lib/value-distribution";

interface ValueDistributionProps {
  chains: ChainScan[];
}

const COLORS = [
  "#627EEA", "#F0B90B", "#8247E5", "#E84142", "#10B981",
  "#F7931A", "#28A0F1", "#EC4899", "#8B5CF6", "#14B8A6",
  "#F97316", "#6366F1", "#06B6D4", "#84CC16", "#D946EF",
];

const VM_COLORS: Record<string, string> = {
  EVM: "#627EEA",
  SVM: "#9945FF",
  COSMOS: "#14B8A6",
  TON: "#0098EA",
  CEX: "#F0B90B",
};

export function ValueDistribution({ chains }: ValueDistributionProps) {
  const { t, formatValue } = usePreferences();
  const [showOthers, setShowOthers] = useState(false);
  const merged = new Map<string, number>();
  for (const c of chains) {
    const name = c.chainName || c.chainKey;
    merged.set(name, (merged.get(name) ?? 0) + c.totals.valueEur);
  }
  const entries = [...merged.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const cexCount = entries.filter((entry) => {
    const chainEntry = chains.find((c) => (c.chainName || c.chainKey) === entry.name);
    return chainEntry ? isCexDistributionChain(chainEntry.chainKey) : false;
  }).length;
  const chainCount = entries.length - cexCount;

  const vmTotals = new Map<string, number>();
  for (const c of chains) {
    const vm = getDistributionVm(c);
    vmTotals.set(vm, (vmTotals.get(vm) ?? 0) + c.totals.valueEur);
  }
  const vmEntries = [...vmTotals.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.value, 0);
  const top = entries.slice(0, 8);
  const othersValue = entries.slice(8).reduce((s, e) => s + e.value, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("valueDistribution")} · {chainCount} active chains{cexCount > 0 ? ` · ${cexCount} CEX` : ""}
        </p>
        <span className="text-sm font-bold tabular-nums">{formatValue(total)}</span>
      </div>

      {/* VM stacked bar + labels in one compact row */}
      {vmEntries.length > 1 ? (
        <div className="mb-3">
          <div className="h-2.5 w-full rounded-full bg-border overflow-hidden flex mb-1.5">
            {vmEntries.map(([vm, value]) => {
              const pct = total > 0 ? (value / total) * 100 : 0;
              if (pct < 0.5) return null;
              return <div key={vm} className="h-full" style={{ width: `${pct}%`, backgroundColor: VM_COLORS[vm] ?? "#888" }} />;
            })}
          </div>
          <div className="flex gap-4 text-[10px]">
            {vmEntries.map(([vm, value]) => (
              <span key={vm} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: VM_COLORS[vm] ?? "#888" }} />
                <span className="font-semibold text-fg">{vm}</span>
                <span className="text-muted">{formatValue(value)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Top chains — single column, icons + thin bars */}
      <div className="space-y-1.5">
        {top.map((entry, i) => {
          const pct = (entry.value / total) * 100;
          const chainEntry = chains.find(c => (c.chainName || c.chainKey) === entry.name);
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              {chainEntry ? <ChainIcon chainKey={chainEntry.chainKey} size="sm" /> : (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              )}
              <span className="text-xs text-fg w-28 truncate shrink-0">{entry.name}</span>
              <div className="flex-1 h-1 rounded-full bg-border overflow-hidden min-w-0">
                <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
              </div>
              <span className="text-[10px] text-muted shrink-0 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {othersValue > 0 ? (
        <button
          onClick={() => setShowOthers(!showOthers)}
          className="mt-2 text-[11px] text-muted hover:text-fg transition"
        >
          {showOthers ? `− ${t("hide")}` : `+ ${entries.length - top.length} ${t("otherChains")} (${(othersValue / total * 100).toFixed(1)}%)`}
        </button>
      ) : null}

      {showOthers ? (
        <div className="mt-2 space-y-1">
          {entries.slice(8).map((entry, i) => {
            const pct = (entry.value / total) * 100;
            return (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[(i + 8) % COLORS.length] }} />
                <span className="text-[11px] text-muted w-28 truncate shrink-0">{entry.name}</span>
                <div className="flex-1 h-1 rounded-full bg-border overflow-hidden min-w-0">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: COLORS[(i + 8) % COLORS.length] }} />
                </div>
                <span className="text-[10px] text-muted shrink-0 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
