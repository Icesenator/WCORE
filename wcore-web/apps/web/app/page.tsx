import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { getCoverageStats } from "@/lib/coverage";
import { HomePageClient } from "./HomePageClient";

export default function HomePage() {
  const coverage = getCoverageStats();
  return (
    <main className="mx-auto min-h-screen w-full px-4 py-6 sm:px-6 sm:py-8">
      <section className="mb-6 flex items-start gap-4 sm:gap-5" aria-labelledby="home-title">
        <Logo className="h-10 w-10 shrink-0 text-accent sm:h-12 sm:w-12" />
        <div className="min-w-0">
          <h1 id="home-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Your crypto. Every chain. One view.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Scan a public address. Review your assets across chains, selected DeFi positions and linked exchanges.</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Portfolio coverage">
            <li>{coverage.chainConfigCount} configured chains · 4 VMs</li>
            <li>{coverage.cexProviderCount} supported exchanges</li>
            <li>Selected DeFi positions</li>
            <li>Public-address scans are read-only</li>
          </ul>
        </div>
      </section>
      <Suspense fallback={null}>
        <HomePageClient coverage={coverage} />
      </Suspense>
    </main>
  );
}
