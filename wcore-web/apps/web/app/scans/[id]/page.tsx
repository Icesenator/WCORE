import { ScanDetailClient } from "./ScanDetailClient";

export const dynamic = "force-dynamic";

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <ScanDetailClient id={id} />
    </main>
  );
}
