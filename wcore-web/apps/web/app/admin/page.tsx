import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="mx-auto w-full px-4 py-8">
      <AdminClient />
    </main>
  );
}
