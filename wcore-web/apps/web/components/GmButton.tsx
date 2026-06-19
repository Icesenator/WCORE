"use client";
import { getApiUrl, apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "./ConnectButton";
import { Logo } from "./Logo";
import { useOnChainGm } from "@/hooks/useOnChainGm";
import { lsAnyGmDoneToday } from "@/lib/gm-storage";

const API_URL = getApiUrl();

export function GmButton() {
  const { address, authStep } = useWallet();
  const isAuthenticated = authStep === "authenticated";
  const [streak, setStreak] = useState<number | null>(null);
  const [alreadyOffChain, setAlreadyOffChain] = useState(false);
  const [alreadyOnChain, setAlreadyOnChain] = useState(false);
  const [offchainSending, setOffchainSending] = useState(false);
  const [showChoice, setShowChoice] = useState(false);

  const { sendGm, sending } = useOnChainGm({
    walletAddress: address,
    streak: streak ?? 0,
  });

  // Fetch GM status from DB (cross-device persistent, no localStorage)
  const fetchGmStatus = useCallback(() => {
    apiFetch(`${API_URL}/api/auth/me`)
      .then(r => {
        if (!r.ok) return;
        return r.json();
      })
      .then((d: { gmStreak?: number; gmOffChainToday?: boolean; gmOnChainToday?: boolean } | void) => {
        if (d && d.gmStreak != null) setStreak(d.gmStreak);
        if (d) setAlreadyOffChain(!!d.gmOffChainToday);
        if (d) setAlreadyOnChain(!!d.gmOnChainToday || lsAnyGmDoneToday());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) return;
    fetchGmStatus();

    // Listen for GM done events from other components. For on-chain GM, the
    // backend recording is fire-and-forget and can lag behind the transaction;
    // keep the Header disabled immediately instead of letting a stale DB fetch
    // flip it back to clickable.
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { chain?: string } | undefined;
      if (detail?.chain) setAlreadyOnChain(true);
      fetchGmStatus();
    };
    window.addEventListener("wcore-gm-done", handler);
    window.addEventListener("focus", fetchGmStatus);
    return () => {
      window.removeEventListener("wcore-gm-done", handler);
      window.removeEventListener("focus", fetchGmStatus);
    };
  }, [address, fetchGmStatus]);

  const doOffChainGm = useCallback(async () => {
    if (alreadyOffChain || offchainSending) return;
    setOffchainSending(true);
    setShowChoice(false);
    try {
      const res = await apiFetch(`${API_URL}/api/gm`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json() as { error?: string; streak?: number };
      if (data.error) { alert(data.error); return; }
      setStreak(data.streak ?? streak);
      fetchGmStatus();
      window.dispatchEvent(new CustomEvent("wcore-gm-done"));
    } catch (_e) { console.error("Off-chain GM failed:", _e); alert("GM failed"); }
    finally { setOffchainSending(false); }
  }, [alreadyOffChain, offchainSending, streak, fetchGmStatus]);

  const doOnChainGm = useCallback(async () => {
    if (!address || sending) return;
    setShowChoice(false);
    try {
      await sendGm();
      setAlreadyOnChain(true);
      fetchGmStatus(); // re-fetch from DB instead of localStorage
    } catch (e) {
      alert((e as Error).message || "On-chain GM failed");
    }
  }, [address, sending, sendGm, fetchGmStatus]);

  if (!isAuthenticated) return null;

  const hasDoneAnyGm = alreadyOffChain || alreadyOnChain;
  const offchainDisabled = alreadyOffChain || alreadyOnChain || offchainSending;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { fetchGmStatus(); setShowChoice(!showChoice); }}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          hasDoneAnyGm
            ? "border-accent/30 bg-accent/5 text-accent"
            : "border-yellow-400/30 bg-yellow-400/5 text-yellow-400 hover:bg-yellow-400/10"
        }`}
      >
        {hasDoneAnyGm ? "✅ GM" : "Say GM"}
        {streak != null && streak > 0 ? (
          <span className="text-accent">{streak}d 🔥</span>
        ) : null}
      </button>

      {showChoice ? (
        <div className="absolute top-full mt-1 right-0 z-50 rounded-lg border border-border bg-card p-2 shadow-lg min-w-[200px]">
          <button
            type="button"
            onClick={doOffChainGm}
            disabled={offchainDisabled}
            className={`w-full text-left rounded px-3 py-2 text-xs transition ${offchainDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/5"}`}
          >
            <span className="font-medium">🌐 Off-chain</span>
            <span className="text-muted ml-2">{alreadyOffChain || alreadyOnChain ? "Done today" : offchainSending ? "Sending..." : "Free · 10+ pts"}</span>
          </button>
          <button
            type="button"
            onClick={doOnChainGm}
            disabled={sending || alreadyOnChain}
            className={`w-full text-left rounded px-3 py-2 text-xs transition ${alreadyOnChain ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/5"}`}
          >
            <span className="font-medium">⛽ On-chain</span>
            <span className="text-muted ml-2">{alreadyOnChain ? "Done today" : "+25 pts"}</span>
            {sending ? <Logo className="h-3 w-3 text-accent animate-spin inline-block ml-1" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
