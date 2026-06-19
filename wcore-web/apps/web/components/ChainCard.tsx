"use client";
import { getApiUrl, apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import type { ChainScan } from "@wcore/shared";
import { TokenTable } from "./TokenTable";
import { detectScam } from "./scam-detector";
import {
  applyScamOverrides,
  isContractApproved,
  isSymbolApproved,
  readScamOverrides,
} from "@/lib/scam-overrides";
import { ChainIcon } from "./ChainIcon";
import { Logo } from "./Logo";
import { GmWithdrawButton } from "./GmWithdrawButton";
import { usePreferences } from "./PreferencesProvider";
import { useGmChain } from "@/hooks/useGmChain";
import { type GmContractWithBalance } from "@/hooks/useGmContracts";
import { getCexProviderMeta } from "@/lib/cex-display";

import { getActiveFactoryChains } from "@wcore/shared";

// Derived from the single source of truth: packages/shared/src/factories.ts
const FACTORIES: Record<string, boolean> = Object.fromEntries(
  getActiveFactoryChains().map(k => [k, true])
);

export interface ChainCardProps {
  chain: ChainScan;
  walletLabel?: string;
  walletAddress?: string;
  onRefresh?: () => void;
  connectedAddress?: string;
  gmContracts?: GmContractWithBalance[];
  gmStatus?: { deployed: boolean | null; gmDone: boolean };
  withdrawingId?: string | null;
  onWithdrawCreator?: (contract: GmContractWithBalance) => Promise<void>;
  onWithdrawPlatform?: (contract: GmContractWithBalance) => Promise<void>;
}

function ChainCardInner({ chain, walletLabel, walletAddress, onRefresh, connectedAddress, gmContracts = [], gmStatus, withdrawingId, onWithdrawCreator, onWithdrawPlatform }: ChainCardProps) {
  const { formatValue, t } = usePreferences();
  const [refreshing, setRefreshing] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const isCurrentWallet = walletAddress?.toLowerCase() === connectedAddress?.toLowerCase();
  const [showAddToken, setShowAddToken] = useState(false);
  const [newCtContract, setNewCtContract] = useState("");
  const [ctSending, setCtSending] = useState(false);
  const [ctError, setCtError] = useState("");
  const [ctAdded, setCtAdded] = useState(false);
  const chainKeyLower = chain.chainKey?.toLowerCase();
  const isPlatformOwner = connectedAddress?.toLowerCase() === "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
  const creatorContracts = gmContracts.filter((contract) => contract.role !== "platform");
  const platformContracts = isPlatformOwner ? gmContracts : [];
  const cexProvider = chain.chainKey === "CEX_BINANCE" ? "binance" : chain.chainKey === "CEX_BITPANDA" ? "bitpanda" : chain.chainKey === "CEX_BITFINEX" ? "bitfinex" : chain.chainKey === "CEX_BYBIT" ? "bybit" : chain.chainKey === "CEX_COINBASE" ? "coinbase" : chain.chainKey === "CEX_OKX" ? "okx" : null;
  const cexProviderMeta = cexProvider ? getCexProviderMeta(cexProvider) : null;
  // Only engage the GM status hook for the connected wallet's card on a chain
  // that actually has a GM factory. Otherwise every ChainCard (all wallets, all
  // chains) would fire /api/gm/has-deployed + /api/gm/status on mount — a 2×N
  // fan-out that 429s the gm_read bucket and blocks the header's /api/gm/random.
  const gmEligible = !cexProviderMeta && !!chainKeyLower && isCurrentWallet && !!FACTORIES[chainKeyLower];
  const { hasDeployed, alreadyGmToday, sending, deploying, handleSendGm, handleDeploy, refreshStatus } = useGmChain(
    gmEligible ? chainKeyLower : undefined,
    gmEligible ? (connectedAddress ?? null) : null,
    gmStatus,
  );

  useEffect(() => {
    if (!chainKeyLower || !connectedAddress) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { chain?: string } | undefined;
      if (detail?.chain?.toLowerCase() === chainKeyLower) {
        void refreshStatus();
      }
    };
    window.addEventListener("wcore-gm-done", handler);
    return () => window.removeEventListener("wcore-gm-done", handler);
  }, [chainKeyLower, connectedAddress, refreshStatus]);

  const addCustomToken = useCallback(async () => {
    const contract = newCtContract.trim().toLowerCase();
    if (!contract || !/^0x[0-9a-f]{40}$/.test(contract)) {
      setCtError("Invalid contract address");
      return;
    }
    setCtSending(true); setCtError("");
    try {
      const API_URL = getApiUrl();
      const res = await apiFetch(`${API_URL}/api/custom-tokens`, {
        method: "POST",
        body: JSON.stringify({ contract, label: null, chainType: chain.vm || "EVM" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "failed" })) as { error?: string }; setCtError(d.error || "Failed"); setCtSending(false); return; }
      setCtAdded(true);
      setNewCtContract("");
      setTimeout(() => { setCtAdded(false); setShowAddToken(false); }, 1500);
      if (onRefresh) { try { await onRefresh(); } catch { /* refresh best-effort */ } }
    } catch (e) { setCtError((e as Error).message); }
    setCtSending(false);
  }, [newCtContract, chain.vm, onRefresh]);

  // Computed total: subtract admin-blocked scam tokens from displayed value
  const [cleanTotalVersion, setCleanTotalVersion] = useState(0);
  useEffect(() => {
    const handler = () => setCleanTotalVersion(v => v + 1);
    window.addEventListener("wcore-scam-override", handler);
    return () => window.removeEventListener("wcore-scam-override", handler);
  }, []);

  const cleanTotal = useMemo(() => {
    if (cexProviderMeta) return chain.totals.valueEur;
    const { blocked, approved } = readScamOverrides();
    if (blocked.length === 0 && approved.length === 0) return chain.totals.valueEur;
    const visibleTokens = applyScamOverrides(chain.tokens, blocked, approved);
    return visibleTokens.reduce((sum, t) => {
      const scam = detectScam(t.symbol, t.name, t.balance, t.priceEur, t.contract);
      const isAdminApproved = isSymbolApproved(approved, t.symbol)
        || isContractApproved(approved, t.symbol, t.contract);
      const isScam = isAdminApproved ? false : scam.isSuspicious;
      return sum + (isScam ? 0 : (t.valueEur ?? 0));
    }, (chain.native?.valueEur ?? 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.tokens, chain.native, chain.totals.valueEur, cleanTotalVersion, cexProviderMeta]);
  const isTimedOut = chain.errors.some((e) => e.message.includes("chain_timeout"));
  const isCircuitOpen = chain.errors.some((e) => e.message.includes("circuit_open"));
  const rpcErrors = chain.errors.filter((e) => e.message.includes("RPC") || e.message.includes("consensus") || e.message.includes("fetch") || e.message.includes("eth_getLogs"));
  const priceErrors = chain.errors.filter((e) => e.message.includes("price") || e.message.includes("NO_PRICE"));
  const otherErrors = chain.errors.filter((e) => !rpcErrors.includes(e) && !priceErrors.includes(e) && !e.message.includes("chain_timeout") && !e.message.includes("circuit_open"));
  const totalErrors = chain.errors.length;

  const cardBorder = isTimedOut ? "border-orange-500/60" : isCircuitOpen ? "border-red-500/40" : "border-border";

  return (
    <section className={`rounded-lg border bg-card p-4 sm:p-5 ${cardBorder}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {cexProviderMeta ? (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white">
              <img src={cexProviderMeta.icon} alt="" className="h-full w-full rounded-full object-contain p-0.5" />
            </span>
          ) : <ChainIcon chainKey={chain.chainKey} size="md" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold sm:text-lg">{chain.chainName}</h2>
              {isTimedOut ? (
                <span className="shrink-0 rounded bg-orange-900/70 px-2 py-0.5 text-xs font-bold uppercase text-orange-200 animate-pulse" title="Scan still running in background — partial data is being saved">⏱️ TIMEOUT</span>
              ) : isCircuitOpen ? (
                <span className="shrink-0 rounded bg-red-900/60 px-2 py-0.5 text-xs font-bold uppercase text-red-200" title="Circuit breaker open — chain skipped to avoid wasting quota">⚡ CIRCUIT OPEN</span>
              ) : chain.degraded ? (
                <span className="shrink-0 rounded bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-300">DEGRADED</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {cexProviderMeta ? <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">CEX</span> : <VmBadge vm={chain.vm} />}
                {walletLabel ? <span className="text-xs text-muted">{walletLabel}</span> : null}
                {onRefresh && !cexProviderMeta ? (
                  <button
                    type="button"
                    onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
                    disabled={refreshing}
                    className={`text-xs transition flex items-center justify-center ${refreshing ? "text-accent" : "text-accent hover:bg-accent/10 rounded-full p-0.5 w-5 h-5"}`}
                    title={t("refreshChain") + " " + chain.chainName}
                    aria-label={`Refresh ${chain.chainName}`}
                  >
                    <span className={refreshing ? "inline-block animate-spin" : ""}>↻</span>
                  </button>
          ) : null}
          {/* Add Token button */}
          {connectedAddress && isCurrentWallet ? (
            <button
              type="button"
              onClick={() => { setShowAddToken(!showAddToken); setCtError(""); setCtAdded(false); setNewCtContract(""); }}
              className={`rounded border px-2 py-0.5 text-[10px] font-medium transition shrink-0 ${ctAdded ? "border-green-400/30 bg-green-400/5 text-green-400" : "border-blue-400/20 text-blue-400 hover:bg-blue-400/5"}`}
              title="Add a custom token contract"
              aria-label="Add custom token"
            >
              {ctAdded ? "✓ Added" : "+ Token"}
            </button>
          ) : null}
                {totalErrors > 0 ? (
                <button onClick={() => setShowDiag(!showDiag)} className="text-[10px] text-muted hover:text-fg transition">
                  {showDiag ? t("hide") : `${totalErrors} ${totalErrors > 1 ? t("errors") : t("error")}`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connectedAddress && isCurrentWallet && !cexProviderMeta && chainKeyLower && FACTORIES[chainKeyLower] && hasDeployed !== null ? (
            hasDeployed ? (
              <button
                type="button"
                onClick={handleSendGm}
                disabled={sending || alreadyGmToday}
                className={`rounded border px-3 py-1 text-xs font-medium transition shrink-0 ${alreadyGmToday ? "border-accent/20 bg-accent/5 text-accent/60 cursor-default" : "border-accent/30 text-accent hover:bg-accent/10"}`}
                title={sending ? "Waiting for on-chain confirmation…" : alreadyGmToday ? "GM already done today" : "On-chain GM for this chain (~$0.05 tip)"}
                aria-label={sending ? "Waiting for on-chain confirmation" : alreadyGmToday ? "GM already done today" : "Send on-chain GM with ~$0.05 tip"}
              >
                {sending ? <Logo className="h-3 w-3 text-accent animate-spin inline-block" /> : alreadyGmToday ? "✅ GM" : "⛽ GM"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={deploying}
                className="rounded border border-yellow-400/30 px-2 py-0.5 text-[10px] font-medium text-yellow-400 hover:bg-yellow-400/10 transition shrink-0"
                title="Deploy a GM contract to unlock per-chain GM (~$0.10 fee)"
                aria-label="Deploy GM contract for this chain"
              >
                {deploying ? <Logo className="h-3 w-3 text-yellow-400 animate-spin inline-block" /> : "🚀 Deploy GM Contract"}
              </button>
            )
          ) : null}
          {connectedAddress && isCurrentWallet && !cexProviderMeta && chainKeyLower && FACTORIES[chainKeyLower] && onWithdrawCreator ? creatorContracts.map((contract) => (
            <GmWithdrawButton
              key={`creator-${contract.id}`}
              contract={contract}
              withdrawingId={withdrawingId ?? null}
              onWithdraw={onWithdrawCreator}
              nativePriceEur={chain.native?.priceEur ?? undefined}
            />
          )) : null}
          {connectedAddress && isCurrentWallet && !cexProviderMeta && chainKeyLower && FACTORIES[chainKeyLower] && onWithdrawPlatform && isPlatformOwner ? platformContracts.map((contract) => (
            <GmWithdrawButton
              key={`platform-${contract.id}`}
              contract={contract}
              withdrawingId={withdrawingId ?? null}
              onWithdraw={onWithdrawPlatform}
              balanceKind="platform"
              nativePriceEur={chain.native?.priceEur ?? undefined}
            />
          )) : null}
          {isTimedOut ? (
            <p className="shrink-0 text-base font-bold sm:text-lg text-orange-300 animate-pulse" title="Scan still running — partial data being saved. Retry to see it.">⏱️</p>
          ) : isCircuitOpen ? (
            <p className="shrink-0 text-base font-bold sm:text-lg text-red-300" title="Circuit breaker open">⚡</p>
          ) : (
            <p className="shrink-0 text-base font-bold sm:text-lg">
              {formatValue(cleanTotal)}
            </p>
          )}
        </div>
      </div>

      {showAddToken ? (
        <div className="mt-3 rounded-md border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-fg font-medium">Add Custom Token — {chain.chainName} <span className="text-muted font-normal">(visible to all users)</span></p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCtContract}
              onChange={(e) => setNewCtContract(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded bg-bg border border-border px-3 py-1.5 text-xs font-mono outline-none focus:border-accent/50"
              onKeyDown={(e) => { if (e.key === "Enter") addCustomToken(); }}
            />
            <button
              type="button"
              onClick={addCustomToken}
              disabled={ctSending || !newCtContract.trim()}
              className="rounded bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-40 transition"
            >
              {ctSending ? <Logo className="h-3 w-3 text-accent animate-spin inline-block" /> : "Add"}
            </button>
          </div>
          {ctError ? <p className="text-xs text-red-400">{ctError}</p> : null}
        </div>
      ) : null}

      {isTimedOut ? (
        <div className="mt-3 rounded-md border-2 border-orange-500/50 bg-orange-950/30 px-3 py-2 text-xs text-orange-200 flex items-center gap-2">
          <span>Scan <strong>still running in background</strong> — partial data is being saved. <strong>Retry now</strong> or the next scan will show it.</span>
        </div>
      ) : isCircuitOpen ? (
        <div className="mt-3 rounded-md border-2 border-red-500/40 bg-red-950/20 px-3 py-2 text-xs text-red-200 flex items-center gap-2">
          <span>Chain <strong>skipped</strong> to save quota — will retry automatically after cooldown.</span>
        </div>
      ) : null}
      <TokenTable native={chain.native} tokens={chain.tokens} chainKey={chain.chainKey} connectedAddress={connectedAddress} />                {showDiag && totalErrors > 0 ? (
        <div className="mt-3 rounded-md border border-yellow-900/30 bg-yellow-950/10 p-3 text-xs space-y-1">
          {rpcErrors.length > 0 ? (
            <details open>
              <summary className="text-yellow-300 cursor-pointer">RPC ({rpcErrors.length})</summary>
              {rpcErrors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-yellow-200/70 ml-3 break-all">{e.message}</p>
              ))}
              {rpcErrors.length > 5 ? <p className="text-yellow-200/50 ml-3">+{rpcErrors.length - 5} more</p> : null}
            </details>
          ) : null}
          {priceErrors.length > 0 ? (
            <details>
              <summary className="text-orange-300 cursor-pointer">Pricing ({priceErrors.length})</summary>
              {priceErrors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-orange-200/70 ml-3 break-all">{e.message}</p>
              ))}
            </details>
          ) : null}
          {otherErrors.length > 0 ? (
            <details>
              <summary className="text-muted cursor-pointer">Other ({otherErrors.length})</summary>
              {otherErrors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-muted/70 ml-3 break-all">{e.message}</p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export const ChainCard = memo(ChainCardInner);

export function VmBadge({ vm }: { vm: string }) {
  const colors: Record<string, string> = {
    EVM: "bg-accent/10 text-accent border-accent/30",
    SVM: "bg-purple-900/30 text-purple-300 border-purple-500/30",
    COSMOS: "bg-blue-900/30 text-blue-300 border-blue-500/30",
    TON: "bg-cyan-900/30 text-cyan-300 border-cyan-500/30",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${colors[vm] ?? "bg-border text-muted border-border"}`}>
      {vm}
    </span>
  );
}
