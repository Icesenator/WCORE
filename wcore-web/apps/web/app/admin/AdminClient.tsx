"use client";
import { getApiUrl } from "@/lib/api";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";

const API_URL = getApiUrl();

interface HealthDetail {
  status: string;
  service: string;
  version: string;
  uptimeSec: number;
  checks: { db: boolean; redis: boolean; openCircuits: number };
  alerting: boolean;
  circuits: Record<string, { state: string; failureCount: number; openedAt: number | null }>;
  metrics: {
    scans: number;
    rateLimits: Record<string, number>;
    cache: { redis: { hits: number; misses: number }; session: { hits: number; misses: number } };
    circuitBreaker: { trips: number; lastTrip: string | null };
  };
  gm: { last24h: number; last7d: number; last30d: number; total: number };
  recentScans: Array<{ address: string; chains: number; totalEur: number; at: string }>;
  chainCount: number;
  chainErrors: Array<{ chain: string; rpc: number; pricing: number; other: number }>;
  slowChains: Array<{ chain: string; avgMs: number; scans: number }>;
}

interface MetricHistory {
  snapshots: Array<{
    createdAt: string; status: string; dbOk: boolean; redisOk: boolean;
    openCircuits: number; rpcErrors: number; pricingErrors: number;
    scanCount: number; gm24h: number; gm7d: number; gm30d: number;
  }>;
  range: string;
  count: number;
}

interface OpsEventItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

interface PricingAccuracy {
  globalRatio: string;
  totalTokens: number;
  totalPriced: number;
  byChain: Array<{ chain: string; scans: number; tokensFound: number; pricedTokens: number; unpriced: number; ratio: string; pricingErrors: number; rpcErrors: number }>;
  unpricedTokens: Array<{ chain: string; symbol: string; name: string; contract: string }>;
  history: Array<{ at: string; pricing: number; rpc: number }>;
}

function Stat({ label, value, color = "text-fg" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function HistoryBar({ data, field, label, color }: { data: MetricHistory["snapshots"]; field: keyof MetricHistory["snapshots"][0]; label: string; color: string }) {
  const max = Math.max(1, ...data.map(d => Number(d[field]) || 0));
  return (
    <div>
      <p className="text-[10px] text-muted mb-1">{label} <span className="font-semibold text-fg">{data.reduce((s, d) => s + (Number(d[field]) || 0), 0)}</span></p>
      <div className="flex items-end gap-px h-12">
        {data.map((d, i) => {
          const val = Number(d[field]) || 0;
          const h = Math.max(2, (val / max) * 100);
          return <div key={i} className={`flex-1 ${color} rounded-t-sm opacity-70 hover:opacity-100 transition`} style={{ height: `${h}%` }} title={`${new Date(d.createdAt).toLocaleTimeString()}: ${val}`} />;
        })}
      </div>
    </div>
  );
}

function HistoryBarRaw({ data, label, color }: { data: Array<{ v: number; t: string }>; label: string; color: string }) {
  const max = Math.max(1, ...data.map(d => d.v));
  return (
    <div>
      <p className="text-[10px] text-muted mb-1">{label} <span className="font-semibold text-fg">{data.reduce((s, d) => s + d.v, 0)}</span></p>
      <div className="flex items-end gap-px h-12">
        {data.map((d, i) => {
          const h = Math.max(2, (d.v / max) * 100);
          return <div key={i} className={`flex-1 ${color} rounded-t-sm opacity-70 hover:opacity-100 transition`} style={{ height: `${h}%` }} title={`${new Date(d.t).toLocaleTimeString()}: ${d.v}`} />;
        })}
      </div>
    </div>
  );
}

export function AdminClient() {
  const { t } = usePreferences();
  const [tab, setTab] = useState<"overview" | "pricing">("overview");
  const [data, setData] = useState<HealthDetail | null>(null);
  const [history, setHistory] = useState<MetricHistory | null>(null);
  const [events, setEvents] = useState<OpsEventItem[]>([]);
  const [pricing, setPricing] = useState<PricingAccuracy | null>(null);
  const [eventFilter, setEventFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminToken, setAdminToken] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("wc_admin_token") ?? "";
    return "";
  });
  const [tokenInput, setTokenInput] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  const fetchAuth = useCallback(async (url: string): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (adminToken) headers["authorization"] = `Bearer ${adminToken}`;
    return fetch(url, { headers });
  }, [adminToken]);

  useEffect(() => {
    (async () => {
      try {
        const [hRes, mRes, eRes, pRes] = await Promise.all([
          fetchAuth(`${API_URL}/api/health/detailed`),
          fetchAuth(`${API_URL}/api/admin/metrics/history?range=24h`),
          fetchAuth(`${API_URL}/api/admin/events?limit=100`),
          fetchAuth(`${API_URL}/api/admin/pricing/accuracy`),
        ]);
        if (hRes.status === 401 || mRes.status === 401) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        setData(await hRes.json() as HealthDetail);
        setHistory(await mRes.json() as MetricHistory);
        const eData = await eRes.json() as { events: OpsEventItem[] };
        setEvents(eData.events || []);
        setPricing(await pRes.json() as PricingAccuracy);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    })();
  }, [adminToken, fetchAuth]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [hRes, eRes] = await Promise.all([
          fetchAuth(`${API_URL}/api/health/detailed`),
          fetchAuth(`${API_URL}/api/admin/events?limit=100`),
        ]);
        if (hRes.status === 401) return;
        setData(await hRes.json() as HealthDetail);
        const eData = await eRes.json() as { events: OpsEventItem[] };
        setEvents(eData.events || []);
      } catch { /* */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAuth]);

  if (loading) return <p className="text-muted">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  if (needsAuth) {
    const doLogin = () => {
      sessionStorage.setItem("wc_admin_token", tokenInput);
      setAdminToken(tokenInput);
      setNeedsAuth(false);
      setLoading(true);
    };
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold mb-4">Admin Access</h1>
        <p className="text-sm text-muted mb-4">This area requires an admin token.</p>
        <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="Admin token" className="w-full rounded border border-border bg-card px-4 py-3 text-fg outline-none focus:border-accent mb-3" autoFocus />
        <button onClick={doLogin} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-bg transition hover:opacity-90">Access Admin</button>
        <p className="text-[10px] text-muted mt-4 text-center">Set ADMIN_TOKEN in your environment to require authentication.</p>
      </div>
    );
  }

  if (!data) return null;

  const openCircuits = Object.entries(data.circuits).filter(([, v]) => v.state === "OPEN");

  return (
    <>
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <Link href="/" className="text-sm text-muted hover:text-fg">&larr; {t("home")}</Link>
        <span className="text-xs text-muted">auto-refresh 30s</span>
      </header>

      <h1 className="text-xl font-bold mb-6">Admin Dashboard</h1>

      <div className="flex gap-4 mb-6 border-b border-border">
        <button onClick={() => setTab("overview")} className={`pb-2 text-sm font-medium border-b-2 transition ${tab === "overview" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}>Overview</button>
        <button onClick={() => setTab("pricing")} className={`pb-2 text-sm font-medium border-b-2 transition ${tab === "pricing" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}>Pricing</button>
      </div>

      {tab === "pricing" ? (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Priced Ratio" value={`${pricing?.globalRatio ?? "?"}%`} color={Number(pricing?.globalRatio ?? 100) >= 80 ? "text-green-400" : Number(pricing?.globalRatio ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"} />
            <Stat label="Total Tokens" value={String(pricing?.totalTokens ?? 0)} />
            <Stat label="Priced" value={String(pricing?.totalPriced ?? 0)} />
            <Stat label="Unpriced" value={String((pricing?.totalTokens ?? 0) - (pricing?.totalPriced ?? 0))} color="text-red-400" />
          </div>
          {pricing?.history?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Pricing Errors (24h)</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HistoryBarRaw data={pricing.history.map(h => ({ v: h.pricing, t: h.at }))} label="Pricing Errors" color="bg-yellow-400" />
                <HistoryBarRaw data={pricing.history.map(h => ({ v: h.rpc, t: h.at }))} label="RPC Errors" color="bg-red-400" />
              </div>
            </div>
          ) : null}
          {pricing?.byChain?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Pricing by Chain</h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {pricing.byChain.map((c) => (
                  <div key={c.chain} className="flex items-center justify-between text-xs rounded border border-border/60 bg-bg/30 px-3 py-1.5">
                    <span className="capitalize w-24 truncate">{c.chain.replace(/_/g, " ")}</span>
                    <div className="flex-1 mx-2 h-2 rounded bg-bg">
                      <div className="h-2 rounded bg-green-400" style={{ width: `${c.ratio}%` }} />
                    </div>
                    <span className={`font-semibold w-12 text-right ${Number(c.ratio) >= 80 ? "text-green-400" : Number(c.ratio) >= 50 ? "text-yellow-400" : "text-red-400"}`}>{c.ratio}%</span>
                    <span className="text-muted w-16 text-right">{c.pricedTokens}/{c.tokensFound}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {pricing?.unpricedTokens?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Recent Unpriced Tokens</h2>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pricing.unpricedTokens.map((tok, i) => (
                  <div key={i} className="flex justify-between text-xs rounded border border-border/60 bg-bg/30 px-3 py-1.5">
                    <span className="text-muted">{tok.chain}</span>
                    <span className="font-semibold">{tok.symbol}</span>
                    <span className="text-muted truncate max-w-[120px]">{tok.name}</span>
                    <span className="font-mono text-[10px] text-muted">{tok.contract.slice(0, 10)}...</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Status" value={data.status} color={data.status === "ok" ? "text-green-400" : data.status === "degraded" ? "text-yellow-400" : "text-red-400"} />
            <Stat label="Uptime" value={`${Math.floor(data.uptimeSec / 60)}m`} />
            <Stat label="Scans" value={String(data.metrics.scans)} />
            <Stat label="Chains" value={String(data.chainCount)} />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="DB" value={data.checks.db ? "OK" : "DOWN"} color={data.checks.db ? "text-green-400" : "text-red-400"} />
            <Stat label="Redis" value={data.checks.redis ? "OK" : "DOWN"} color={data.checks.redis ? "text-green-400" : "text-red-400"} />
            <Stat label="Circuits" value={data.checks.openCircuits > 0 ? `${data.checks.openCircuits} OPEN` : "OK"} color={data.checks.openCircuits > 0 ? "text-red-400" : "text-green-400"} />
            <Stat label="Alerting" value={data.alerting ? "ON" : "OFF"} color={data.alerting ? "text-green-400" : "text-muted"} />
          </div>

          {openCircuits.length > 0 ? (
            <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/10 p-4">
              <h2 className="text-sm font-semibold text-red-400 mb-2">Open Circuit Breakers</h2>
              <div className="space-y-1">
                {openCircuits.map(([chain, c]) => (
                  <div key={chain} className="flex justify-between text-xs text-red-300/80">
                    <span className="capitalize">{chain.replace(/_/g, " ")}</span>
                    {/* eslint-disable-next-line react-hooks/purity */}
                    <span>{c.failureCount} failures, opened {c.openedAt ? `${Math.round((Date.now() - c.openedAt) / 1000)}s ago` : "?"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Ops Timeline ({events.length})</h2>
              <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="rounded border border-border bg-bg px-2 py-1 text-xs text-fg">
                <option value="">All</option>
                <option value="circuit_opened">Circuit opened</option>
                <option value="circuit_closed">Circuit closed</option>
                <option value="health_degraded">Health degraded</option>
                <option value="db_down">DB down</option>
              </select>
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted">No events yet</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {events.filter(e => !eventFilter || e.type === eventFilter).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs rounded border border-border/60 bg-bg/30 px-3 py-1.5">
                    <span className={`rounded-full w-2 h-2 shrink-0 ${e.severity === "critical" ? "bg-red-400" : e.severity === "warning" ? "bg-yellow-400" : "bg-blue-400"}`} />
                    <span className="text-muted w-16 shrink-0">{new Date(e.createdAt).toLocaleTimeString()}</span>
                    <span className="capitalize truncate">{e.message || e.type.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-2">GM Stats</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div><span className="text-muted">24h:</span> <span className="font-semibold">{data.gm.last24h}</span></div>
              <div><span className="text-muted">7d:</span> <span className="font-semibold">{data.gm.last7d}</span></div>
              <div><span className="text-muted">30d:</span> <span className="font-semibold">{data.gm.last30d}</span></div>
              <div><span className="text-muted">Total:</span> <span className="font-semibold">{data.gm.total}</span></div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-2">Rate Limit Hits</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
              {Object.entries(data.metrics.rateLimits).map(([k, v]) => (
                <div key={k}><span className="text-muted">{k}:</span> <span className="font-semibold">{v}</span></div>
              ))}
            </div>
          </div>

          {data.chainErrors?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-2">Top Errors by Chain</h2>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.chainErrors.map((c) => (
                  <div key={c.chain} className="flex justify-between text-xs rounded border border-border/60 bg-bg/30 px-3 py-1.5">
                    <span className="capitalize">{c.chain.replace(/_/g, " ")}</span>
                    <span className="text-red-400">{c.rpc > 0 ? `${c.rpc} RPC ` : ""}</span>
                    <span className="text-yellow-400">{c.pricing > 0 ? `${c.pricing} price ` : ""}</span>
                    <span className="text-muted">{c.other > 0 ? `${c.other} other` : ""}{c.rpc + c.pricing + c.other === 0 ? "✓ clean" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.slowChains?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-2">Slowest Chains</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                {data.slowChains.map((c) => (
                  <div key={c.chain} className="rounded border border-border/60 bg-bg/30 px-3 py-2">
                    <span className="capitalize font-medium block">{c.chain.replace(/_/g, " ")}</span>
                    <span className="text-muted">{(c.avgMs / 1000).toFixed(1)}s avg · {c.scans} scans</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {history?.snapshots?.length ? (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Metrics History (24h)</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HistoryBar data={history.snapshots} field="scanCount" label="Scans" color="bg-accent" />
                <HistoryBar data={history.snapshots} field="gm24h" label="GM 24h" color="bg-yellow-400" />
                <HistoryBar data={history.snapshots} field="rpcErrors" label="RPC Errors" color="bg-red-400" />
                <HistoryBar data={history.snapshots} field="pricingErrors" label="Price Errors" color="bg-orange-400" />
              </div>
              <p className="text-[10px] text-muted mt-2">{history.count} snapshots · every 5min · 7d retention</p>
            </div>
          ) : null}

          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-2">Recent Scans</h2>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.recentScans.map((s, i) => (
                <div key={i} className="flex justify-between text-xs rounded border border-border/60 bg-bg/30 px-3 py-1.5">
                  <span className="font-mono truncate">{s.address.slice(0, 12)}...</span>
                  <span className="text-muted">{s.chains}c</span>
                  <span className="font-semibold">{s.totalEur.toFixed(2)} EUR</span>
                  <span className="text-muted">{new Date(s.at).toLocaleDateString()}</span>
                </div>
              ))}
              {data.recentScans.length === 0 ? <p className="text-xs text-muted">No scans yet</p> : null}
            </div>
          </div>

          <p className="text-center text-[10px] text-muted">WCORE v{data.version}</p>
        </div>
      )}
    </>
  );
}
