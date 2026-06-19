"use client";
import { apiFetch } from "@/lib/api";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ChainScan, TokenAsset } from "@wcore/shared";
import { ConnectButton } from "@/components/ConnectButton";
import { VmBadge } from "@/components/ChainCard";
import { usePreferences } from "@/components/PreferencesProvider";
import { LogoSpinner } from "@/components/LogoSpinner";
import { buildPortfolioCsv } from "@/lib/csv-export";

const ValueDistribution = dynamic(() => import("@/components/ValueDistribution").then(m => ({ default: m.ValueDistribution })), { ssr: false });

interface ScanDetail {
  id: string;
  address: string;
  chains: string[];
  totalEur: number;
  tokenCount: number;
  createdAt: string;
  result?: {
    address: string;
    chains: ChainScan[];
    totals: { valueEur: number; tokenCount: number; pricedCount: number; chainsWithErrors: number };
    generatedAt: string;
  };
}

export function ScanDetailClient({ id }: { id: string }) {
  const { formatValue } = usePreferences();
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy link");

  useEffect(() => {
    apiFetch(`/api/scans/${id}`)
      .then((r) => r.json())
      .then((d: ScanDetail & { error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setScan(d);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load scan"); setLoading(false); });
  }, [id]);

  const chains = useMemo(() => scan?.result?.chains ?? [], [scan?.result?.chains]);

  const chainCards = useMemo(() => {
    return chains.map((chain) => {
      const allAssets = chain.native ? [chain.native, ...chain.tokens] : chain.tokens;
      const sorted = [...allAssets].filter(a => a && a.balance > 0 && (a.valueEur ?? 0) >= 0).sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0));
      return { chain, assets: sorted as TokenAsset[] };
    });
  }, [chains]);

  if (loading) return <LogoSpinner className="h-16 w-16" />;

  if (error || !scan) {
    return (
      <div className="text-center">
        <Link href="/history" className="text-sm text-muted hover:text-fg">&larr; History</Link>
        <p className="mt-8 text-red-400">{error || "Scan not found"}</p>
      </div>
    );
  }

  const totalEur = scan.totalEur;

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-3 flex-wrap no-print">
        <div className="flex items-center gap-3">
          <Link href="/history" className="text-sm text-muted hover:text-fg">&larr; History</Link>
          <Link href="/leaderboard" className="text-xs text-muted hover:text-fg">Leaderboard</Link>
          <Link href="/profile" className="text-sm text-muted hover:text-fg">Profile</Link>
        </div>
        <ConnectButton />
      </header>

      <div className="rounded-lg border border-border bg-card p-5 mb-6 no-print">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scan Result</p>
            <p className="mt-2 text-2xl font-bold sm:text-3xl">{formatValue(totalEur)}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!scan.result) return;
                const csv = buildPortfolioCsv([{ address: scan.address, label: "", chains, totalEur }]);
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob); a.download = `wcore-scan-${new Date(scan.createdAt).toISOString().slice(0, 10)}.csv`; a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition no-print"
            >⬇ Export CSV</button>
            {shareUrl ? (
                <div className="flex gap-1">
                  <input value={shareUrl} readOnly className="text-xs rounded border border-border bg-bg px-2 py-1 text-muted w-40" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopyLabel("Copied!"); setTimeout(() => setCopyLabel("Copy link"), 2000); }} className="rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/10 transition">{copyLabel}</button>
                  <button onClick={async () => { await apiFetch(`/api/scans/${id}/share`, { method: "DELETE" }); setShareUrl(""); }} className="rounded-lg border border-red-400/30 px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 transition">✕</button>
                </div>
              ) : (
                <button onClick={async () => { try { const res = await apiFetch(`/api/scans/${id}/share`, { method: "POST" }); const d = await res.json() as { url?: string }; if (d.url) setShareUrl(d.url); } catch (_e) { console.error("Failed to share scan:", _e); /* noop */ } }} className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition">🔗 Share</button>
              )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-mono">{scan.address.slice(0, 12)}...</span>
          <span>{chains.length} chains</span>
          <span>{scan.result?.totals.tokenCount ?? scan.tokenCount} tokens</span>
          <span>{new Date(scan.createdAt).toLocaleString()}</span>
          {scan.result?.totals.chainsWithErrors ? <span className="text-yellow-300">⚠ {scan.result.totals.chainsWithErrors} with errors</span> : null}
        </div>
      </div>

      {chains.length > 0 ? (
        <ValueDistribution chains={chains} />
      ) : null}

      <div className="mt-6 space-y-3">
        {chainCards.map(({ chain, assets }) => (
          <div key={chain.chainKey} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{chain.chainName}</h3>
                <VmBadge vm={chain.vm as "EVM" | "SVM" | "COSMOS"} />
                {chain.degraded ? <span className="text-[10px] text-yellow-400">[DEGRADED]</span> : null}
              </div>
              <span className="font-mono text-sm font-semibold">{formatValue(chain.totals.valueEur)}</span>
            </div>

            {chain.errors.length > 0 ? (
              <div className="mb-2 text-[10px] text-yellow-300 bg-yellow-400/5 rounded px-2 py-1">
                {chain.errors.map((e, i) => <div key={i}>⚠ {e.message}</div>)}
              </div>
            ) : null}

            {assets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border/30">
                      <th className="text-left py-1 pr-2 font-normal">Asset</th>
                      <th className="text-right py-1 px-2 font-normal">Balance</th>
                      <th className="text-right py-1 px-2 font-normal">Price</th>
                      <th className="text-right py-1 pl-2 font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset, i) => (
                      <tr key={i} className="border-b border-border/20 last:border-0">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            {asset.logoUrl ? <img src={asset.logoUrl} alt="" className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : null}
                            <span className="font-medium">{asset.symbol}</span>
                            <span className="text-muted truncate max-w-[120px]">{asset.name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-muted">
                          {Number(asset.balance) < 0.0001 ? asset.balance.toExponential(2) : Number(asset.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-muted">
                          {asset.priceEur != null ? formatValue(asset.priceEur) : <span className="text-red-400/60">—</span>}
                        </td>
                        <td className="py-1.5 pl-2 text-right font-mono">
                          {asset.valueEur != null ? formatValue(asset.valueEur) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted text-center py-4">No assets with value</p>
            )}
          </div>
        ))}
      </div>

      {chains.length === 0 ? (
        <p className="text-center text-muted py-8">No chain data available for this scan.</p>
      ) : null}
    </>
  );
}
