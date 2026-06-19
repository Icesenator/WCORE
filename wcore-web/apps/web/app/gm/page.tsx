import { GmPageClient } from "./GmPageClient";

export default function GmPage() {
  return (
    <main className="mx-auto min-h-screen w-full px-4 py-8 sm:px-6 sm:py-12">

      <h1 className="mb-2 text-2xl font-bold">Say GM</h1>
      <p className="mb-8 text-sm text-muted">
        Deploy a contract on any supported chain and start earning. One GM per chain, per day.
      </p>

      <GmPageClient />
    </main>
  );
}
