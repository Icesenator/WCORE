interface PointsBreakdownData {
  offChain: { days: number; points: number; detail: string };
  onChain: { count: number; points: number; detail: string };
  perChain: Array<{ chain: string; streak: number }>;
  quests: Array<{ key: string; title: string; points: number }>;
  questPts: number;
}

interface PointsBreakdownProps {
  breakdown: PointsBreakdownData | null;
  totalScore: number;
}

export function PointsBreakdown({ breakdown, totalScore }: PointsBreakdownProps) {
  if (!breakdown) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Points breakdown</p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Off-chain GM</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted">{breakdown.offChain.detail}</span>
            <span className="font-mono text-accent font-semibold">+{breakdown.offChain.points}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">On-chain GM</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted">{breakdown.onChain.detail}</span>
            <span className="font-mono text-accent font-semibold">+{breakdown.onChain.points}</span>
          </span>
        </div>
        {breakdown.perChain.length > 0 ? (
          <div>
            <span className="text-muted">Per-chain bonuses</span>
              {breakdown.perChain.map((cg) => (
                <div key={cg.chain} className="flex items-center justify-between ml-4 text-xs text-muted">
                  <span>{cg.chain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  <span>{cg.streak}d streak</span>
                </div>
              ))}
          </div>
        ) : null}
        {breakdown.questPts > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-muted">Quests</span>
            <span className="font-mono text-muted">+{breakdown.questPts}</span>
          </div>
        ) : null}
        <div className="border-t border-border/50 pt-2 flex items-center justify-between font-semibold">
          <span>Total</span>
          <span className="font-mono text-accent">{totalScore} pts</span>
        </div>
      </div>
    </div>
  );
}
