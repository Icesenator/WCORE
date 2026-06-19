import { ScanSkeleton } from "@/components/ScanSkeleton";
import { Logo } from "@/components/Logo";

export default function WalletLoading() {
  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between sm:mb-8">
        <div className="flex items-center gap-2">
          <Logo className="h-5 w-5 text-accent/60 animate-pulse" />
          <span className="h-4 w-20 rounded bg-border animate-pulse" />
        </div>
        <span className="text-xs text-muted">Phase 5 MVP</span>
      </header>

      <div className="mb-6 sm:mb-8">
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-16 rounded bg-border" />
          <div className="h-5 w-full rounded bg-border" />
          <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3">
                <div className="h-3 w-12 rounded bg-border" />
                <div className="mt-1 h-5 w-20 rounded bg-border" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ScanSkeleton />
    </main>
  );
}
