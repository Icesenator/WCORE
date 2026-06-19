"use client";
import { apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import Link from "next/link";

import { usePreferences } from "@/components/PreferencesProvider";
import { LogoSpinner } from "@/components/LogoSpinner";

interface ScanEntry {
  id: string;
  address: string;
  chains: string[];
  totalEur: number;
  tokenCount: number;
  createdAt: string;
}

export function ScansClient({ page }: { page: number }) {
  const { formatValue, t: _t } = usePreferences();
  const [scans, setScans] = useState<ScanEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/scans?page=${page}`)
      .then((r) => r.json())
      .then((d: { scans?: ScanEntry[]; totalPages?: number }) => {
        if (d.scans) setScans(d.scans);
        if (d.totalPages) setTotalPages(d.totalPages);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LogoSpinner className="h-16 w-16" />
      </div>
    );
  }

  return (
    <div>
      {scans.length === 0 ? (
        <p className="text-muted text-sm text-center py-8">No scans yet. <Link href="/" className="text-accent hover:underline">Scan a wallet</Link></p>
      ) : (
        <div className="space-y-3">
          {scans.map((scan) => (
            <Link
              key={scan.id}
              href={`/scans/${scan.id}`}
              className="block rounded-lg border border-border bg-card p-4 hover:border-accent/30 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-muted">{scan.address.slice(0, 12)}...</span>
                <span className="text-xs text-muted">{new Date(scan.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold">{formatValue(scan.totalEur)}</span>
                <span className="text-muted">{scan.chains.length} chains</span>
                <span className="text-muted">{scan.tokenCount} tokens</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/history?page=${page - 1}`}
            className={`rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-fg transition ${page <= 1 ? "pointer-events-none opacity-30" : ""}`}
          >&larr; Prev</Link>
          <Link
            href={`/history?page=${page + 1}`}
            className={`rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-fg transition ${page >= totalPages ? "pointer-events-none opacity-30" : ""}`}
          >Next &rarr;</Link>
        </div>
      ) : null}
    </div>
  );
}
