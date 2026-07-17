import { Logo } from "@/components/Logo";
import { HomePageClient } from "./HomePageClient";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full px-4 py-8 sm:px-6 sm:py-12">

      <section className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-[#627EEA]/20 blur-xl" />
          <div className="absolute top-8 right-12 w-16 h-16 rounded-full bg-[#9945FF]/20 blur-xl" />
          <div className="absolute bottom-4 left-1/3 w-24 h-24 rounded-full bg-[#14B8A6]/20 blur-xl" />
          <div className="absolute -bottom-4 -right-4 w-28 h-28 rounded-full bg-accent/10 blur-2xl" />
        </div>

        <div className="relative flex items-center gap-4 mb-3">
          <Logo className="h-12 w-12 text-accent/80 shrink-0" />
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl text-fg">Your crypto. Every chain. One view.</h2>
            <p className="text-sm text-muted mt-0.5">183 chains. 4 VMs. Selected DeFi positions. Real-time pricing, on-chain GM, 7 CEX.</p>
          </div>
        </div>

        <div className="relative grid gap-1.5 grid-cols-3 lg:grid-cols-6 mt-4">
          <MiniCard icon="⛓️" label="183 chains" />
          <MiniCard icon="🏦" label="7 CEX" />
          <MiniCard icon="🌊" label="TON support" />
          <MiniCard icon="🛡️" label="Read-only" />
          <MiniCard icon="⚡" label="Live pricing" />
          <MiniCard icon="⛽" label="80+ GM chains" />
          <MiniCard icon="🚩" label="Scam detection" />
          <MiniCard icon="👛" label="Multi-wallet" />
          <MiniCard icon="🏆" label="Leaderboard" />
          <MiniCard icon="🪙" label="Custom tokens" />
          <MiniCard icon="📊" label="CSV Export" />
          <MiniCard icon="🌐" label="DeFi positions" />
        </div>
      </section>

      <HomePageClient />
    </main>
  );
}

function MiniCard({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted">
      <span className="text-sm shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
