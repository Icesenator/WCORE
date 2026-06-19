import Link from "next/link";

interface Scan {
  chains: string[];
  totalEur: number;
  tokenCount: number;
  createdAt: string;
}

interface RecentScansProps {
  scans: Scan[];
  formatValue: (v: number) => string;
}

export function RecentScans({ scans, formatValue }: RecentScansProps) {
  const recent = scans.slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Recent Scans</p>
      {recent.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">
          No scans yet.{" "}
          <Link href="/" className="text-accent hover:underline">
            Scan a wallet
          </Link>
        </p>
      ) : (
        <div className="space-y-2">
          {recent.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border border-border/60 bg-bg/30 px-3 py-2 text-sm"
            >
              <span className="text-muted text-xs">{new Date(s.createdAt).toLocaleDateString()}</span>
              <span className="text-xs">{s.chains.length} chains</span>
              <span className="text-xs">{s.tokenCount} tokens</span>
              <span className="font-mono text-sm font-semibold">{formatValue(s.totalEur)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
