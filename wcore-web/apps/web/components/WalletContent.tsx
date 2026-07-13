"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ChainScan } from "@wcore/shared";
import { detectChainType } from "@wcore/shared";
import { ChainCard } from "@/components";
import { VmBadge } from "@/components/ChainCard";
import { useScanOrchestrator } from "@/hooks/useScanOrchestrator";
import { useWalletLabels } from "@/hooks/useWalletLabels";
import { useCexHoldings } from "@/hooks/useCexHoldings";
import { fetchScan } from "@/lib/scan-api";
import { apiFetch } from "@/lib/api";

const ValueDistribution = dynamic(() => import("@/components/ValueDistribution").then(m => ({ default: m.ValueDistribution })), { ssr: false });
import { usePreferences } from "@/components/PreferencesProvider";
import { useWallet } from "@/components/ConnectButton";
import { useGmContracts } from "@/hooks/useGmContracts";
import { adjustForScams, useScamOverrideSync } from "./scam-detector";
import { PostScanBanner } from "./PostScanBanner";
import { ScanProgressBanner } from "./ScanProgressBanner";
import { PortfolioSummaryCard } from "./PortfolioSummaryCard";
import { WalletSelector } from "./WalletSelector";
import { AllTokensTable } from "./AllTokensTable";
import { getCexProviderMeta, parseCexWalletAddress, sortWalletResultsByValueDesc } from "@/lib/cex-display";

function formatTimeAgo(ms: number): string {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function WalletContent({ addresses, linkedAddresses: linkedAddrs, chains, deepScan, customTokens: ct, walletLabels }: {
  addresses: string[];
  linkedAddresses?: string[];
  chains: string[];
  deepScan: boolean;
  customTokens?: string;
  walletLabels?: Record<string, string>;
}) {
  const customTokenList = useMemo(() =>
    ct ? ct.split(",").map((c) => c.trim()).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c)) : [],
    [ct],
  );
  const linkedSet = new Set((linkedAddrs ?? []).map((a) => a.toLowerCase()));
  const [enabledAddresses, setEnabledAddresses] = useState<string[]>([...addresses]);
  const { formatValue, t } = usePreferences();
  const { address: walletAddress, authStep } = useWallet();
  const connectedAddress = authStep === "authenticated" ? walletAddress : null;
  const { contractsByChain, withdrawingId, withdrawCreator, withdrawPlatform } = useGmContracts(connectedAddress);
  // CEX holdings (cached) load automatically when authenticated and render as
  // extra wallet cards feeding the global total + Wallets/Tokens tabs.
  const { cexResults, reloadCex } = useCexHoldings(connectedAddress);
  const cexAddresses = useMemo(() => cexResults.map((r) => r.address), [cexResults]);
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [refreshingWallet, setRefreshingWallet] = useState<string | null>(null);
  const [chainFilter, setChainFilter] = useState<string[]>([]);
  const [assetFilter, setAssetFilter] = useState("");
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [chainSearch, setChainSearch] = useState("");
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "wallets" | "tokens">("overview");
  const [timeAgo, setTimeAgo] = useState("");
  useScamOverrideSync();

  // Fetch GM status once to pass as initialStatus to ChainCards, avoiding
  // per-card /api/gm/status fan-out (FE-1 fix).
  const [gmStatusMap, setGmStatusMap] = useState<Record<string, { deployed: boolean | null; gmDone: boolean }>>({});
  useEffect(() => {
    if (!connectedAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/gm/status");
        if (!res.ok || cancelled) return;
        const data = await res.json() as Record<string, { deployed: boolean; gmDone: boolean }>;
        if (!cancelled) setGmStatusMap(data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [connectedAddress]);

  useEffect(() => {
    if (!chainDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (chainDropdownRef.current && !chainDropdownRef.current.contains(e.target as Node)) {
        setChainDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [chainDropdownOpen]);

  const { labels } = useWalletLabels({ initialLabels: walletLabels ?? {} });

  const enabledOnChainAddresses = useMemo(() => {
    const onChain = new Set(addresses.map((addr) => addr.toLowerCase()));
    return enabledAddresses.filter((addr) => onChain.has(addr.toLowerCase()));
  }, [addresses, enabledAddresses]);

  useEffect(() => {
    if (cexAddresses.length === 0) return;
    setEnabledAddresses((prev) => {
      const seen = new Set(prev.map((a) => a.toLowerCase()));
      const missing = cexAddresses.filter((addr) => !seen.has(addr.toLowerCase()));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, [cexAddresses]);

  const scanOrch = useScanOrchestrator({
    addresses,
    chains,
    deepScan,
    customTokenList,
    labels,
    enabledAddresses: enabledOnChainAddresses,
  });

  // Update time-ago display every 30s after a scan completes
  useEffect(() => {
    if (scanOrch.lastScanCompleteTime === 0) { setTimeAgo(""); return; }
    const update = () => setTimeAgo(formatTimeAgo(scanOrch.lastScanCompleteTime));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [scanOrch.lastScanCompleteTime]);

  // Re-apply scam adjustments when admin overrides change (cross-component event)
  const [scamVersion, setScamVersion] = useState(0);
  useEffect(() => {
    const handler = () => setScamVersion(v => v + 1);
    window.addEventListener("wcore-scam-override", handler);
    return () => window.removeEventListener("wcore-scam-override", handler);
  }, []);

  // Strip scam tokens from display values, then append CEX accounts as extra
  // wallet cards. CEX holdings are not on-chain so scam adjustment is a no-op
  // for them, but they still flow into the global total + Wallets/Tokens tabs.
  const displayResultsAdjusted = useMemo(() => {
    const onChain = scanOrch.displayResults.map(w => {
      const adjusted = adjustForScams(w.chains, w.totalEur);
      return { ...w, chains: adjusted.chains, totalEur: adjusted.totalEur };
    });
    return sortWalletResultsByValueDesc([...onChain, ...cexResults]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOrch.displayResults, scamVersion, cexResults]);
  // Preserve old results, merge in new ones. Must run in an effect — mutating
  // the prevResults ref during render breaks under React 18 concurrent/Strict.
  const mergePrevResults = scanOrch.mergePrevResults;
  const scanResults = scanOrch.results;
  useEffect(() => {
    if (scanResults && scanResults.length > 0) {
      mergePrevResults(scanResults);
    }
  }, [scanResults, mergePrevResults]);
  // CEX accounts use synthetic addresses and follow the same selector as
  // on-chain wallets; they are auto-enabled when loaded.
  const isEnabledResult = useCallback(
    (r: { address: string; isCex?: boolean }) =>
      enabledAddresses.some(a => a.toLowerCase() === r.address.toLowerCase()),
    [enabledAddresses],
  );

  const totalEur = Math.round(displayResultsAdjusted
    .filter(isEnabledResult)
    .reduce((s, r) => s + r.totalEur, 0) * 100) / 100;

  const enabledResults = displayResultsAdjusted.filter(isEnabledResult);
  const allChainCards = enabledResults.flatMap((r) => r.chains);
  const totalTokens = allChainCards.reduce((s, c) => s + c.totals.tokenCount, 0);
  const uniqueChains = new Set(allChainCards.map((c) => c.chainKey)).size;
  const isLoading = scanOrch.progress.done < scanOrch.progress.total || !scanOrch.results;

  const availableChains = [...new Set(allChainCards.map(c => c.chainKey))].sort();
  const chainNames: Record<string, string> = {};
  for (const c of allChainCards) {
    if (!chainNames[c.chainKey]) chainNames[c.chainKey] = c.chainName;
  }
  const chainFilterActive = chainFilter.length > 0;
  const assetFilterActive = assetFilter.length > 0;
  const filterActive = chainFilterActive || assetFilterActive;
  const chainFilterSet = new Set(chainFilter);

  const filteredResults = filterActive
    ? enabledResults.map(wallet => ({
        ...wallet,
        chains: wallet.chains.filter(chain => {
          if (chainFilterActive && !chainFilterSet.has(chain.chainKey)) return false;
          if (!assetFilterActive) return true;
          const q = assetFilter.toLowerCase();
          const matchNative = chain.native && (
            chain.native.symbol.toLowerCase().includes(q) ||
            chain.native.name.toLowerCase().includes(q) ||
            chain.native.contract.toLowerCase().includes(q)
          );
          const matchToken = chain.tokens.some(t =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.contract.toLowerCase().includes(q)
          );
          return matchNative || matchToken;
        }),
        totalEur: chainFilterActive
          ? wallet.chains.filter(chain => chainFilterSet.has(chain.chainKey))
              .reduce((sum, c) => sum + c.totals.valueEur, 0)
          : wallet.totalEur,
      })).filter(w => w.chains.length > 0)
    : enabledResults;

  const filteredTotalEur = Math.round(filteredResults
    .filter(isEnabledResult)
    .reduce((s, r) => s + r.totalEur, 0) * 100) / 100;

  const prevTotal = 0;
  const showDiff = false;

  const handleRefreshAll = useCallback(() => {
    scanOrch.setRefreshingAll(true);
    setTimeout(() => scanOrch.setRefreshingAll(false), 5000);
    setEnabledAddresses([...addresses, ...cexAddresses]);
    // Re-sync CEX accounts (Binance/Bitpanda/Bitfinex/Bybit) on the server, then
    // reload their cached holdings so Refresh All covers exchanges, not just
    // on-chain wallets. cexResults addresses are `cex:<provider>:<id>`.
    const cexIds = cexResults
      .map((r) => parseCexWalletAddress(r.address)?.id)
      .filter((id): id is string => !!id);
    if (cexIds.length > 0) {
      void Promise.allSettled(
        cexIds.map((id) => apiFetch(`/api/cex/accounts/${id}/sync`, { method: "POST" })),
      ).then(() => { void reloadCex(); });
    }
    scanOrch.triggerForceRefresh();
  }, [scanOrch, addresses, cexAddresses, cexResults, reloadCex]);

  return (
    <main className="mx-auto w-full px-4 py-8 sm:px-6 sm:py-10">
      {scanOrch.showToast ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 flex items-center gap-2 animate-pulse">
          <span className="text-accent text-sm">✅</span>
          <span className="text-xs text-fg">{scanOrch.toastMsg}</span>
        </div>
      ) : null}

      {showDiff ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3">
          <span className="text-lg">{totalEur > prevTotal ? "📈" : "📉"}</span>
          <div className="text-sm">
            <span className="text-fg">{totalEur > prevTotal ? "+" : ""}{formatValue(totalEur - prevTotal)}</span>
            <span className="text-muted ml-1">since last scan ({formatValue(prevTotal)})</span>
          </div>
        </div>
      ) : null}

      {addresses.length + cexResults.length > 1 ? (
        <WalletSelector
          addresses={addresses}
          linkedSet={linkedSet}
          enabledAddresses={enabledAddresses}
          setEnabledAddresses={setEnabledAddresses}
          labels={labels}
          displayResultsAdjusted={displayResultsAdjusted}
          refreshingWallet={refreshingWallet}
          setRefreshingWallet={setRefreshingWallet}
          onRefreshWallet={scanOrch.refreshWallet}
          formatValue={formatValue}
        />
      ) : null}

      {isLoading ? (
        <ScanProgressBanner
          elapsed={scanOrch.elapsed}
          scanningAddr={scanOrch.scanningAddr}
          scanningSince={scanOrch.scanningSince}
          scanChains={scanOrch.scanChains}
          scanProgressDisplay={scanOrch.scanProgressDisplay}
          activeScanChains={scanOrch.activeScanChains}
        />
      ) : (scanOrch.timedOutChains.length > 0 || scanOrch.circuitOpenChains.length > 0) ? (
        <PostScanBanner
          timedOutChains={scanOrch.timedOutChains}
          circuitOpenChains={scanOrch.circuitOpenChains}
          retryingTimedOut={scanOrch.retryingTimedOut}
          onRetryTimedOut={scanOrch.handleRetryTimedOut}
        />
      ) : null}

      {Object.keys(scanOrch.circuitBreakers).filter(k => scanOrch.circuitBreakers[k]?.state === "OPEN").length > 0 ? (
        <div className="rounded-lg border border-yellow-900/30 bg-yellow-950/10 p-3 text-xs">
          <span className="font-semibold text-yellow-300">Circuit breakers active</span>
          <span className="text-yellow-200/70 ml-2">
            {Object.entries(scanOrch.circuitBreakers)
              .filter(([, v]) => v.state === "OPEN")
              .map(([k, v]) => {
                // eslint-disable-next-line react-hooks/purity
                const openedAgo = v.openedAt ? Math.round((Date.now() - v.openedAt) / 1000) : 0;
                return `${k.replace(/_/g, " ")} (${v.failureCount} failures${openedAgo > 0 ? `, opened ${openedAgo}s ago` : ""})`;
              })
              .join(", ")}
          </span>
        </div>
      ) : null}

      <div className="space-y-4 sm:space-y-6">
        <PortfolioSummaryCard
          totalEur={totalEur}
          timeAgo={timeAgo}
          addresses={addresses}
          uniqueChains={uniqueChains}
          totalTokens={totalTokens}
          deepScan={deepScan}
          scanDuration={scanOrch.scanDuration}
          allChainCards={allChainCards}
          displayResultsAdjusted={displayResultsAdjusted}
          refreshingAll={scanOrch.refreshingAll}
          onRefreshAll={handleRefreshAll}
        />

        {/* Tab navigation */}
        <div className="flex items-center gap-1 border-b border-border/50 pb-2">
          {(["overview", "wallets", "tokens"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition capitalize border-b-2 ${
                activeTab === tab ? "text-accent border-accent" : "text-muted border-transparent hover:text-fg hover:border-border/40"
              }`}>{t(tab)}</button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
        {uniqueChains > 1 ? <ValueDistribution chains={allChainCards} /> : null}

        {availableChains.length > 0 ? (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="relative" ref={chainDropdownRef}>
              <button
                onClick={() => { setChainDropdownOpen(!chainDropdownOpen); setChainSearch(""); }}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${
                  chainFilterActive ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 text-muted hover:border-accent/30"
                }`}
              >
                <span className="opacity-60">&#x1F517;</span>
                <span>{chainFilterActive ? `${chainFilter.length} chain${chainFilter.length > 1 ? "s" : ""}` : "All chains"}</span>
                <span className="text-[9px] opacity-50">{chainDropdownOpen ? "▲" : "▼"}</span>
              </button>
              {chainDropdownOpen ? (
                <div className="absolute top-full left-0 mt-1 z-20 rounded-lg border border-border bg-card shadow-xl max-h-56 w-52 max-w-[calc(100vw-2rem)] overflow-hidden">
                  <div className="sticky top-0 bg-card border-b border-border/50 px-2 py-1.5">
                    <input
                      type="text"
                      placeholder="Filter chains..."
                      value={chainSearch}
                      onChange={e => setChainSearch(e.target.value)}
                      className="w-full rounded border border-border/60 bg-bg px-2 py-1 text-[11px] text-fg placeholder:text-muted/50 outline-none focus:border-accent/50"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-44">
                    {availableChains
                      .filter(c => !chainSearch || c.toLowerCase().replace(/_/g, " ").includes(chainSearch.toLowerCase()) || (chainNames[c] || "").toLowerCase().includes(chainSearch.toLowerCase()))
                      .map(chainKey => {
                        const active = chainFilter.includes(chainKey);
                        return (
                          <button
                            key={chainKey}
                            onClick={() => {
                              setChainFilter(active
                                ? chainFilter.filter(c => c !== chainKey)
                                : [...chainFilter, chainKey]
                              );
                            }}
                            className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[11px] transition ${
                              active ? "bg-accent/10 text-accent" : "text-muted hover:bg-bg"
                            }`}
                          >
                            <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center shrink-0 ${
                              active ? "border-accent/50 bg-accent/20" : "border-border/60"
                            }`}>{active ? "✓" : ""}</span>
                            <span className="truncate">{chainNames[chainKey] || chainKey.replace(/_/g, " ")}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search asset..."
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                className="rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-fg placeholder:text-muted/50 outline-none focus:border-accent/50 w-28 sm:w-36"
              />
              {assetFilter ? (
                <button onClick={() => setAssetFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted hover:text-fg">✕</button>
              ) : null}
            </div>

            {filterActive ? (
              <button onClick={() => { setChainFilter([]); setAssetFilter(""); }} className="rounded-lg border border-accent/30 px-2 py-1 text-[10px] text-accent hover:bg-accent/10 transition">
                Clear
              </button>
            ) : null}

            {filterActive ? (
              <span className="text-[10px] text-muted ml-auto tabular-nums">
                {filteredResults.flatMap(w => w.chains).reduce((s, c) => s + c.totals.tokenCount, 0)} tokens · {formatValue(filteredTotalEur)}
              </span>
            ) : null}
          </div>
        ) : null}

        {filteredResults.filter(isEnabledResult).map((wallet) => {
          const isCexWallet = !!(wallet as { isCex?: boolean }).isCex;
          const handleRefreshChain = async (chainKey: string) => {
            // CEX cards hold cached exchange holdings, not on-chain data — never
            // trigger an on-chain scan for their synthetic address.
            if (isCexWallet) return;
            const d = await fetchScan(wallet.address, [chainKey], deepScan, customTokenList, true);
            if (!d.error && d.chains[0]) {
              scanOrch.setResults((prev) => {
                const updated = prev?.map((w) => {
                  if (w.address.toLowerCase() !== wallet.address.toLowerCase()) return w;
                  const idx = w.chains.findIndex((c) => c.chainKey === chainKey);
                  const newChain = d.chains[0]!;
                  const newChains = idx >= 0
                    ? w.chains.map((c, i) => i === idx ? newChain : c)
                    : [...w.chains, newChain];
                  const sorted = newChains.sort((a, b) => b.totals.valueEur - a.totals.valueEur);
                  return { ...w, chains: sorted, totalEur: Math.round(sorted.reduce((s, c) => s + c.totals.valueEur, 0) * 100) / 100 };
                }) ?? prev;
                return updated;
              });
            }
          };
          return (
          <div key={wallet.address}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-accent">{wallet.label}</span>
              {isCexWallet ? (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">CEX</span>
              ) : (
                <span className="text-xs text-muted font-mono cursor-pointer hover:text-fg relative group" title="Click to copy" onClick={async (e) => { try { await navigator.clipboard.writeText(wallet.address); const el = e.currentTarget; el.setAttribute('data-copied', '1'); setTimeout(() => el.removeAttribute('data-copied'), 1500); } catch { /* noop */ } }}>{wallet.address.slice(0, 10)}...<span className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-data-[copied]:block text-[10px] text-accent whitespace-nowrap">Copié !</span></span>
              )}
              {!isCexWallet && wallet.chains.length > 0 ? [...new Set(wallet.chains.map((c) => c.vm))].map((vm) => (<VmBadge key={vm} vm={vm} />)) : null}
              <span className="text-xs text-muted ml-auto">{formatValue(wallet.totalEur)}</span>
            </div>
            {wallet.error && wallet.error !== "scan_failed" ? (
              <div className="text-xs text-red-400 mb-2">
                {wallet.error.includes("Upgrade") || wallet.error.includes("too_many") ? (
                  <span>{wallet.error} <Link href="/pricing" className="text-accent hover:underline">Upgrade</Link></span>
                ) : wallet.error}
              </div>
            ) : null}
            <div className="space-y-3 ml-2 border-l-2 border-border/50 pl-3">
              {(() => {
                const activeChains = wallet.chains.filter((c: ChainScan) => c.totals.valueEur > 0);
                const zeroChains = wallet.chains.filter((c: ChainScan) => c.totals.valueEur <= 0);
                const isExpanded = expandedWallets.has(wallet.address);
                const chains = isExpanded ? wallet.chains : activeChains;
                return (
                  <>
                    {chains.map((chain: ChainScan) => (
                      <ChainCard key={`${wallet.address}-${chain.chainKey}`} chain={chain} walletLabel={wallet.label} walletAddress={wallet.address} connectedAddress={connectedAddress || undefined} gmContracts={contractsByChain.get(chain.chainKey.toLowerCase()) ?? []} gmStatus={gmStatusMap[chain.chainKey]} withdrawingId={withdrawingId} onWithdrawCreator={withdrawCreator} onWithdrawPlatform={withdrawPlatform} onRefresh={() => handleRefreshChain(chain.chainKey)} />
                    ))}
                    {zeroChains.length > 0 ? (
                      <button
                        onClick={() => { const next = new Set(expandedWallets); void (next.has(wallet.address) ? next.delete(wallet.address) : next.add(wallet.address)); setExpandedWallets(next); }}
                        className="text-[10px] text-muted hover:text-fg transition"
                      >{isExpanded ? "− Hide" : `+ ${zeroChains.length} scanned chain${zeroChains.length > 1 ? "s" : ""} at 0 €`}</button>
                    ) : null}
                    {wallet.chains.length === 0 && !wallet.error ? (
                      <p className="text-xs text-muted py-2">{t("noAssets")}</p>
                    ) : null}
                  </>
                );
               })()}
            </div>
            </div>
            );
        })}
        {filteredResults.length === 0 && filterActive ? (
          <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-8 text-center">
            <p className="text-sm text-muted">No assets match this filter</p>
            <button onClick={() => { setChainFilter([]); setAssetFilter(""); }} className="mt-2 text-xs text-accent hover:underline">Clear filters</button>
          </div>
        ) : null}
          </>
        )}

        {activeTab === "wallets" && (
          <>
          {enabledResults.length === 0 ? (
            <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-8 text-center">
              <p className="text-sm text-muted">{t("noAssets")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {enabledResults.map((wallet) => {
                const cexMeta = (wallet as { isCex?: boolean }).isCex ? parseCexWalletAddress(wallet.address) : null;
                const cexProviderMeta = cexMeta ? getCexProviderMeta(cexMeta.provider) : null;
                const chainCount = wallet.chains.length;
                const tokenCount = wallet.chains.reduce((s, c) => s + c.totals.tokenCount, 0);
                const topTokens = wallet.chains
                  .flatMap(c => c.tokens.map(t => ({ ...t, chainName: c.chainName })))
                  .sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0))
                  .slice(0, 3);
                return (
                  <div key={wallet.address} className="rounded-lg border border-border/60 bg-card p-4 hover:border-accent/30 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-accent truncate max-w-[140px]">
                        {cexProviderMeta ? <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-white"><img src={cexProviderMeta.icon} alt="" className="h-full w-full rounded-full object-contain p-0.5" /></span> : null}
                        <span className="truncate">{wallet.label}</span>
                      </span>
                      {(wallet as { isCex?: boolean }).isCex ? (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">CEX</span>
                      ) : (
                        <VmBadge vm={detectChainType(wallet.address)} />
                      )}
                    </div>
                    <p className="text-xl font-bold tabular-nums mb-2">{formatValue(wallet.totalEur)}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted mb-3">
                      <span>{chainCount} {chainCount > 1 ? t("chains") : t("chain")}</span>
                      <span>{tokenCount} {tokenCount > 1 ? t("tokens") : t("token") ?? "token"}</span>
                    </div>
                    {topTokens.length > 0 ? (
                      <div className="space-y-1.5 pt-2 border-t border-border/30">
                        {topTokens.map(t => (
                          <div key={(t.contract ?? "native") + t.chainName} className="flex items-center justify-between text-[11px]">
                            <span className="text-fg truncate max-w-[100px]">{t.symbol}</span>
                            <span className="text-muted tabular-nums">{formatValue(t.valueEur ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          </>
        )}

        {activeTab === "tokens" && (
          <>
          {enabledResults.length === 0 || enabledResults.every(w => w.chains.every(c => c.totals.tokenCount === 0)) ? (
            <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-8 text-center">
              <p className="text-sm text-muted">{t("noAssets")}</p>
            </div>
          ) : (
            <AllTokensTable enabledResults={enabledResults} />
          )}
          </>
        )}
      </div>
    </main>
  );
}
