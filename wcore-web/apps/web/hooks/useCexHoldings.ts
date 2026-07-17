"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainScan, TokenAsset } from "@wcore/shared";
import { apiFetch } from "@/lib/api";
import { cexFetch, type CexFetcher } from "@/lib/cex-api";
import { getCexStockLogoUrl } from "@/lib/cex-stock-logos";

// A synthetic ScanResult shape, identical to what useScanOrchestrator produces
// for on-chain wallets, so CEX accounts render as extra "wallet" cards and feed
// the global total + Wallets/Tokens tabs without special-casing the UI.
export interface CexScanResult {
  address: string;
  label: string;
  chains: ChainScan[];
  totalEur: number;
  error?: string;
  isCex: true;
}

export interface CexHoldingsState {
  sessionKey: string | null;
  results: CexScanResult[];
}

interface CexRequestContext {
  activeSessionKey: string | null;
  requestSessionKey: string;
  requestId: number;
  latestRequestId: number;
}

type CexRequestOutcome =
  | { type: "success"; results: CexScanResult[] }
  | { type: "failure"; status?: number };

export type CexRefreshOutcome =
  | { type: "success"; results: CexScanResult[] }
  | { type: "failure"; status?: number; previousResults: CexScanResult[] };

interface CexHoldingApi {
  id: string;
  symbol: string;
  bucket: string;
  balance: number;
  priceEur: number | null;
  valueEur: number | null;
  source: string;
  updatedAt: string;
}

interface CexAccountApi {
  id: string;
  provider: "binance" | "bitpanda" | "bitfinex" | "bybit" | "coinbase" | "okx" | "kraken";
  label: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  holdings: CexHoldingApi[];
}

const PROVIDER_LABEL: Record<string, string> = { binance: "Binance", bitpanda: "Bitpanda", bitfinex: "Bitfinex", bybit: "Bybit", coinbase: "Coinbase", okx: "OKX", kraken: "Kraken" };
const CEX_STALE_MESSAGE = "Showing last known CEX holdings because refresh failed";

export function resolveCexLoadFailure(previous: CexScanResult[], status?: number): CexScanResult[] {
  if (status === 401 || status === 403) return [];
  return previous.map((result) => ({
    ...result,
    chains: result.chains.map((chain) => ({
      ...chain,
      degraded: true,
      errors: [
        ...chain.errors.filter((error) => error.stage !== "sync" || error.message !== CEX_STALE_MESSAGE),
        { stage: "sync", message: CEX_STALE_MESSAGE },
      ],
    })),
  }));
}

export function resolveCexRequestTransition(
  previous: CexHoldingsState,
  context: CexRequestContext,
  outcome: CexRequestOutcome,
): CexHoldingsState {
  const current = previous.sessionKey === context.activeSessionKey
    ? previous
    : { sessionKey: context.activeSessionKey, results: [] };
  if (
    context.activeSessionKey == null
    || context.requestSessionKey !== context.activeSessionKey
    || context.requestId !== context.latestRequestId
  ) return current;
  return {
    sessionKey: context.activeSessionKey,
    results: outcome.type === "success"
      ? outcome.results
      : resolveCexLoadFailure(current.results, outcome.status),
  };
}

function holdingToToken(h: CexHoldingApi): TokenAsset {
  const logoUrl = h.bucket === "stocks" ? getCexStockLogoUrl(h.symbol) ?? undefined : undefined;
  return {
    contract: `${h.symbol}:${h.bucket}`,
    symbol: h.symbol,
    name: h.bucket === "spot" ? h.symbol : `${h.symbol} (${h.bucket})`,
    decimals: 0,
    balance: h.balance,
    priceEur: h.priceEur,
    priceSource: h.source ?? null,
    valueEur: h.valueEur,
    logoUrl,
    flags: [],
  };
}

function accountToScanResult(account: CexAccountApi): CexScanResult {
  const label = account.label ?? PROVIDER_LABEL[account.provider] ?? account.provider;
  const tokens = account.holdings.map(holdingToToken);
  const valueEur = Math.round(tokens.reduce((s, t) => s + (t.valueEur ?? 0), 0) * 100) / 100;
  const pricedCount = tokens.filter((t) => t.priceEur != null).length;
  const chain: ChainScan = {
    chainKey: `CEX_${account.provider.toUpperCase()}`,
    chainName: label,
    vm: "EVM",
    native: null,
    tokens,
    totals: { valueEur, tokenCount: tokens.length, pricedCount },
    errors: account.lastSyncError ? [{ stage: "sync", message: account.lastSyncError }] : [],
    degraded: account.lastSyncStatus === "error",
    fxRate: 0,
    scanMs: 0,
    cachedAt: account.lastSyncAt,
    scriptVersion: "cex",
  };
  return {
    address: `cex:${account.provider}:${account.id}`,
    label,
    chains: [chain],
    totalEur: valueEur,
    isCex: true,
  };
}

export function mapCexAccounts(accounts: CexAccountApi[]): CexScanResult[] {
  return accounts.map(accountToScanResult);
}

async function loadCexAccounts(fetcher: CexFetcher): Promise<{
  accounts?: CexAccountApi[];
  status?: number;
}> {
  const res = await cexFetch("/api/cex/accounts", {}, undefined, fetcher);
  if (!res.ok) return { status: res.status };
  const data = await res.json() as { accounts?: CexAccountApi[] };
  return { accounts: data.accounts ?? [] };
}

export async function refreshCexAccounts(fetcher: CexFetcher = apiFetch): Promise<CexRefreshOutcome> {
  let initial: Awaited<ReturnType<typeof loadCexAccounts>>;
  try {
    initial = await loadCexAccounts(fetcher);
  } catch (_e) {
    return { type: "failure", previousResults: [] };
  }
  if (!initial.accounts) {
    return { type: "failure", status: initial.status, previousResults: [] };
  }

  const previousResults = mapCexAccounts(initial.accounts);
  if (initial.accounts.length === 0) return { type: "success", results: [] };

  try {
    const responses = await Promise.allSettled(initial.accounts.map((account) =>
      cexFetch(`/api/cex/accounts/${account.id}/sync`, { method: "POST" }, undefined, fetcher)
    ));
    const failed = responses.find((result) => result.status === "fulfilled" && !result.value.ok);
    const rejected = responses.some((result) => result.status === "rejected");
    if (failed?.status === "fulfilled" || rejected) {
      return {
        type: "failure",
        status: failed?.status === "fulfilled" ? failed.value.status : undefined,
        previousResults,
      };
    }

    const fresh = await loadCexAccounts(fetcher);
    if (!fresh.accounts) {
      return { type: "failure", status: fresh.status, previousResults };
    }
    return { type: "success", results: mapCexAccounts(fresh.accounts) };
  } catch (_e) {
    return { type: "failure", previousResults };
  }
}

// Loads the user's CEX accounts (cached holdings from the last sync) and exposes
// them as synthetic ScanResults. Only fetches when authenticated.
export function useCexHoldings(connectedAddress: string | null) {
  const sessionKey = connectedAddress?.toLowerCase() ?? null;
  const [state, setState] = useState<CexHoldingsState>({ sessionKey, results: [] });
  const [isRefreshingCex, setIsRefreshingCex] = useState(false);
  const requestIdRef = useRef(0);
  const refreshIdRef = useRef(0);
  const latestSessionRef = useRef<string | null>(sessionKey);

  const reload = useCallback(async () => {
    const requestSessionKey = sessionKey;
    if (!requestSessionKey) {
      latestSessionRef.current = null;
      requestIdRef.current += 1;
      setState({ sessionKey: null, results: [] });
      return;
    }
    const requestId = ++requestIdRef.current;
    const applyOutcome = (outcome: CexRequestOutcome) => {
      setState((previous) => resolveCexRequestTransition(previous, {
        activeSessionKey: latestSessionRef.current,
        requestSessionKey,
        requestId,
        latestRequestId: requestIdRef.current,
      }, outcome));
    };
    try {
      const res = await cexFetch("/api/cex/accounts");
      if (!res.ok) { applyOutcome({ type: "failure", status: res.status }); return; }
      const data = await res.json() as { accounts?: CexAccountApi[] };
      applyOutcome({ type: "success", results: mapCexAccounts(data.accounts ?? []) });
    } catch (_e) {
      console.error("Failed to load CEX holdings for scan:", _e);
      applyOutcome({ type: "failure" });
    }
  }, [sessionKey]);

  const refresh = useCallback(async () => {
    const requestSessionKey = sessionKey;
    if (!requestSessionKey) return;
    const requestId = ++requestIdRef.current;
    const refreshId = ++refreshIdRef.current;
    setIsRefreshingCex(true);
    try {
      const outcome = await refreshCexAccounts();
      setState((previous) => {
        const seeded = outcome.type === "failure" && previous.results.length === 0
          ? { sessionKey: requestSessionKey, results: outcome.previousResults }
          : previous;
        return resolveCexRequestTransition(seeded, {
          activeSessionKey: latestSessionRef.current,
          requestSessionKey,
          requestId,
          latestRequestId: requestIdRef.current,
        }, outcome.type === "success"
          ? outcome
          : { type: "failure", status: outcome.status });
      });
    } finally {
      if (refreshId === refreshIdRef.current && requestSessionKey === latestSessionRef.current) {
        setIsRefreshingCex(false);
      }
    }
  }, [sessionKey]);

  useEffect(() => {
    latestSessionRef.current = sessionKey;
    requestIdRef.current += 1;
    refreshIdRef.current += 1;
    setIsRefreshingCex(false);
    setState((previous) => previous.sessionKey === sessionKey
      ? previous
      : { sessionKey, results: [] });
    if (sessionKey) void refresh();
  }, [refresh, sessionKey]);

  // Refresh when a CEX sync happens elsewhere (Profile > CEX dispatches this).
  useEffect(() => {
    const handler = () => { void reload(); };
    window.addEventListener("wcore-cex-updated", handler);
    return () => window.removeEventListener("wcore-cex-updated", handler);
  }, [reload]);

  const cexResults = state.sessionKey === sessionKey ? state.results : [];
  return { cexResults, reloadCex: reload, refreshCex: refresh, isRefreshingCex };
}
