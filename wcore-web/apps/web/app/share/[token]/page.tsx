import { SharedScanClient } from "./SharedScanClient";

export const dynamic = "force-dynamic";

export default function SharedScanPage() {
  return (
    <main className="mx-auto w-full px-4 py-8">
      <SharedScanClient />
    </main>
  );
}
