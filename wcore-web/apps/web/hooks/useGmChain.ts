"use client";

import { useState, useEffect, useCallback } from "react";
import { useOnChainGm } from "./useOnChainGm";
import { getApiUrl, apiFetch } from "@/lib/api";
import { isGmDoneForChain } from "@/components/gm-event";
import { gmStatusFetchPlan, shouldCheckOnchainGmStatus } from "@/lib/gm-status-reconcile";
import { lsContractDeployed } from "@/lib/gm-storage";

const API_URL = getApiUrl();

export function useGmChain(
  chainKey: string | undefined,
  walletAddress: string | null,
  initialStatus?: { deployed: boolean | null; gmDone: boolean },
  nativePriceMap?: Record<string, number>,
) {
  const { sendGm, deployContract, sending, deploying, checkHasDeployed } = useOnChainGm({
    chainKey,
    walletAddress,
    streak: 0,
    nativePriceMap,
  });

  const [hasDeployed, setHasDeployed] = useState<boolean | null>(null);
  const [alreadyGmToday, setAlreadyGmToday] = useState(false);
  const [initDone, setInitDone] = useState(false);
  // UI-only flag that stays true from click → settle, covering the gap between
  // user click and the inner hook flipping `deploying`/`sending` true.
  // Without it, the user sees ~500ms of unresponsive button (the pre-check
  // HTTP call + MetaMask switch + native price fetch all happen before
  // setDeploying fires), which feels like "rien ne se passe".
  const [pendingDeploy, setPendingDeploy] = useState(false);

  useEffect(() => {
    setHasDeployed(null);
    setAlreadyGmToday(false);
    setInitDone(false);
  }, [chainKey, walletAddress]);

  const checkStatus = useCallback(async () => {
    if (!chainKey || !walletAddress) return;
    try {
      const res = await apiFetch(`${API_URL}/api/gm/status`);
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, { deployed: boolean; gmDone: boolean }>;
      const s = data[chainKey] ?? { deployed: false, gmDone: false };
      if (s.deployed) setHasDeployed(true);
      let gmDone = s.gmDone;
      if (shouldCheckOnchainGmStatus(s)) {
        const onchainRes = await apiFetch(`${API_URL}/api/gm/status-onchain?chain=${encodeURIComponent(chainKey)}&address=${encodeURIComponent(walletAddress)}`);
        if (onchainRes.ok) {
          const onchain = await onchainRes.json() as { chainGmDone?: boolean };
          gmDone = !!onchain.chainGmDone;
        }
      }
      setAlreadyGmToday(gmDone);
      return { ...s, gmDone };
    } catch (_e) { console.error("GM status check failed:", _e); /* ignore */ }
  }, [chainKey, walletAddress]);

  // Targeted single-chain on-chain reconcile (no global status fetch).
  const reconcileOnchain = useCallback(async (): Promise<boolean> => {
    if (!chainKey || !walletAddress) return false;
    try {
      const res = await apiFetch(`${API_URL}/api/gm/status-onchain?chain=${encodeURIComponent(chainKey)}&address=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) return false;
      const onchain = await res.json() as { chainGmDone?: boolean };
      return !!onchain.chainGmDone;
    } catch (_e) { console.error("GM on-chain reconcile failed:", _e); return false; }
  }, [chainKey, walletAddress]);

  useEffect(() => {
    if (!chainKey || !walletAddress) return;

    // When the parent page already fetched the global /api/gm/status and passes
    // it as initialStatus, trust it. Re-fetching the global status per card
    // multiplies gm_read calls by the number of cards and 429s the bucket
    // (which then blocks the header's /api/gm/random). See gmStatusFetchPlan.
    const plan = gmStatusFetchPlan(initialStatus);
    let cancelled = false;

    if (!plan.fetchHasDeployed && !plan.fetchGlobalStatus) {
      setHasDeployed(initialStatus?.deployed ?? false);
      setAlreadyGmToday(initialStatus?.gmDone ?? false);
      setInitDone(true);
      if (plan.fetchOnchain) {
        (async () => {
          const onchainDone = await reconcileOnchain();
          if (!cancelled && onchainDone) setAlreadyGmToday(true);
        })();
      }
      return () => { cancelled = true; };
    }

    (async () => {
      const deployed = plan.fetchHasDeployed ? await checkHasDeployed() : (initialStatus?.deployed ?? false);
      if (cancelled) return;
      setHasDeployed(deployed);
      const dbStatus = plan.fetchGlobalStatus ? await checkStatus() : undefined;
      if (cancelled) return;
      if (dbStatus?.deployed) setHasDeployed(true); // Status may confirm deployment
      setAlreadyGmToday(dbStatus?.gmDone ?? initialStatus?.gmDone ?? false);
      setInitDone(true);
    })();

    return () => { cancelled = true; };
  }, [chainKey, walletAddress, checkHasDeployed, checkStatus, reconcileOnchain, initialStatus, initialStatus?.deployed, initialStatus?.gmDone]);

  useEffect(() => {
    if (!chainKey) return;
    const handleGmDone = (event: Event) => {
      if (!isGmDoneForChain((event as CustomEvent).detail, chainKey)) return;
      setHasDeployed(true);
      setAlreadyGmToday(true);
      // Do NOT call checkStatus here: the event is only dispatched after the
      // tx is validated on-chain (see waitForGmReceipt in useOnChainGm.sendGm),
      // so the local state is the source of truth. Calling checkStatus would
      // race against the still-pending recordGmBackend fire-and-forget and
      // could override alreadyGmToday=true with gmDone=false from a stale read,
      // causing the button to flicker back to "Say GM".
    };
    window.addEventListener("wcore-gm-done", handleGmDone);
    return () => window.removeEventListener("wcore-gm-done", handleGmDone);
  }, [chainKey]);

  const handleSendGm = useCallback(async () => {
    if (alreadyGmToday) return;
    try {
      await sendGm();
      setAlreadyGmToday(true);
    } catch (e) {
      alert((e as Error).message);
    }
  }, [alreadyGmToday, sendGm]);

  const handleDeploy = useCallback(async () => {
    setPendingDeploy(true);
    try {
      // Skip the pre-check HTTP call. The /api/gm/has-deployed round-trip
      // was costing ~500ms of "rien ne se passe" before MetaMask even opened
      // the chain switch / tx popup. We trust the localStorage cache and the
      // /api/gm/status the page already fetched: if a duplicate exists, the
      // factory contract will revert and the user gets a clear error.
      // Last-resort in-page guard for the localStorage-known case only.
      if (chainKey && lsContractDeployed(chainKey)) {
        setHasDeployed(true);
        alert("A GM contract is already deployed for this chain.");
        return;
      }
      await deployContract();
      setHasDeployed(true);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("user rejected") || msg.includes("User rejected")) return;
      alert(msg);
    } finally {
      setPendingDeploy(false);
    }
  }, [deployContract, chainKey]);

  return {
    hasDeployed,
    alreadyGmToday,
    initDone,
    sending,
    deploying: deploying || pendingDeploy,
    handleSendGm,
    handleDeploy,
    refreshStatus: checkStatus,
  };
}
