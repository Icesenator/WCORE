import { SupportClient } from "./SupportClient";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <SupportClient />
    </main>
  );
}
