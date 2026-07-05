"use client";
import { useCallback, useEffect, useState } from "react";
import type { ChainScan, TokenAsset } from "@wcore/shared";
import { apiFetch } from "@/lib/api";
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

// Loads the user's CEX accounts (cached holdings from the last sync) and exposes
// them as synthetic ScanResults. Only fetches when authenticated.
export function useCexHoldings(enabled: boolean) {
  const [cexResults, setCexResults] = useState<CexScanResult[]>([]);

  const reload = useCallback(async () => {
    if (!enabled) { setCexResults([]); return; }
    try {
      const res = await apiFetch("/api/cex/accounts");
      if (!res.ok) { setCexResults([]); return; }
      const data = await res.json() as { accounts?: CexAccountApi[] };
      const accounts = (data.accounts ?? []).filter((a) => a.holdings.length > 0);
      setCexResults(accounts.map(accountToScanResult));
    } catch (_e) {
      console.error("Failed to load CEX holdings for scan:", _e);
      setCexResults([]);
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  // Refresh when a CEX sync happens elsewhere (Profile > CEX dispatches this).
  useEffect(() => {
    const handler = () => { void reload(); };
    window.addEventListener("wcore-cex-updated", handler);
    return () => window.removeEventListener("wcore-cex-updated", handler);
  }, [reload]);

  return { cexResults, reloadCex: reload };
}
