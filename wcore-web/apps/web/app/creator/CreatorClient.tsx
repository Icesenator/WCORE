"use client";
import { apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet, ConnectButton } from "@/components/ConnectButton";
import { SettingsBar } from "@/components/SettingsBar";
import { usePreferences } from "@/components/PreferencesProvider";
import { RevenueChart } from "./components/RevenueChart";
import { GmLogTable } from "./components/GmLogTable";
import { LogoSpinner } from "@/components/LogoSpinner";

import nativeSymbolsMap from "@/lib/chain-native-symbols.json";

interface CreatorStats {
  revenueByDay: Record<string, number>;
  totalRevenue: number;
  totalEthReceived: string;
  byChain: Record<string, string>;
  topSenders: Array<{ address: string; eth: string }>;
  gmLog: Array<{
    date: string;
    from: string;
    amount: number;
    chain: string;
    txHash: string;
    contractAddress: string;
  }>;
  contracts: number;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold truncate">{value}</p>
    </div>
  );
}

export function CreatorClient() {
  const { address } = useWallet();
  const { t } = usePreferences();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!address) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch("/api/creator/stats");
        const data = await res.json() as CreatorStats & { error?: string };
        if (!data.error) setStats(data);
      } catch {
        /* offline */
      }
      setLoading(false);
    })();
  }, [address]);

  if (loading) return <LogoSpinner className="h-16 w-16" />;

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="text-sm text-muted hover:text-fg">&larr; {t("home")}</Link>
        <Link href="/profile" className="text-xs text-muted hover:text-fg">Profile</Link>
        <div className="flex items-center gap-3">
          <SettingsBar />
          <ConnectButton />
        </div>
      </header>

      {!address ? (
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Creator Dashboard</h1>
          <p className="text-muted mb-4">Connect your wallet to view your creator stats</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <h1 className="text-lg font-bold">Creator Dashboard</h1>
            <p className="mt-1 text-xs text-muted font-mono break-all">{address}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total GMs" value={String(stats?.totalRevenue ?? 0)} />
            <StatCard label="Contracts" value={String(stats?.contracts ?? 0)} />
            <StatCard label="Total Tips" value={`${(Number(stats?.totalEthReceived ?? 0) / 1e18).toFixed(6)} gUSDT`} />
            <StatCard label="30d GMs" value={String(Object.values(stats?.revenueByDay ?? {}).reduce((a, b) => a + b, 0))} />
          </div>

          {stats?.topSenders?.length ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-3">Top Senders</h2>
              <div className="space-y-1.5">
                {stats.topSenders.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-border/60 bg-bg/30 px-3 py-1.5 text-xs">
                    <span className="font-mono truncate">{s.address}</span>
                    <span className="font-semibold text-accent ml-2 shrink-0">{s.eth} ETH</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stats?.byChain && Object.keys(stats.byChain).length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-3">Tips by Chain</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(stats.byChain).map(([chain, wei]) => (
                  <div key={chain} className="rounded border border-border/60 bg-bg/30 px-3 py-2 text-center">
                    <p className="text-xs text-muted capitalize">{chain.replace(/_/g, " ")}</p>
                    <p className="text-sm font-semibold text-accent">{(Number(wei) / 1e18).toFixed(6)} {(nativeSymbolsMap as Record<string, string>)[chain] || "NATIVE"}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <RevenueChart revenueByDay={stats?.revenueByDay ?? {}} />

          <GmLogTable gmLog={stats?.gmLog ?? []} />
        </div>
      )}
    </>
  );
}
