"use client";

import { useState, useEffect, useCallback } from "react";
import { Logo } from "./Logo";
import { type GmContractWithBalance, getNativeSymbol, hasWithdrawableBalance, weiToNative, withdrawBlockedMessage } from "@/hooks/useGmContracts";
import { usePreferences } from "./PreferencesProvider";
import { getApiUrl } from "@/lib/api";
import { getFactory } from "@wcore/shared";
import { lsGetBalance, lsSetBalance, lsClearBalance } from "@/lib/gm-storage";
import { resolveGmBalance, nativeValueEur } from "@/lib/gm-withdraw-balance";

const _nativePriceCache = new Map<string, number>();
const _nativePricePromises = new Map<string, Promise<number | null>>();
const NATIVE_PRICE_RETRIES = 3;
const NATIVE_PRICE_RETRY_MS = 5_000;

const CREATOR_BALANCE_SELECTOR = "0xaf55ec73";
const PLATFORM_BALANCE_SELECTOR = "0x62a5dbbc";

interface EthereumLike {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/**
 * Read a contract's withdrawable balance straight from the wallet RPC.
 *
 * Only a read taken on the contract's own chain is trusted: the same address on
 * a different chain is unrelated code and can return arbitrary data. Returns
 * null (never throws) when the chain, the wallet or the read is unavailable, so
 * the caller can fall back to the server value instead of showing a wrong one.
 */
async function readBalanceFromWallet(
  ethereum: EthereumLike,
  chainKey: string,
  contractAddress: string,
  balanceKind: "creator" | "platform",
): Promise<string | null> {
  const factory = getFactory(chainKey);
  if (!factory) return null;
  try {
    const chainIdHex = await ethereum.request({ method: "eth_chainId" }) as string;
    if (Number(chainIdHex) !== factory.chainId) return null;
  } catch {
    return null;
  }
  const selector = balanceKind === "platform" ? PLATFORM_BALANCE_SELECTOR : CREATOR_BALANCE_SELECTOR;
  try {
    const raw = await ethereum.request({ method: "eth_call", params: [{ to: contractAddress, data: selector }, "latest"] });
    if (typeof raw !== "string" || raw === "0x") return null;
    return BigInt(raw).toString();
  } catch {
    return null;
  }
}

/** Persist an authoritative balance; a confirmed zero clears the stale cache. */
function persistBalance(chainKey: string, contractAddress: string, kind: "creator" | "platform", value: string): void {
  if (BigInt(value) > 0n) lsSetBalance(chainKey, contractAddress, kind, value);
  else lsClearBalance(chainKey, contractAddress, kind);
}

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
  // Optimistic value from a previous session, shown only until a fresh read
  // lands. It must never win over a confirmed zero — see resolveGmBalance.
  const [cachedBalance] = useState<string | null>(() => {
    if (!contract) return null;
    return lsGetBalance(contract.chainKey, contract.contractAddress, balanceKind);
  });
  // Authoritative balance read from the wallet RPC (any value, including 0).
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const { formatValue, language, eurUsd } = usePreferences();
  const backendBalance = balanceKind === "platform" ? contract?.platformBalance : contract?.creatorBalance;
  const balance = resolveGmBalance({ walletBalance, backendBalance, cachedBalance });

  useEffect(() => {
    if (nativePriceEurProp != null || !contract) return;
    const ck = contract.chainKey;
    if (_nativePriceCache.has(ck)) { setFetchedPrice(_nativePriceCache.get(ck)!); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A failed or empty answer used to leave "(—)" until a full reload: retry a
    // few times, spaced out, while the button is mounted (B2, 24/11/2026).
    const attempt = (n: number) => {
      // Another button of the same chain may have got the price meanwhile.
      const known = _nativePriceCache.get(ck);
      if (known) { setFetchedPrice(known); return; }
      let promise = _nativePricePromises.get(ck);
      if (!promise) {
        // A retry must not be served the same empty answer from the HTTP cache
        // (the API sends max-age=60 even on `price: null`).
        promise = fetch(`${getApiUrl()}/api/price/native?chain=${encodeURIComponent(ck)}`, n > 0 ? { cache: "no-store" } : undefined)
          .then(r => (r.ok ? r.json() : null)).then((d: { price?: number | null } | null) => { const p = d?.price ?? null; if (p) _nativePriceCache.set(ck, p); return p; })
          .catch(() => null)
          .finally(() => { _nativePricePromises.delete(ck); });
        _nativePricePromises.set(ck, promise);
      }
      promise.then(p => {
        if (cancelled) return;
        if (p) setFetchedPrice(p);
        else if (n < NATIVE_PRICE_RETRIES) timer = setTimeout(() => attempt(n + 1), NATIVE_PRICE_RETRY_MS * (n + 1));
      });
    };
    attempt(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [contract, contract?.chainKey, nativePriceEurProp]);

  useEffect(() => {
    if (!contract) return;
    // A positive server balance is already authoritative and fresh — skip the
    // extra wallet RPC. A zero (or an unreadable server value) is re-checked
    // on-chain so a value that has since been withdrawn to 0 cannot linger.
    if (backendBalance && BigInt(backendBalance || "0") > 0n) return;
    const ethereum = window.ethereum;
    if (!ethereum) return;
    let cancelled = false;
    (async () => {
      const value = await readBalanceFromWallet(ethereum, contract.chainKey, contract.contractAddress, balanceKind);
      if (cancelled || value == null) return;
      setWalletBalance(value);
      persistBalance(contract.chainKey, contract.contractAddress, balanceKind, value);
    })();
    return () => { cancelled = true; };
  }, [contract, contract?.contractAddress, contract?.chainKey, backendBalance, balanceKind]);

  // Switches to the contract's chain, then reads the balance on-chain. Returns
  // the exact value read (including 0), or null when no trustworthy read was
  // possible — so the caller can stop instead of submitting a reverting tx.
  const refreshBalanceViaMetaMask = useCallback(async (): Promise<string | null> => {
    const ethereum = window.ethereum;
    if (!ethereum || !contract) return null;
    setRefreshing(true);
    try {
      const factory = getFactory(contract.chainKey);
      if (!factory) return null;
      const hexChainId = "0x" + factory.chainId.toString(16);
      try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] }); } catch { /* wallet may already be on the target chain */ }
      const value = await readBalanceFromWallet(ethereum, contract.chainKey, contract.contractAddress, balanceKind);
      if (value != null) {
        setWalletBalance(value);
        persistBalance(contract.chainKey, contract.contractAddress, balanceKind, value);
      }
      return value;
    } catch (e) {
      setError((e as Error).message || "Failed to refresh");
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [contract, balanceKind]);

  if (!contract || !balance) return null;
  const isBalanceUnavailable = !hasWithdrawableBalance(balance);
  const isPlatform = balanceKind === "platform";
  const symbol = getNativeSymbol(contract.chainKey);
  const amount = weiToNative(balance);
  const amountStr = amount > 0 && amount < 0.000001 ? amount.toExponential(4) : amount.toFixed(6);
  const valueEur = nativeValueEur(amount, nativePriceEurProp, fetchedPrice, eurUsd);
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
            // A zero label means either a confirmed empty contract or a server
            // read that could not be trusted. Only a fresh on-chain read from the
            // wallet can tell them apart — and submitting against an empty
            // contract just burns gas on a "nothing to withdraw" revert.
            const refreshed = await refreshBalanceViaMetaMask();
            if (refreshed == null) return;
            // Below the dust floor: say why nothing happens instead of returning silently.
            const blocked = withdrawBlockedMessage(refreshed, symbol, language);
            if (blocked) { setError(blocked); return; }
          }
          try {
            await onWithdraw(contract!);
            // The balance is now spent (or the tx failed). Drop the cached read so
            // the next render/click re-verifies instead of trusting a stale amount.
            setWalletBalance(null);
            lsClearBalance(contract!.chainKey, contract!.contractAddress, balanceKind);
          } catch (e) {
            setError((e as Error).message);
          }
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
