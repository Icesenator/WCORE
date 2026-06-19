import { CreatorClient } from "./CreatorClient";

export const dynamic = "force-dynamic";

export default function CreatorPage() {
  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <CreatorClient />
    </main>
  );
}
