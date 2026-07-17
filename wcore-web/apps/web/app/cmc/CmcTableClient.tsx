"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";
import {
  filterMarketCapRows,
  getMarketSnapshotStatus,
  paginateMarketCapRows,
  parseMarketCapResponse,
  totalMarketCap,
  type MarketCapResponse,
  type MarketCapRow,
  type MarketKind,
} from "./market-cap";

interface CmcTableClientProps {
  endpoint: string;
  title: string;
  description: string;
  kind: MarketKind;
}

const EMPTY_ROWS: MarketCapRow[] = [];

const SNAPSHOT_LABELS = {
  loading: "Loading",
  unavailable: "Unavailable",
  "refresh-failed": "Refresh failed",
  stale: "Stale data",
  current: "Current",
} as const;

const compactEurFormatter = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatCompactEur(value: number | null): string {
  return value !== null && Number.isFinite(value) ? compactEurFormatter.format(value) : "-";
}

function formatPriceEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute > 0 && absolute < 0.01 ? 8 : absolute < 1 ? 6 : 2;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}

function formatSnapshotTime(generatedAt: string | undefined): string {
  if (!generatedAt) return "Waiting for data";
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isAbortError(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && value.name === "AbortError";
}

function MarketLogo({ row }: { row: MarketCapRow }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const initials = (row.symbol || row.name)
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg text-[11px] font-bold text-muted">
      <span aria-hidden="true" className={loaded ? "opacity-0" : "opacity-100"}>{initials}</span>
      {row.logoUrl && !broken ? (
        <img
          src={row.logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`absolute inset-0 h-full w-full bg-card object-contain p-1 transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth > 0) setLoaded(true);
            else setBroken(true);
          }}
          onError={() => setBroken(true)}
        />
      ) : null}
    </span>
  );
}

function SkeletonRows({ columns }: { columns: number }) {
  return Array.from({ length: 8 }, (_, index) => (
    <tr key={index} className="border-b border-border/60 last:border-0" aria-hidden="true">
      {Array.from({ length: columns }, (__, cellIndex) => (
        <td key={cellIndex} className="px-4 py-3">
          <div className={`h-4 animate-pulse rounded bg-border/60 ${cellIndex === 1 ? "w-40" : "ml-auto w-16"}`} />
        </td>
      ))}
    </tr>
  ));
}

export function CmcTableClient({ endpoint, title, description, kind }: CmcTableClientProps) {
  const [snapshotState, setSnapshotState] = useState<{ endpoint: string; data: MarketCapResponse } | null>(null);
  const [loadState, setLoadState] = useState({ endpoint, loading: true, refreshing: false });
  const [errorState, setErrorState] = useState<{ endpoint: string; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback((fresh = false) => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const requestEndpoint = endpoint;
    activeControllerRef.current = controller;
    setLoadState({ endpoint: requestEndpoint, loading: !fresh, refreshing: fresh });
    setErrorState(null);

    void (async () => {
      try {
        const baseUrl = getApiUrl();
        const response = await fetch(`${baseUrl}${requestEndpoint}${fresh ? "?fresh=true" : ""}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);

        const snapshot = parseMarketCapResponse(await response.json());
        if (requestId === requestIdRef.current) {
          setSnapshotState({ endpoint: requestEndpoint, data: snapshot });
        }
      } catch (cause) {
        if (!isAbortError(cause) && requestId === requestIdRef.current) {
          setErrorState({
            endpoint: requestEndpoint,
            message: cause instanceof Error ? cause.message : "Unable to load market data",
          });
        }
      } finally {
        if (requestId === requestIdRef.current) {
          activeControllerRef.current = null;
          setLoadState({ endpoint: requestEndpoint, loading: false, refreshing: false });
        }
      }
    })();
  }, [endpoint]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, [load]);

  const snapshot = snapshotState?.endpoint === endpoint ? snapshotState.data : null;
  const loading = loadState.endpoint !== endpoint || loadState.loading;
  const refreshing = loadState.endpoint === endpoint && loadState.refreshing;
  const error = errorState?.endpoint === endpoint ? errorState.message : null;
  const rows = snapshot?.rows ?? EMPTY_ROWS;
  const filteredRows = useMemo(() => filterMarketCapRows(rows, search), [rows, search]);
  const aggregateMarketCap = useMemo(() => totalMarketCap(rows), [rows]);
  const pagination = useMemo(
    () => paginateMarketCapRows(filteredRows, requestedPage),
    [filteredRows, requestedPage],
  );
  const isStock = kind === "stock";
  const columnCount = isStock ? 5 : 4;
  const snapshotStatus = getMarketSnapshotStatus(snapshot, loading, error);
  const snapshotNeedsAttention = snapshotStatus === "stale" || snapshotStatus === "refresh-failed";
  const snapshotUnavailable = snapshotStatus === "unavailable";
  const snapshotDetail = snapshotStatus === "refresh-failed"
    ? `Data retained from ${formatSnapshotTime(snapshot?.generatedAt)}`
    : snapshotStatus === "unavailable"
      ? "No snapshot available"
      : formatSnapshotTime(snapshot?.generatedAt);

  function handleSearchChange(value: string) {
    setSearch(value);
    setRequestedPage(1);
  }

  return (
    <main className="w-full px-4 py-5 sm:px-6 sm:py-7">
      <header className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              {isStock ? "Public companies ranking" : "Crypto assets ranking"}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base">{description}</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-muted lg:w-72">
              Search rankings
              <input
                type="search"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={isStock ? "Company, ticker, or country" : "Asset or ticker"}
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent sm:h-10"
              />
            </label>
            <button
              type="button"
              aria-label="Refresh market cap rankings"
              onClick={() => load(true)}
              disabled={refreshing || loading}
              className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <section aria-label="Market snapshot summary" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Ranked assets</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-fg">{loading ? "-" : rows.length.toLocaleString("en")}</p>
          <p className="mt-1 text-xs text-muted">Rows in this snapshot</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Total market cap</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-fg">{loading ? "-" : formatCompactEur(aggregateMarketCap)}</p>
          <p className="mt-1 text-xs text-muted">All loaded rankings</p>
        </div>
        <div className={`col-span-2 sm:col-span-1 rounded-xl border p-4 ${snapshotUnavailable ? "border-red-500/40 bg-red-500/5" : snapshotNeedsAttention ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card"}`} role="status" aria-live="polite">
          <p className="text-xs uppercase tracking-wider text-muted">Snapshot</p>
          <p className={`mt-2 text-sm font-semibold ${snapshotUnavailable ? "text-red-300" : snapshotNeedsAttention ? "text-amber-300" : snapshotStatus === "current" ? "text-accent" : "text-muted"}`}>
            {SNAPSHOT_LABELS[snapshotStatus]}
          </p>
          <p className="mt-1 text-xs text-muted">{snapshotDetail}</p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span aria-hidden="true">!</span>
          <span>{rows.length > 0 ? `Refresh failed. Showing the previous snapshot. ${error}` : `Unable to load rankings. ${error}`}</span>
        </div>
      ) : null}

      <section aria-label={`${title} rankings`} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 text-xs uppercase tracking-wider text-muted backdrop-blur">
              <tr className="border-b border-border">
                <th scope="col" className="w-16 px-4 py-3 text-left font-medium">Rank</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">{isStock ? "Company" : "Asset"}</th>
                {isStock ? <th scope="col" className="hidden px-4 py-3 text-left font-medium md:table-cell">Country</th> : null}
                <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Market cap</th>
              </tr>
            </thead>
            <tbody aria-live="polite">
              {loading && rows.length === 0 ? <SkeletonRows columns={columnCount} /> : null}
              {!loading && pagination.rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-muted">
                    {search.trim() ? `No rankings match "${search.trim()}".` : "No rankings are available for this snapshot."}
                  </td>
                </tr>
              ) : null}
              {pagination.rows.map((row) => (
                <tr key={`${row.rank}-${row.symbol}`} className="border-b border-border/60 transition-colors last:border-0 hover:bg-bg/60">
                  <td className="px-4 py-3 font-medium tabular-nums text-muted">{row.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <MarketLogo key={row.logoUrl ?? row.symbol} row={row} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-fg">{row.name}</p>
                        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">{row.symbol}</p>
                      </div>
                    </div>
                  </td>
                  {isStock ? <td className="hidden px-4 py-3 text-muted md:table-cell">{row.country || "-"}</td> : null}
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-fg">{formatPriceEur(row.priceEur)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-fg">{formatCompactEur(row.marketCapEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted" aria-live="polite">
            {filteredRows.length.toLocaleString("en")} result{filteredRows.length === 1 ? "" : "s"}
          </p>
          <nav aria-label="Market cap pagination" className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              aria-label="Go to previous rankings page"
              onClick={() => setRequestedPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="h-11 rounded-lg border border-border px-3 text-sm font-medium text-fg transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
            >
              Previous
            </button>
            <span className="min-w-24 text-center text-xs tabular-nums text-muted">Page {pagination.page} of {pagination.totalPages}</span>
            <button
              type="button"
              aria-label="Go to next rankings page"
              onClick={() => setRequestedPage(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="h-11 rounded-lg border border-border px-3 text-sm font-medium text-fg transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
            >
              Next
            </button>
          </nav>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">{refreshing ? "Refreshing market cap rankings" : ""}</p>
    </main>
  );
}
