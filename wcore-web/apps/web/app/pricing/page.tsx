import { PricingClient } from "./PricingClient";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <main className="mx-auto w-full px-4 py-8">

      <h1 className="text-2xl font-bold mb-2">Pricing</h1>
      <p className="text-muted mb-8">Choose the plan that fits your needs.</p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
        <PricingClient />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted mb-2">Enterprise or custom needs?</p>
        <a href="mailto:straub.florian88.fs@gmail.com" className="text-accent text-sm hover:underline">Contact us</a>
      </div>
    </main>
  );
}
