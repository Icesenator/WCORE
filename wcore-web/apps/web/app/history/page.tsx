import { ScansClient } from "./ScansClient";

export const dynamic = "force-dynamic";

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">

      <h1 className="mb-2 text-2xl font-bold">Scan History</h1>
      <p className="mb-8 text-sm text-muted">View your past wallet scans across all chains.</p>

      <ScansClient page={page} />
    </main>
  );
}
