import { LogoSpinner } from "./LogoSpinner";

export function PageSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <section className="space-y-5">
      <div className="flex justify-center py-6">
        <LogoSpinner className="h-14 w-14" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse">
          <div className="h-4 w-24 rounded bg-border" />
          <div className="mt-3 h-8 w-48 rounded bg-border" />
          <div className="mt-3 h-3 w-full rounded bg-border" />
          {i % 2 === 0 ? <div className="mt-2 h-3 w-4/5 rounded bg-border" /> : null}
        </div>
      ))}
    </section>
  );
}
