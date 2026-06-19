// Pure server component — Next/Link doesn't require client runtime.
import Link from "next/link";

const PERIODS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export function PeriodSelector({ active }: { active: PeriodKey }) {
  return (
    <div className="mb-6 flex gap-2">
      {PERIODS.map((p) => {
        const isActive = active === p.key;
        return (
          <Link
            key={p.key}
            href={p.key === "all" ? "/leaderboard" : `/leaderboard?period=${p.key}`}
            scroll={false}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent text-white"
                : "border border-border bg-card text-muted hover:text-fg"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
