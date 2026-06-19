"use client";

import { useEffect } from "react";

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("History error boundary:", error);
  }, [error]);

  return (
    <main className="flex min-h-[40vh] w-full items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold">History unavailable</h2>
        <p className="text-sm text-muted">
          Could not load your scan history. Your session is still active.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/30"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
