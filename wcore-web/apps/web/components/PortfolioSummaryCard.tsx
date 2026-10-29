"use client";
import Link from "next/link";
import type { ChainScan } from "@wcore/shared";
import { usePreferences } from "@/components/PreferencesProvider";
import { exportCSV, hasFailedChains } from "@/lib/csv-export";
import { getApiUrl } from "@/lib/api";
import { buildShareCardUrl, portfolioOutputAvailability } from "@/lib/share-card";
import { trackFunnelEvent, type FunnelCampaign, type PortfolioAction } from "@/lib/funnel-analytics";

export function PortfolioSummaryCard({
  totalEur,
  timeAgo,
  addresses,
  uniqueChains,
  totalTokens,
  deepScan,
  scanDuration,
  allChainCards,
  displayResultsAdjusted,
  refreshingAll,
  onRefreshAll,
  campaign,
  cexCount = 0,
  scanComplete = false,
}: {
  totalEur: number;
  timeAgo: string;
  addresses: string[];
  uniqueChains: number;
  totalTokens: number;
  deepScan: boolean;
  scanDuration: number;
  allChainCards: Array<Pick<ChainScan, "chainKey" | "errors" | "native" | "tokens" | "totals" | "degraded">>;
  displayResultsAdjusted: Array<{ address: string; label: string; chains: ChainScan[]; totalEur: number }>;
  refreshingAll: boolean;
  onRefreshAll: () => void;
  campaign: FunnelCampaign;
  cexCount?: number;
  scanComplete?: boolean;
}) {
  const { formatValue, t } = usePreferences();
  const outputs = portfolioOutputAvailability({ scanComplete, chains: allChainCards });
  const shareHref = outputs.share ? buildShareCardUrl(getApiUrl(), { totalEur, walletCount: addresses.length, chainCount: outputs.usableChains, cexCount }) : null;
  const blockedTitle = outputs.reason === "scan_in_progress"
    ? "Available when the scan is complete"
    : outputs.reason === "partial_result"
      ? `${outputs.failedChains} chain(s) failed: the share card needs a complete scan`
      : "No scan result to export or share yet";
  // The CSV covers every wallet in displayResultsAdjusted, so its partial flag uses that same scope.
  const exportPartial = hasFailedChains(displayResultsAdjusted);
  const exportTitle = exportPartial
    ? "Export partial CSV (failed chains are not included)"
    : (t("exportCSV") ?? "Export CSV");
  const trackAction = (action: PortfolioAction) => {
    void trackFunnelEvent({ event: "portfolio_action", campaign, surface: "wallet", variant: "control", dimensions: { action } });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-baseline gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("portfolio")}</p>
            {timeAgo ? <span className="text-[10px] text-muted/60">Updated {timeAgo}</span> : null}
          </div>
          <p className="mt-1 text-3xl font-bold">{formatValue(totalEur)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/?campaign=${campaign}`} onClick={() => trackAction("add")} className="flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-accent/30 transition" title="Add another wallet to scan">＋ Add</Link>
          <button
            type="button"
            onClick={() => { trackAction("refresh"); onRefreshAll(); }}
            disabled={refreshingAll}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${refreshingAll ? "cursor-not-allowed text-accent border-accent/30 bg-accent/10 animate-pulse" : "text-accent border-accent/30 hover:bg-accent/10"}`}
            title={t("refreshWallet") + " all"}
          >↻ Refresh All</button>
          <button
            type="button"
            onClick={() => {
              if (!outputs.export) return;
              trackAction("export");
              exportCSV(displayResultsAdjusted, {
                address: t("address"), label: t("label"), chain: t("chain"),
                symbol: "Symbol", name: "Name", contract: "Contract",
                balance: t("balance"), priceLabel: t("price"), valueLabel: t("value"),
              }, { partial: exportPartial });
            }}
            disabled={!outputs.export}
            className={`flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium transition ${outputs.export ? "text-accent hover:bg-accent/10" : "cursor-not-allowed text-muted opacity-50"}`}
            title={outputs.export ? exportTitle : blockedTitle}
          >{exportPartial ? "⬇ Export (partial)" : "⬇ Export"}</button>
          {shareHref ? (
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("share")}
              className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition"
              title="Share your clean portfolio card (rounded total, no address)"
            >↗ Share</a>
          ) : (
            <button
              type="button"
              disabled
              className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium cursor-not-allowed text-muted opacity-50"
              title={blockedTitle}
              aria-label={`Share unavailable: ${blockedTitle}`}
            >↗ Share</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-lg border border-border/60 bg-bg/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t("wallets")}</p>
          <p className="text-lg font-bold text-fg">{addresses.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-bg/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t("chains")}</p>
          <p className="text-lg font-bold text-fg">{uniqueChains}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-bg/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t("tokens")}</p>
          <p className="text-lg font-bold text-fg">{totalTokens}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-bg/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">Scan</p>
          <p className="text-lg font-bold text-fg">{deepScan ? "Deep" : "Standard"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent"/>
          {scanDuration > 0 ? `${scanDuration}s` : "—"}
        </span>
        <span>
          {allChainCards.reduce((s, c) => s + c.totals.pricedCount, 0)}/{totalTokens} {t("priced")}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"/>
          {allChainCards.filter((c) => c.degraded).length} Partial
        </span>
      </div>

      {/* Mini progress: priced vs degraded */}
      {totalTokens > 0 ? (
        <div className="mt-2 h-1 w-full rounded-full bg-border overflow-hidden flex">
          {(() => {
            const priced = allChainCards.reduce((s, c) => s + c.totals.pricedCount, 0);
            const degraded = allChainCards.filter((c) => c.degraded).length;
            return (
              <>
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(0.5, (priced / totalTokens) * 100)}%` }} />
                <div className="h-full bg-yellow-600/50 transition-all" style={{ width: `${Math.max(0.5, (degraded / totalTokens) * 100)}%` }} />
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
