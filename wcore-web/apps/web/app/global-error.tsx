"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="flex min-h-screen w-full items-center justify-center bg-gray-950 p-4 text-gray-100">
          <div className="max-w-md space-y-4 text-center">
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-gray-400">
              The application encountered a fatal error. Please reload the page.
            </p>
            {error.message && (
              <p className="break-all font-mono text-xs text-gray-500">{error.message}</p>
            )}
            <div className="flex justify-center gap-2">
              <button
                onClick={reset}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm transition-colors hover:bg-green-500"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm transition-colors hover:bg-gray-600"
              >
                Reload page
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
