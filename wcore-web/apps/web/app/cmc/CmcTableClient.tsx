"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { getApiUrl } from "@/lib/api";

interface CmcRow {
  rank: number;
  symbol: string;
  name: string;
  priceEur: number | null;
  marketCapEur: number | null;
}

function formatEur(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "\u2014";
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + " B\u20AC";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + " M\u20AC";
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

export function CmcTableClient({ endpoint, title }: { endpoint: string; title: string }) {
  const [rows, setRows] = useState<CmcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = getApiUrl();
      const url = fresh ? `${baseUrl}${endpoint}?fresh=true` : `${baseUrl}${endpoint}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) setRows(data.rows);
      else throw new Error(data.error || "invalid");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  return (
    <main className="w-full px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded bg-bg border border-border text-sm w-48 sm:w-64"
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {refreshing ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-red-400 mb-4">Error: {error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-2 w-12">#</th>
              <th className="py-2 pr-2">Symbol</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2 text-right">Price</th>
              <th className="py-2 text-right">Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted">Loading...</td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.rank ?? i} className="border-b border-border/50 hover:bg-bg-hover">
                <td className="py-1.5 pr-2 text-muted">{row.rank}</td>
                <td className="py-1.5 pr-2 font-medium">{row.symbol}</td>
                <td className="py-1.5 pr-2 text-muted">{row.name}</td>
                <td className="py-1.5 pr-2 text-right">{formatEur(row.priceEur)}</td>
                <td className="py-1.5 text-right">{formatEur(row.marketCapEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-muted">
        {filtered.length} row{filtered.length !== 1 ? "s" : ""}
        {filtered.length !== rows.length && ` (filtered from ${rows.length})`}
      </div>
    </main>
  );
}
