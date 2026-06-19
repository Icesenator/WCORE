"use client";
import { useMemo, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import type { ChainScan } from "@wcore/shared";

const INITIAL_ROWS = 100;
const ROW_INCREMENT = 100;

export function AllTokensTable({
  enabledResults,
}: {
  enabledResults: Array<{
    address: string;
    label: string;
    chains: ChainScan[];
    totalEur: number;
    error?: string;
  }>;
}) {
  const { formatValue, t } = usePreferences();
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROWS);

  // Memoize the flatten + sort: O(rows log rows) only when results change,
  // not on every render (was recomputing on every parent re-render).
  const rows = useMemo(() => {
    return enabledResults.flatMap(w =>
      w.chains.flatMap(c => {
        const nativeRow = c.native && c.native.valueEur && c.native.valueEur > 0 ? [{
          symbol: c.native.symbol,
          name: c.native.name,
          contract: c.native.contract ?? "native",
          balance: c.native.balance,
          priceEur: c.native.priceEur,
          valueEur: c.native.valueEur,
          chainName: c.chainName,
          walletLabel: w.label,
        }] : [];
        const tokenRows = c.tokens.filter(t => (t.valueEur ?? 0) > 0).map(t => ({
          symbol: t.symbol,
          name: t.name,
          contract: t.contract,
          balance: t.balance,
          priceEur: t.priceEur,
          valueEur: t.valueEur,
          chainName: c.chainName,
          walletLabel: w.label,
        }));
        return [...nativeRow, ...tokenRows];
      })
    ).sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0));
  }, [enabledResults]);

  // Windowing: only render visibleCount rows to keep DOM node count bounded.
  // A wallet with 20 addresses × 110 chains × ~50 tokens = 110k rows would
  // freeze the browser; cap initial render and expand on demand.
  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = rows.length > visibleCount;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60 text-muted">
            <th className="text-left px-3 py-2 font-medium">{t("asset") ?? "Asset"}</th>
            <th className="text-right px-3 py-2 font-medium">{t("balance")}</th>
            <th className="text-right px-3 py-2 font-medium">{t("price")}</th>
            <th className="text-right px-3 py-2 font-medium">{t("value")}</th>
            <th className="text-left px-3 py-2 font-medium">{t("chain")}</th>
            <th className="text-left px-3 py-2 font-medium">{t("wallet") ?? "Wallet"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={`${row.contract ?? "native"}-${row.chainName}-${row.walletLabel}-${i}`} className="border-b border-border/30 hover:bg-accent/5 transition">
              <td className="px-3 py-2 text-fg">
                <span className="font-medium">{row.symbol}</span>
                <span className="text-muted ml-1.5 hidden sm:inline">{row.name}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-fg">{row.balance < 0.01 ? row.balance.toFixed(6) : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(row.balance)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fg">{row.priceEur != null ? formatValue(row.priceEur) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-fg">{formatValue(row.valueEur ?? 0)}</td>
              <td className="px-3 py-2 text-muted text-[10px]">{row.chainName}</td>
              <td className="px-3 py-2 text-muted text-[10px] truncate max-w-[60px]">{row.walletLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore ? (
        <button
          onClick={() => setVisibleCount((c) => c + ROW_INCREMENT)}
          className="w-full py-2 text-xs text-accent hover:bg-accent/5 transition border-t border-border/30"
        >
          + {Math.min(ROW_INCREMENT, rows.length - visibleCount)} more ({rows.length - visibleCount} hidden)
        </button>
      ) : null}
    </div>
  );
}
