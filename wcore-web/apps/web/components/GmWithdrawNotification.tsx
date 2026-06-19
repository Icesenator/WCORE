"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/ConnectButton";
import { useRouter } from "next/navigation";
import { hasWithdrawableBalance, useGmContracts, weiToNative } from "@/hooks/useGmContracts";
import { getApiUrl } from "@/lib/api";
import { usePreferences } from "./PreferencesProvider";

export function GmWithdrawNotification() {
  const { address, authStep } = useWallet();
  const { formatValue } = usePreferences();
  const router = useRouter();
  const { contracts, refreshContracts } = useGmContracts(authStep === "authenticated" ? address : null);
  const lastKnownCount = useRef(0);
  const lastRefreshTs = useRef(0);
  const [displayCount, setDisplayCount] = useState(0);
  const [nativePrices, setNativePrices] = useState<Record<string, number>>({});

  const withdrawableContracts = useMemo(() => contracts.filter((contract) => (
    hasWithdrawableBalance(contract.creatorBalance) || hasWithdrawableBalance(contract.platformBalance)
  )), [contracts]);

  const withdrawableCount = withdrawableContracts.length;

  // Fetch native prices for chains with withdrawable fees
  useEffect(() => {
    const chains = [...new Set(withdrawableContracts.map(c => c.chainKey))];
    if (!chains.length) return;
    const API_URL = getApiUrl();
    Promise.all(chains.map(ck =>
      fetch(`${API_URL}/api/price/native?chain=${encodeURIComponent(ck)}`)
        .then(r => r.json()).then(d => ({ ck, price: (d as { price?: number }).price }))
        .catch(() => ({ ck, price: undefined }))
    )).then(results => {
      const prices: Record<string, number> = {};
      for (const { ck, price } of results) {
        if (price) prices[ck] = price;
      }
      setNativePrices(prices);
    }).catch(() => {});
  }, [withdrawableContracts]);

  // Total EUR value of withdrawable fees
  const totalValueEur = useMemo(() => {
    let total = 0;
    for (const c of withdrawableContracts) {
      const price = nativePrices[c.chainKey];
      if (!price) continue;
      if (hasWithdrawableBalance(c.creatorBalance)) total += weiToNative(c.creatorBalance ?? "0") * price;
      if (hasWithdrawableBalance(c.platformBalance)) total += weiToNative(c.platformBalance ?? "0") * price;
    }
    return total;
  }, [withdrawableContracts, nativePrices]);

  useEffect(() => {
    if (withdrawableCount > 0) {
      lastKnownCount.current = withdrawableCount;
      setDisplayCount(withdrawableCount);
    } else {
      setDisplayCount(lastKnownCount.current);
    }
  }, [withdrawableCount]);

  useEffect(() => {
    const interval = setInterval(refreshContracts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshContracts]);

  useEffect(() => {
    const refresh = () => { void refreshContracts(); lastRefreshTs.current = Date.now(); };
    // Tab-switch (focus) fires the N+1 RPC chain in useGmContracts. Debounce 30s.
    const refreshDebounced = () => {
      if (Date.now() - lastRefreshTs.current < 30_000) return;
      refresh();
    };
    window.addEventListener("wcore-gm-done", refresh);
    window.addEventListener("focus", refreshDebounced);
    return () => {
      window.removeEventListener("wcore-gm-done", refresh);
      window.removeEventListener("focus", refreshDebounced);
    };
  }, [refreshContracts]);

  if (!address || authStep !== "authenticated" || displayCount === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        router.push("/profile?tab=gm-contracts");
      }}
      className="relative flex items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-400 hover:bg-amber-500/20 transition text-xs font-medium"
      title={`${displayCount} GM contract${displayCount > 1 ? "s" : ""} with withdrawable tips${totalValueEur > 0 ? ` (${formatValue(totalValueEur)})` : ""}`}
    >
      <span className="mr-1">💸</span>
      <span className="hidden sm:inline">{displayCount} withdrawable{totalValueEur > 0 ? ` (${formatValue(totalValueEur)})` : ""}</span>
      <span className="sm:hidden">{displayCount}</span>
    </button>
  );
}
