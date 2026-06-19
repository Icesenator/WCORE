import { LogoSpinner } from "./LogoSpinner";

export function ScanSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex justify-center py-6">
        <LogoSpinner className="h-14 w-14" />
      </div>
      <div className="rounded-lg border border-border bg-card p-5 animate-pulse">
        <div className="h-3 w-20 rounded bg-border" />
        <div className="mt-3 h-8 w-48 rounded bg-border" />
        <div className="mt-3 h-3 w-64 rounded bg-border" />
      </div>

      {[1, 2].map((index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-5 animate-pulse">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="h-6 w-32 rounded bg-border" />
              <div className="mt-2 h-3 w-24 rounded bg-border" />
            </div>
            <div className="h-6 w-24 rounded bg-border" />
          </div>
          <div className="mt-4">
            <div className="h-3 w-full rounded bg-border" />
            <div className="mt-2 h-3 w-5/6 rounded bg-border" />
            <div className="mt-2 h-3 w-4/6 rounded bg-border" />
          </div>
        </div>
      ))}
    </section>
  );
}
