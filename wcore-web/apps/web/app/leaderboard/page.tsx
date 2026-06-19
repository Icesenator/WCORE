// React Server Component. Period is read from ?period= so server-side
// fetching can vary the cache by URL. NavHeader is client-side.
import { getApiUrl } from "@/lib/api";
import { PeriodSelector, type PeriodKey } from "./PeriodSelector";

const API_URL = getApiUrl();
const VALID_PERIODS: ReadonlySet<PeriodKey> = new Set<PeriodKey>(["7d", "30d", "all"]);

interface LeaderboardEntry {
  address: string;
  score: number;
  gmStreak: number;
  longestStreak: number;
  totalContractsDeployed: number;
  totalTipsReceived: number;
  streakRecord: number;
  gmCount: number;
}

// Render at request time only — depends on live API. Build never blocks.
export const dynamic = "force-dynamic";

async function loadLeaderboard(period: PeriodKey): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard/stats?period=${period}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as { leaderboard?: LeaderboardEntry[] };
    return data.leaderboard ?? [];
  } catch {
    return [];
  }
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const requested = sp.period as PeriodKey | undefined;
  const period: PeriodKey = requested && VALID_PERIODS.has(requested) ? requested : "all";
  const users = await loadLeaderboard(period);

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">

      <h1 className="mb-8 text-2xl font-bold">Leaderboard</h1>

      <PeriodSelector active={period} />

      <section className="mb-10 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted">How to earn points</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="font-medium text-fg mb-2">🌐 Off-chain GM</p>
            <p className="text-xs text-muted mb-2">Daily greeting, free, 1×/day</p>
            <ul className="space-y-1 ml-3 text-muted text-xs">
              <li><span className="text-accent font-mono">+10</span> First day</li>
              <li><span className="text-accent font-mono">+10+N</span> Day N streak</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="font-medium text-fg mb-2">⛽ On-chain GM</p>
            <ul className="space-y-1 ml-3 text-muted text-xs">
              <li><span className="text-accent font-mono">+20</span> Base points</li>
              <li><span className="text-accent font-mono">+2N</span> Streak bonus</li>
              <li><span className="text-accent font-mono">+5</span> Per-chain bonus</li>
              <li><span className="text-accent font-mono">+N</span> Chain streak</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="font-medium text-fg mb-2">🚀 GM Contract Creator</p>
            <ul className="space-y-1 ml-3 text-muted text-xs">
              <li>Deploy on any supported chain</li>
              <li>Earn <span className="text-accent font-mono">50%</span> of GM tips</li>
              <li>Unlock per-chain GM</li>
              <li>Withdraw anytime from Profile</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="font-medium text-fg mb-2">💰 Fees</p>
            <ul className="space-y-1 ml-3 text-muted text-xs">
              <li>All fees in native chain asset</li>
              <li><span className="text-accent font-mono">50%</span> creator, <span className="text-accent font-mono">50%</span> platform</li>
              <li>Funds maintenance &amp; future dev</li>
              <li>🎁 <span className="text-accent">Potential airdrop</span> for active users</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="font-medium text-fg mb-2">🔗 Referral Program</p>
            <ul className="space-y-1 ml-3 text-muted text-xs">
              <li>Share from <span className="text-fg font-medium">Profile</span></li>
              <li>Earn <span className="text-accent font-mono">+10%</span> of referral points</li>
              <li>Follow <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a></li>
            </ul>
          </div>
        </div>
      </section>

      <div className="space-y-1">
        {users.filter(u => u.score > 0).length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No users yet. Connect and scan to appear here.</p>
        ) : (
          users.filter(u => u.score > 0).map((u, i) => (
            <div key={u.address} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${i < 3 ? "border-accent/30 bg-accent/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-3">
                <span className={`w-6 text-center font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-muted"}`}>
                  {i + 1}
                </span>
                <span className="font-mono text-xs">{u.address.slice(0, 10)}...</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                <span className="font-semibold">{u.score} pts</span>
                <span className="text-muted">{u.totalContractsDeployed} ctr</span>
                <span className="text-muted">{u.totalTipsReceived} tips</span>
                {u.streakRecord > 0 ? <span className="text-accent">🔥 {u.streakRecord}d</span> : null}
                <span className="text-muted">{u.gmCount} gms</span>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
