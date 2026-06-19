"use client";
import { getApiUrl } from "@/lib/api";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/components/PreferencesProvider";
import { VmBadge } from "@/components/ChainCard";
import { LogoSpinner } from "@/components/LogoSpinner";

const API_URL = getApiUrl();

interface SharedScan {
  id: string;
  address: string;
  chains: string[];
  totalEur: number;
  tokenCount: number;
  result: { chains?: Array<{ chainKey: string; chainName: string; vm: string; totals: { valueEur: number; tokenCount: number }; degraded: boolean }> } | null;
  createdAt: string;
  sharedAt: string;
}

export function SharedScanClient() {
  const { token: shareToken } = useParams<{ token: string }>();
  const { formatValue } = usePreferences();
  const [scan, setScan] = useState<SharedScan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/public/scans/${shareToken}`)
      .then(async (r) => {
        if (!r.ok) { setError(r.status === 410 ? "This shared scan has expired." : "Scan not found."); return; }
        setScan(await r.json() as SharedScan);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [shareToken]);

  if (loading) return <LogoSpinner className="h-12 w-12" />;
  if (error) return <div className="text-center"><p className="text-lg text-muted mb-4">{error}</p><Link href="/" className="text-accent text-sm hover:underline">Go to WCORE</Link></div>;
  if (!scan) return null;

  const chains = scan.result?.chains ?? [];

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-fg">&larr; WCORE</Link>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-card p-6 mb-6">
        <h1 className="text-xl font-bold mb-2">Shared Portfolio Report</h1>
        <p className="text-sm text-muted font-mono">{scan.address}</p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center"><p className="text-xs text-muted">Total Value</p><p className="text-xl font-bold">{formatValue(scan.totalEur)}</p></div>
          <div className="text-center"><p className="text-xs text-muted">Chains</p><p className="text-xl font-bold">{scan.chains.length}</p></div>
          <div className="text-center"><p className="text-xs text-muted">Tokens</p><p className="text-xl font-bold">{scan.tokenCount}</p></div>
        </div>
        <p className="mt-4 text-xs text-muted">Shared {scan.sharedAt ? new Date(scan.sharedAt).toLocaleDateString() : ""} · Scanned {new Date(scan.createdAt).toLocaleDateString()}</p>
      </div>

      {chains.length > 0 ? (
        <div className="space-y-3">
          {chains.map((chain) => (
            <div key={chain.chainKey} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{chain.chainName}</h3>
                  <VmBadge vm={chain.vm as "EVM" | "SVM" | "COSMOS"} />
                  {chain.degraded ? <span className="text-[10px] text-yellow-400">[DEGRADED]</span> : null}
                </div>
                <span className="font-mono text-sm font-semibold">{formatValue(chain.totals.valueEur)}</span>
              </div>
              <p className="text-xs text-muted">{chain.totals.tokenCount} tokens</p>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="mt-8 pt-4 border-t border-border text-center">
        <p className="text-xs text-muted">Powered by WCORE · <Link href="/" className="hover:underline">Try it yourself</Link></p>
      </footer>
    </>
  );
}
