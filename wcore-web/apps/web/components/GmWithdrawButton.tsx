"use client";

import { useState, useEffect, useCallback } from "react";
import { Logo } from "./Logo";
import { type GmContractWithBalance, getNativeSymbol, hasWithdrawableBalance, weiToNative } from "@/hooks/useGmContracts";
import { usePreferences } from "./PreferencesProvider";
import { getApiUrl } from "@/lib/api";
import { getFactory } from "@wcore/shared";
import { lsGetBalance, lsSetBalance } from "@/lib/gm-storage";

const _nativePriceCache = new Map<string, number>();
const _nativePricePromises = new Map<string, Promise<number | null>>();

interface GmWithdrawButtonProps {
  contract: GmContractWithBalance | undefined;
  withdrawingId: string | null;
  onWithdraw: (contract: GmContractWithBalance) => Promise<void>;
  balanceKind?: "creator" | "platform";
  className?: string;
  compact?: boolean;
  nativePriceEur?: number;
}

export function GmWithdrawButton({
  contract,
  withdrawingId,
  onWithdraw,
  balanceKind = "creator",
  className = "",
  compact = false,
  nativePriceEur: nativePriceEurProp,
}: GmWithdrawButtonProps) {
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);
  const [directBalance, setDirectBalance] = useState<string | null>(() => {
    if (!contract) return null;
    return lsGetBalance(contract.chainKey, contract.contractAddress, balanceKind);
  });
  const { formatValue } = usePreferences();
  const backendBalance = balanceKind === "platform" ? contract?.platformBalance : contract?.creatorBalance;
  const balance = (backendBalance && BigInt(backendBalance || "0") > 0n) ? backendBalance : (directBalance || backendBalance || "0");

  useEffect(() => {
    if (nativePriceEurProp != null || !contract) return;
    const ck = contract.chainKey;
    if (_nativePriceCache.has(ck)) { setFetchedPrice(_nativePriceCache.get(ck)!); return; }
    if (_nativePricePromises.has(ck)) { _nativePricePromises.get(ck)!.then(p => { if (p) setFetchedPrice(p); }); return; }
    const API_URL = getApiUrl();
    const promise = fetch(`${API_URL}/api/price/native?chain=${encodeURIComponent(ck)}`)
      .then(r => r.json()).then((d: { price?: number }) => { const p = d.price ?? null; if (p) _nativePriceCache.set(ck, p); return p; })
      .catch(() => null)
      .finally(() => { _nativePricePromises.delete(ck); });
    _nativePricePromises.set(ck, promise);
    promise.then(p => { if (p) setFetchedPrice(p); });
  }, [contract, contract?.chainKey, nativePriceEurProp]);

  useEffect(() => {
    if (!contract || (backendBalance && BigInt(backendBalance || "0") > 0n)) return;
    const ethereum = window.ethereum;
    if (!ethereum) return;
    const selector = balanceKind === "platform" ? "0x62a5dbbc" : "0xaf55ec73";
    ethereum.request({ method: "eth_call", params: [{ to: contract.contractAddress, data: selector }, "latest"] })
      .then((raw: unknown) => {
        const result = typeof raw === "string" ? raw : "";
        if (result && result !== "0x" && parseInt(result, 16) > 0) {
          const bal = BigInt(result).toString();
          setDirectBalance(bal);
          lsSetBalance(contract.chainKey, contract.contractAddress, balanceKind, bal);
        }
      }).catch(() => {});
  }, [contract, contract?.contractAddress, contract?.chainKey, backendBalance, balanceKind]);

  const refreshBalanceViaMetaMask = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum || !contract) return;
    setRefreshing(true);
    try {
      const factory = getFactory(contract.chainKey);
      if (factory) {
        const hexChainId = "0x" + factory.chainId.toString(16);
        try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] }); } catch { /* wallet may already be on the target chain */ }
        const selector = balanceKind === "platform" ? "0x62a5dbbc" : "0xaf55ec73";
        const result = await ethereum.request({ method: "eth_call", params: [{ to: contract.contractAddress, data: selector }, "latest"] }) as string;
        if (result && result !== "0x" && parseInt(result, 16) > 0) {
          const bal = BigInt(result).toString();
          setDirectBalance(bal);
          lsSetBalance(contract.chainKey, contract.contractAddress, balanceKind, bal);
        }
      }
    } catch (e) { setError((e as Error).message || "Failed to refresh"); }
    setRefreshing(false);
  }, [contract, balanceKind]);

  if (!contract || !balance) return null;
  const isBalanceUnavailable = !hasWithdrawableBalance(balance);
  const isPlatform = balanceKind === "platform";
  const symbol = getNativeSymbol(contract.chainKey);
  const amount = weiToNative(balance);
  const amountStr = amount > 0 && amount < 0.000001 ? amount.toExponential(4) : amount.toFixed(6);
  const priceEur = nativePriceEurProp ?? fetchedPrice;
  const valueEur = priceEur != null ? amount * priceEur : null;
  const withdrawing = withdrawingId === contract.id;
  const label = isPlatform ? "Fees Platform" : "Fees Earned";
  const colorClass = isPlatform
    ? "text-amber-400/80 border-amber-400/15 hover:bg-amber-400/5"
    : "text-emerald-400/80 border-emerald-400/15 hover:bg-emerald-400/5";

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={async () => {
          setError("");
          if (isBalanceUnavailable) {
            await refreshBalanceViaMetaMask();
          }
          void onWithdraw(contract!).catch((e) => setError((e as Error).message));
        }}
        disabled={withdrawing || refreshing}
        className={`${compact ? "rounded border px-2 py-0.5 text-[10px]" : "rounded border px-3 py-1 text-xs"} font-semibold disabled:opacity-50 transition ${colorClass} ${className}`}
        title={isBalanceUnavailable ? `Click to switch to ${contract.chainKey.replace(/_/g, " ")} network and refresh balance` : `Withdraw ${amountStr} ${symbol}`}
      >
        {refreshing ? (
          <Logo className={`h-3 w-3 ${isPlatform ? "text-amber-400/80" : "text-emerald-400/80"} animate-spin inline-block`} />
        ) : withdrawing ? (
          <Logo className={`h-3 w-3 ${isPlatform ? "text-amber-400/80" : "text-emerald-400/80"} animate-spin inline-block`} />
        ) : (
          `💸 ${label}: ${amountStr} ${symbol}${valueEur != null ? ` (${formatValue(valueEur)})` : isBalanceUnavailable ? " (—)" : ""}`
        )}
      </button>
      {error ? <span className="max-w-48 text-[10px] text-red-400">{error}</span> : null}
    </span>
  );
}
