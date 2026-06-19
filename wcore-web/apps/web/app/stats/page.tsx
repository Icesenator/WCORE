// React Server Component — fetched at request time, rendered to HTML on
// the server. NavHeader is client-side.
import { getApiUrl } from "@/lib/api";
import Link from "next/link";
const API_URL = getApiUrl();

interface StatsData {
  uptimeSec: number;
  scans: { total: number; byChain: Record<string, { scans: number; totalMs: number; tokensFound: number; pricedTokens: number; rpcErrors: number; pricingErrors: number }> };
  cache: { redis: { hits: number; misses: number }; session: { hits: number; misses: number } };
  errors: { rpcTotal: number; pricingTotal: number; byChain: Record<string, { rpc: number; pricing: number; other: number }> };
  rateLimits: { scanHits: number; authHits: number };
  circuitBreaker: { trips: number; lastTrip: string | null };
  circuit: { state: string; failureCount: number };
  chainCount: number;
  startTime: string;
}

// Render at request time only — the page depends on a live /api/stats
// response and we don't want the build to fail just because the API isn't
// reachable. Visitors still share work via the per-request data cache below.
export const dynamic = "force-dynamic";

async function loadStats(): Promise<StatsData | null> {
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const data = await res.json() as Partial<StatsData>;
    // Drop responses that don't carry the expected shape (older API
    // deploys, error pages parsed as JSON, etc.). Avoids JSX crashes.
    if (!data || !data.scans || !data.circuit || !data.cache || !data.errors) return null;
    return data as StatsData;
  } catch {
    return null;
  }
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function hitRate(h: number, m: number): string {
  const total = h + m;
  if (total === 0) return "—";
  return ((h / total) * 100).toFixed(0) + "%";
}

export default async function StatsPage() {
  const stats = await loadStats();

  if (!stats) {
    return (
      <main className="mx-auto w-full px-4 py-16 text-center">
        <p className="text-muted mb-4">Stats unavailable</p>
        <Link href="/stats" className="text-accent hover:underline text-sm">Retry</Link>
      </main>
    );
  }

  const topChains = Object.entries(stats.scans.byChain)
    .sort((a, b) => b[1].scans - a[1].scans)
    .slice(0, 10);

  const worstErrors = Object.entries(stats.errors.byChain)
    .filter(([, e]) => e.rpc + e.pricing > 0)
    .sort((a, b) => (b[1].rpc + b[1].pricing) - (a[1].rpc + a[1].pricing))
    .slice(0, 10);

  const avgScanMs = stats.scans.total > 0
    ? (topChains.reduce((s, [, c]) => s + c.totalMs, 0) / stats.scans.total / 1000).toFixed(1)
    : "—";

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">

      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stats</h1>
        <span className="text-xs text-muted">Uptime: {formatUptime(stats.uptimeSec)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <MetricBox label="Scans" value={String(stats.scans.total)} />
        <MetricBox label="Avg Scan" value={`${avgScanMs}s`} />
        <MetricBox label="Rate Limit Hits" value={String(stats.rateLimits.scanHits)} />
        <MetricBox label="Circuit" value={stats.circuit.state} color={stats.circuit.state === "OPEN" ? "text-red-400" : "text-green-400"} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <CacheCard title="Redis" hits={stats.cache.redis.hits} misses={stats.cache.redis.misses} />
        <CacheCard title="Session" hits={stats.cache.session.hits} misses={stats.cache.session.misses} />
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Errors</p>
          <div className="flex gap-4 text-sm">
            <span className="text-yellow-300">RPC: {stats.errors.rpcTotal}</span>
            <span className="text-orange-300">Pricing: {stats.errors.pricingTotal}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Top Chains by Scans</p>
          {topChains.map(([key, c]) => (
            <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
              <span className="font-mono text-muted">{key}</span>
              <div className="flex gap-3">
                <span>{c.scans} scans</span>
                <span className="text-muted">{(c.totalMs / 1000).toFixed(0)}s</span>
                <span>{c.pricedTokens}/{c.tokensFound} priced</span>
              </div>
            </div>
          ))}
          {topChains.length === 0 ? <p className="text-xs text-muted">No scans yet</p> : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Worst Chains (Errors)</p>
          {worstErrors.map(([key, e]) => (
            <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
              <span className="font-mono text-muted">{key}</span>
              <div className="flex gap-3">
                {e.rpc > 0 ? <span className="text-yellow-300">RPC:{e.rpc}</span> : null}
                {e.pricing > 0 ? <span className="text-orange-300">Price:{e.pricing}</span> : null}
                {e.other > 0 ? <span className="text-muted">Other:{e.other}</span> : null}
              </div>
            </div>
          ))}
          {worstErrors.length === 0 ? <p className="text-xs text-muted">No errors</p> : null}
        </div>
      </div>
    </main>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color || "text-fg"}`}>{value}</p>
    </div>
  );
}

function CacheCard({ title, hits, misses }: { title: string; hits: number; misses: number }) {
  const total = hits + misses;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{title} Cache</p>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-2xl font-bold">{hitRate(hits, misses)}</span>
        <span className="text-xs text-muted">hit rate</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: total > 0 ? `${(hits / total) * 100}%` : "0%" }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-muted">
        <span>{hits} hits</span>
        <span>{misses} misses</span>
      </div>
    </div>
  );
}
