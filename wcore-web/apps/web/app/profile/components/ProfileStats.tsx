interface ProfileStatsProps {
  score: number;
  gmStreak: number;
  longestStreak: number;
  t: (key: string) => string;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold truncate">{value}</p>
    </div>
  );
}

export function ProfileStats({
  score,
  gmStreak,
  longestStreak,
  t,
}: ProfileStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatBox label={t("score")} value={String(score)} />
      <StatBox label={t("gmStreak")} value={`${gmStreak}d`} />
      <StatBox label={t("bestStreak")} value={`${longestStreak}d`} />
    </div>
  );
}
