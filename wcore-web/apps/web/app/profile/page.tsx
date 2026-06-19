import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const defaultTab = params.tab === "gm-contracts" ? "gm-contracts" : "points";

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      <ProfileClient defaultTab={defaultTab} />
    </main>
  );
}
