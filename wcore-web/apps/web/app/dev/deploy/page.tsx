import { DeployClient } from "./DeployClient";

export const dynamic = "force-dynamic";

export default function DeployPage() {
  return (
    <main className="mx-auto w-full px-4 py-10">
      <h1 className="mt-4 text-2xl font-bold mb-8">Deploy GM Contracts — Base</h1>
      <DeployClient />
    </main>
  );
}
