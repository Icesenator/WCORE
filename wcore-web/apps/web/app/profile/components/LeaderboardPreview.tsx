interface LeaderboardEntry {
  address: string;
  score: number;
  gmStreak: number;
}

interface LeaderboardPreviewProps {
  leaderboard: LeaderboardEntry[];
  address: string | undefined;
}

export function LeaderboardPreview({ leaderboard, address }: LeaderboardPreviewProps) {
  const preview = leaderboard.slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Leaderboard</p>
      {preview.map((u, i) => (
        <div
          key={i}
          className={`flex items-center justify-between py-1.5 text-sm ${
            u.address.toLowerCase() === address?.toLowerCase() ? "text-accent font-semibold" : ""
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted w-5 shrink-0">{i + 1}.</span>
            <span className="font-mono text-xs truncate">{u.address.slice(0, 10)}...</span>
          </div>
          <span className="shrink-0 ml-2">
            {u.score} pts {u.gmStreak > 0 ? `🔥${u.gmStreak}d` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
