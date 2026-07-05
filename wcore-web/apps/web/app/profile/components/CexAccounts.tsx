"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface CexHolding {
  id: string;
  symbol: string;
  bucket: string;
  balance: number;
  priceEur: number | null;
  valueEur: number | null;
  source: string;
  updatedAt: string;
}

export interface CexAccount {
  id: string;
  provider: "binance" | "bitpanda" | "bitfinex" | "bybit" | "coinbase" | "okx" | "kraken";
  label: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  holdings: CexHolding[];
}

export function CexAccounts({ formatValue }: { formatValue: (value: number) => string }) {
  const [accounts, setAccounts] = useState<CexAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [binanceApiKey, setBinanceApiKey] = useState("");
  const [binanceApiSecret, setBinanceApiSecret] = useState("");
  const [bitpandaApiKey, setBitpandaApiKey] = useState("");
  const [bitfinexApiKey, setBitfinexApiKey] = useState("");
  const [bitfinexApiSecret, setBitfinexApiSecret] = useState("");
  const [bybitApiKey, setBybitApiKey] = useState("");
  const [bybitApiSecret, setBybitApiSecret] = useState("");
  const [coinbaseApiKey, setCoinbaseApiKey] = useState("");
  const [coinbaseApiSecret, setCoinbaseApiSecret] = useState("");
  const [okxApiKey, setOkxApiKey] = useState("");
  const [okxApiSecret, setOkxApiSecret] = useState("");
  const [okxApiPassphrase, setOkxApiPassphrase] = useState("");
  const [krakenApiKey, setKrakenApiKey] = useState("");
  const [krakenApiSecret, setKrakenApiSecret] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts");
      const data = await res.json() as { accounts?: CexAccount[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load CEX accounts");
      setAccounts(data.accounts ?? []);
    } catch (_e) {
      console.error("Failed to load CEX accounts:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to load CEX accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const totalEur = useMemo(() => accounts.reduce((sum, account) => sum + account.holdings.reduce((s, h) => s + (h.valueEur ?? 0), 0), 0), [accounts]);

  const saveBinance = useCallback(async () => {
    setSaving("binance");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "binance", label: "Binance", apiKey: binanceApiKey.trim(), apiSecret: binanceApiSecret.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Binance");
      setBinanceApiKey("");
      setBinanceApiSecret("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Binance CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Binance");
    } finally {
      setSaving(null);
    }
  }, [binanceApiKey, binanceApiSecret, loadAccounts]);

  const saveBitpanda = useCallback(async () => {
    setSaving("bitpanda");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "bitpanda", label: "Bitpanda", apiKey: bitpandaApiKey.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Bitpanda");
      setBitpandaApiKey("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Bitpanda CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Bitpanda");
    } finally {
      setSaving(null);
    }
  }, [bitpandaApiKey, loadAccounts]);

  const saveBitfinex = useCallback(async () => {
    setSaving("bitfinex");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "bitfinex", label: "Bitfinex", apiKey: bitfinexApiKey.trim(), apiSecret: bitfinexApiSecret.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Bitfinex");
      setBitfinexApiKey("");
      setBitfinexApiSecret("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Bitfinex CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Bitfinex");
    } finally {
      setSaving(null);
    }
  }, [bitfinexApiKey, bitfinexApiSecret, loadAccounts]);

  const saveBybit = useCallback(async () => {
    setSaving("bybit");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "bybit", label: "Bybit", apiKey: bybitApiKey.trim(), apiSecret: bybitApiSecret.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Bybit");
      setBybitApiKey("");
      setBybitApiSecret("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Bybit CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Bybit");
    } finally {
      setSaving(null);
    }
  }, [bybitApiKey, bybitApiSecret, loadAccounts]);

  const saveCoinbase = useCallback(async () => {
    setSaving("coinbase");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "coinbase", label: "Coinbase", apiKey: coinbaseApiKey.trim(), apiSecret: coinbaseApiSecret.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Coinbase");
      setCoinbaseApiKey("");
      setCoinbaseApiSecret("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Coinbase CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Coinbase");
    } finally {
      setSaving(null);
    }
  }, [coinbaseApiKey, coinbaseApiSecret, loadAccounts]);

  const saveOkx = useCallback(async () => {
    setSaving("okx");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "okx", label: "OKX", apiKey: okxApiKey.trim(), apiSecret: okxApiSecret.trim(), apiPassphrase: okxApiPassphrase.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save OKX");
      setOkxApiKey("");
      setOkxApiSecret("");
      setOkxApiPassphrase("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save OKX CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save OKX");
    } finally {
      setSaving(null);
    }
  }, [okxApiKey, okxApiSecret, okxApiPassphrase, loadAccounts]);

  const saveKraken = useCallback(async () => {
    setSaving("kraken");
    setError(null);
    try {
      const res = await apiFetch("/api/cex/accounts", {
        method: "POST",
        body: JSON.stringify({ provider: "kraken", label: "Kraken", apiKey: krakenApiKey.trim(), apiSecret: krakenApiSecret.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Failed to save Kraken");
      setKrakenApiKey("");
      setKrakenApiSecret("");
      await loadAccounts();
    } catch (_e) {
      console.error("Failed to save Kraken CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Failed to save Kraken");
    } finally {
      setSaving(null);
    }
  }, [krakenApiKey, krakenApiSecret, loadAccounts]);

  const syncAccount = useCallback(async (account: CexAccount) => {
    setSyncing(account.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/cex/accounts/${account.id}/sync`, { method: "POST" });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Sync failed");
      await loadAccounts();
      // Let the /home scan view pick up the refreshed CEX holdings.
      try { window.dispatchEvent(new Event("wcore-cex-updated")); } catch { /* SSR-safe */ }
    } catch (_e) {
      console.error("Failed to sync CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Sync failed");
      await loadAccounts();
    } finally {
      setSyncing(null);
    }
  }, [loadAccounts]);

  const deleteAccount = useCallback(async (account: CexAccount) => {
    if (!confirm(`Remove ${account.label ?? account.provider}?`)) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/cex/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadAccounts();
      try { window.dispatchEvent(new Event("wcore-cex-updated")); } catch { /* SSR-safe */ }
    } catch (_e) {
      console.error("Failed to delete CEX account:", _e);
      setError(_e instanceof Error ? _e.message : "Delete failed");
    }
  }, [loadAccounts]);

  if (loading) return <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted">Loading CEX accounts...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">CEX Portfolio</p>
        <p className="mt-1 text-3xl font-bold text-fg">{formatValue(totalEur)}</p>
        <p className="mt-1 text-xs text-muted">Binance, Bitpanda, Bitfinex, Bybit, Coinbase, OKX and Kraken are tracked as separate exchange sources, not as on-chain wallets.</p>
      </div>

      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Binance API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only API key in <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">Binance API Management</a> (Spot + Earn read). Your key and secret are encrypted server-side and never leave WCORE.</p>
          <input value={binanceApiKey} onChange={(e) => setBinanceApiKey(e.target.value)} placeholder="API key" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={binanceApiSecret} onChange={(e) => setBinanceApiSecret(e.target.value)} placeholder="API secret" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveBinance} disabled={saving === "binance" || !binanceApiKey.trim() || !binanceApiSecret.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "binance" ? "Saving..." : "Save Binance"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Bitpanda API</p>
          <p className="mt-1 text-xs text-muted">Create a <a href="https://web.bitpanda.com/user/api-key" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">Bitpanda API key</a>. API key is encrypted server-side. Staking/Earn not exposed by Bitpanda public API.</p>
          <input value={bitpandaApiKey} onChange={(e) => setBitpandaApiKey(e.target.value)} placeholder="Bitpanda API key" type="password" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveBitpanda} disabled={saving === "bitpanda" || !bitpandaApiKey.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "bitpanda" ? "Saving..." : "Save Bitpanda"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Bitfinex API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only API key in <a href="https://setting.bitfinex.com/api" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">Bitfinex API</a> (Account Balances read). Your key and secret are encrypted server-side and never leave WCORE. Only the exchange (spot) wallet is synced.</p>
          <input value={bitfinexApiKey} onChange={(e) => setBitfinexApiKey(e.target.value)} placeholder="API key" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={bitfinexApiSecret} onChange={(e) => setBitfinexApiSecret(e.target.value)} placeholder="API secret" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveBitfinex} disabled={saving === "bitfinex" || !bitfinexApiKey.trim() || !bitfinexApiSecret.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "bitfinex" ? "Saving..." : "Save Bitfinex"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Bybit API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only API key with the <a href="https://www.bybit.eu/fr-EU/tax-api/" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">Bybit EU Tax API</a>. WCORE sends the encrypted key server-side to the EU CEX relay, which signs Bybit v5 requests. Unified and funding balances are synced.</p>
          <input value={bybitApiKey} onChange={(e) => setBybitApiKey(e.target.value)} placeholder="API key" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={bybitApiSecret} onChange={(e) => setBybitApiSecret(e.target.value)} placeholder="API secret" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveBybit} disabled={saving === "bybit" || !bybitApiKey.trim() || !bybitApiSecret.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "bybit" ? "Saving..." : "Save Bybit"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Coinbase API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only Coinbase Advanced Trade/CDP API key. Paste the full key name and EC private key. WCORE sends it server-side to the CEX relay for signed account reads.</p>
          <input value={coinbaseApiKey} onChange={(e) => setCoinbaseApiKey(e.target.value)} placeholder="API key name" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <textarea value={coinbaseApiSecret} onChange={(e) => setCoinbaseApiSecret(e.target.value)} placeholder="EC private key" rows={5} className="mt-2 w-full resize-y rounded border border-border bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
          <button type="button" onClick={saveCoinbase} disabled={saving === "coinbase" || !coinbaseApiKey.trim() || !coinbaseApiSecret.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "coinbase" ? "Saving..." : "Save Coinbase"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">OKX API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only OKX API key. WCORE sends the encrypted key, secret and passphrase server-side to the CEX relay, which signs OKX account and funding balance reads.</p>
          <input value={okxApiKey} onChange={(e) => setOkxApiKey(e.target.value)} placeholder="API key" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={okxApiSecret} onChange={(e) => setOkxApiSecret(e.target.value)} placeholder="API secret" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={okxApiPassphrase} onChange={(e) => setOkxApiPassphrase(e.target.value)} placeholder="API passphrase" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveOkx} disabled={saving === "okx" || !okxApiKey.trim() || !okxApiSecret.trim() || !okxApiPassphrase.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "okx" ? "Saving..." : "Save OKX"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-semibold text-fg">Kraken API</p>
          <p className="mt-1 text-xs text-muted">Create a read-only API key in <a href="https://www.kraken.com/u/security/api" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">Kraken API Management</a> (Query funds permission). WCORE calls the Kraken API directly from the server (no relay). Your key and secret are encrypted server-side.</p>
          <input value={krakenApiKey} onChange={(e) => setKrakenApiKey(e.target.value)} placeholder="API key" className="mt-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={krakenApiSecret} onChange={(e) => setKrakenApiSecret(e.target.value)} placeholder="API secret" type="password" className="mt-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" onClick={saveKraken} disabled={saving === "kraken" || !krakenApiKey.trim() || !krakenApiSecret.trim()} className="mt-3 rounded bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:opacity-50">
            {saving === "kraken" ? "Saving..." : "Save Kraken"}
          </button>
        </div>
      </div>

      {accounts.map((account) => {
        const accountTotal = account.holdings.reduce((sum, h) => sum + (h.valueEur ?? 0), 0);
        return (
          <div key={account.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold capitalize text-fg">{account.label ?? account.provider}</p>
                <p className="text-xs text-muted">Status: {account.lastSyncStatus ?? "not synced"}{account.lastSyncAt ? ` · ${new Date(account.lastSyncAt).toLocaleString()}` : ""}</p>
                {account.lastSyncError ? <p className="mt-1 text-xs text-red-300">{account.lastSyncError}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-accent">{formatValue(accountTotal)}</span>
                <button type="button" onClick={() => syncAccount(account)} disabled={syncing === account.id} className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent disabled:opacity-50">
                  {syncing === account.id ? "Syncing..." : "Sync"}
                </button>
                <button type="button" onClick={() => deleteAccount(account)} className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-fg">Remove</button>
              </div>
            </div>

            {account.holdings.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-bg/40 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Bucket</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.holdings.map((holding) => (
                      <tr key={holding.id} className="border-t border-border/50">
                        <td className="px-3 py-2 font-semibold text-fg">{holding.symbol}</td>
                        <td className="px-3 py-2 text-muted">{holding.bucket}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{holding.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{holding.priceEur == null ? "-" : formatValue(holding.priceEur)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-accent">{holding.valueEur == null ? "-" : formatValue(holding.valueEur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-4 text-sm text-muted">No holdings synced yet.</p>}
          </div>
        );
      })}
    </div>
  );
}
