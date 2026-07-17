"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ChainScan } from "@wcore/shared";
import { detectChainType } from "@wcore/shared";
import { getApiUrl } from "@/lib/api";
import { boundedApiFetch } from "@/lib/cex-api";
import { fetchBatchScan, makeErrorChainScan } from "@/lib/scan-api";
import { matchCompatibleChains, type ChainScanMeta, type ScanVm } from "@/lib/chain-filter";
import { getScanProgressDisplay } from "@/components/scan-progress";
import { mergeChainResults, orderScanJobsForExecution } from "@/components/scan-results";
import { runWithConcurrency } from "@/lib/concurrency";

const API_URL = getApiUrl();
const GLOBAL_CHAIN_CONCURRENCY = Math.max(1, Math.floor(Number(process.env.NEXT_PUBLIC_SCAN_CONCURRENCY) || 50));
// PERF-8: batch multiple chains of the same VM into a single /api/scan/batch
// request instead of one request per chain. Keeps progressive UI (results land
// per-batch) while collapsing ~110 HTTP requests into ~110/BATCH. The server
// already scans multiple chains per request; this just stops the per-chain
// transport overhead (TCP/TLS/headers ≈ 50ms each).
const CHAIN_BATCH_SIZE = Math.max(1, Math.floor(Number(process.env.NEXT_PUBLIC_CHAIN_BATCH_SIZE) || 5));

// Module-level memo: the chain list is static for the API lifetime — fetch once per page load.
let chainMetaMapPromise: Promise<Record<string, ChainScanMeta>> | null = null;
function loadChainMetaMap(): Promise<Record<string, ChainScanMeta>> {
  if (chainMetaMapPromise) return chainMetaMapPromise;
  chainMetaMapPromise = (async () => {
    const map: Record<string, ChainScanMeta> = {};
    try {
      const res = await boundedApiFetch("/api/chains");
      const data = await res.json() as { chains?: Array<{ key: string; vm: string; disabled?: boolean }> };
      if (data.chains) for (const ch of data.chains) map[ch.key.toUpperCase()] = { vm: ch.vm, disabled: !!ch.disabled };
    } catch { /* fallback logic handles unknown chains */ }
    return map;
  })();
  // On failure, allow a retry next scan rather than caching the empty map forever.
  chainMetaMapPromise.then((m) => { if (Object.keys(m).length === 0) chainMetaMapPromise = null; });
  return chainMetaMapPromise;
}

type ScanResult = { address: string; label: string; chains: ChainScan[]; totalEur: number; error?: string };

export type ScanOrchestratorTask = { index: number; addr: string; vm: string; chains: string[] };
export type ScanOrchestratorJob = { vm: ScanVm; chains: string[]; tasks: ScanOrchestratorTask[] };

export function buildScanOrchestratorJobs({
  enabledAddresses,
  chains,
  chainMetaMap,
  batchSize,
}: {
  enabledAddresses: string[];
  chains: string[];
  chainMetaMap: Record<string, ChainScanMeta>;
  batchSize: number;
}): ScanOrchestratorJob[] {
  const walletTasks: ScanOrchestratorTask[] = [];
  for (let i = 0; i < enabledAddresses.length; i++) {
    const addr = enabledAddresses[i]!;
    const addrVm = detectChainType(addr);
    const matchingChains = matchCompatibleChains(addrVm, chains, chainMetaMap);
    if (matchingChains.length > 0) walletTasks.push({ index: i, addr, vm: addrVm, chains: matchingChains });
  }

  const byVm = new Map<ScanVm, { chains: Set<string>; tasks: ScanOrchestratorTask[] }>();
  for (const task of walletTasks) {
    const vm = task.vm as ScanVm;
    let entry = byVm.get(vm);
    if (!entry) { entry = { chains: new Set(), tasks: [] }; byVm.set(vm, entry); }
    entry.tasks.push(task);
    for (const chain of task.chains) entry.chains.add(chain);
  }

  const jobs: ScanOrchestratorJob[] = [];
  for (const [vm, entry] of byVm) {
    const vmChains = Array.from(entry.chains);
    for (let i = 0; i < vmChains.length; i += batchSize) {
      const chunk = vmChains.slice(i, i + batchSize);
      const chunkTasks = entry.tasks.filter(t => t.chains.some(ch => chunk.includes(ch)));
      if (chunkTasks.length > 0) jobs.push({ vm, chains: chunk, tasks: chunkTasks });
    }
  }
  return jobs;
}

export interface ScanOrchestratorParams {
  addresses: string[];
  chains: string[];
  deepScan: boolean;
  customTokenList: string[];
  labels: Record<string, string>;
  enabledAddresses: string[];
}

export function useScanOrchestrator({
  chains,
  deepScan,
  customTokenList,
  labels,
  enabledAddresses,
}: ScanOrchestratorParams) {
  const [results, setResults] = useState<Array<ScanResult> | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [chainProgress, setChainProgress] = useState({ done: 0, total: 0 });
  const [overallChainProgress, setOverallChainProgress] = useState({ done: 0, total: 0 });
  const prevResultsRef = useRef<Array<ScanResult>>([]);
  const [scanningAddr, setScanningAddr] = useState<string | null>(null);
  const [scanningSince, setScanningSince] = useState<number>(0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [retryingTimedOut, setRetryingTimedOut] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [_scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [scanDuration, setScanDuration] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [scanTrigger, setScanTrigger] = useState(0);
  const [lastScanCompleteTime, setLastScanCompleteTime] = useState<number>(0);
  const forceRefreshRef = useRef(false);
  // When non-empty, force-refresh (cache bypass) applies ONLY to these addresses;
  // other wallets re-scan from cache. Empty = force applies to all (global refresh).
  const forceRefreshAddrsRef = useRef<Set<string>>(new Set());
  const scanRunIdRef = useRef(0);
  const [circuitBreakers, setCircuitBreakers] = useState<Record<string, { state: string; failureCount: number; openedAt: number | null }>>({});
  const [activeScanChains, setActiveScanChains] = useState<Map<string, Set<string>>>(new Map());

  const scanChains = useMemo(() => {
    return Array.from(new Set(Array.from(activeScanChains.values()).flatMap(s => Array.from(s)))).slice(0, GLOBAL_CHAIN_CONCURRENCY);
  }, [activeScanChains]);

  // Update result labels when labels map changes (e.g. after API fetch)
  useEffect(() => {
    if (!results) return;
    setResults((prev) => prev?.map((w) => ({
      ...w,
      label: labels[w.address.toLowerCase()] ?? w.address.slice(0, 10),
    })) ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels]);

  // Main scan lifecycle
  useEffect(() => {
    let c = false;
    const cancelSignal = { get aborted() { return c; } };
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      // Preserve previous results for deselected wallets
      const initial: Array<ScanResult> = enabledAddresses.map((addr) => {
        const prev = prevResultsRef.current.find(r => r.address.toLowerCase() === addr.toLowerCase());
        return prev ?? {
          address: addr,
          label: labels[addr.toLowerCase()] ?? addr.slice(0, 10),
          chains: [],
          totalEur: 0,
        };
      });
      setResults(initial);
      const myRunId = ++scanRunIdRef.current;
      const startTime = Date.now();
      setScanStartTime(startTime);
      setElapsed(0);

      timer = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTime) / 1000));
      }, 1000);

      let done = 0;
      const total = enabledAddresses.length;
      setProgress({ done: 0, total });
      setChainProgress({ done: 0, total: 0 });
      setOverallChainProgress({ done: 0, total: 0 });

      const updated = [...initial];
      let flushPending = false;

      // Preload chain VM types + disabled flags for accurate filtering.
      const chainMetaMap = await loadChainMetaMap();
      if (c || myRunId !== scanRunIdRef.current) return;

      // Build scan tasks per wallet
      const jobs = buildScanOrchestratorJobs({
        enabledAddresses,
        chains,
        chainMetaMap,
        batchSize: CHAIN_BATCH_SIZE,
      });
      const walletTasks = Array.from(new Map(jobs.flatMap(job => job.tasks).map(task => [task.index, task])).values());
      let doneChainChecks = 0;
      // Pre-calculate total chain checks for non-cached wallets
      const totalChainChecks = walletTasks.reduce((sum, task) => sum + task.chains.length, 0);
      setOverallChainProgress({ done: 0, total: totalChainChecks });

      done += enabledAddresses.length - walletTasks.length;
      if (done > 0) setProgress({ done, total });
      setOverallChainProgress({ done: 0, total: totalChainChecks });

      // One global sliding scheduler across EVM/SVM/Cosmos. Each job covers a
      // CHUNK of chains (CHAIN_BATCH_SIZE) for all compatible wallets of one VM,
      // sent as a single /api/scan/batch request (PERF-8). The API batch endpoint
      // optimizes EVM with a single Multicall3 and falls back internally for
      // SVM/Cosmos, while GLOBAL_CHAIN_CONCURRENCY caps total active chains.
      const remainingByWallet = new Map<number, number>();
      for (const task of walletTasks) remainingByWallet.set(task.index, task.chains.length);
      const errorsByWallet = new Map<number, string>();

      function markWalletChainDone(task: typeof walletTasks[number], chain: string, chains: ChainScan[], error?: string) {
        const previousChains = updated[task.index]?.chains ?? [];
        const finalChains = chains.length > 0 ? chains : [makeErrorChainScan(chain, task.vm as ScanVm, error || "scan_failed")];
        const merged = mergeChainResults(previousChains, finalChains);
        if (error) errorsByWallet.set(task.index, error);
        updated[task.index] = {
          address: task.addr,
          label: labels[task.addr.toLowerCase()] ?? task.addr.slice(0, 10),
          chains: merged.chains,
          totalEur: merged.totalEur,
          error: errorsByWallet.get(task.index),
        };
        // Batch state updates: use requestAnimationFrame to coalesce multiple
        // chain completions into a single re-render instead of 110+ per scan.
        if (!flushPending) {
          flushPending = true;
          requestAnimationFrame(() => {
            flushPending = false;
            if (c) return;
            setResults([...updated]);
          });
        }
        doneChainChecks++;
        setOverallChainProgress({ done: doneChainChecks, total: totalChainChecks });

        const remaining = Math.max(0, (remainingByWallet.get(task.index) ?? 1) - 1);
        remainingByWallet.set(task.index, remaining);
        if (remaining === 0) {
          done++;
          setProgress({ done, total });
        }
      }

      let completedJobs = 0;
      const scanOneJob = async (job: ScanOrchestratorJob): Promise<void> => {
        const addressesForJob = job.tasks.map(t => t.addr);
        setScanningAddr(`${job.vm} batch ${completedJobs + 1}/${jobs.length}`);
        setScanningSince(Date.now());
        setActiveScanChains(prev => {
          const next = new Map(prev);
          for (const addr of addressesForJob) {
            const addrChains = new Set(next.get(addr) || []);
            for (const chain of job.chains) addrChains.add(chain);
            next.set(addr, addrChains);
          }
          return next;
        });

        // For each (task, chain) pair, whether the chain applies to that wallet.
        const taskChainPairs = job.tasks.flatMap(task =>
          job.chains.filter(ch => task.chains.includes(ch)).map(chain => ({ task, chain }))
        );

        try {
          // Scope force-refresh per address: a single-wallet "refresh" must not
          // force a cache bypass (= max RPC fan-out) on every other wallet.
          const scoped = forceRefreshAddrsRef.current;
          const globalForce = forceRefreshRef.current;
          const forceGroup = scoped.size > 0 ? addressesForJob.filter(a => scoped.has(a.toLowerCase())) : (globalForce ? addressesForJob : []);
          const cacheGroup = addressesForJob.filter(a => !forceGroup.includes(a));

          // byAddress[addr] → Map<chainKey, ChainScan> for the whole batch.
          const byAddress = new Map<string, Map<string, ChainScan>>();
          let jobError: string | undefined;
          for (const [group, force] of [[forceGroup, true], [cacheGroup, false]] as const) {
            if (group.length === 0) continue;
            const batchResult = await fetchBatchScan(group, job.chains, deepScan, customTokenList, force);
            if (myRunId !== scanRunIdRef.current) return;
            if (batchResult?.wallets) {
              for (const w of batchResult.wallets) {
                const chainMap = byAddress.get(w.address.toLowerCase()) ?? new Map<string, ChainScan>();
                for (const c of w.chains) chainMap.set(c.chainKey.toUpperCase(), c);
                byAddress.set(w.address.toLowerCase(), chainMap);
              }
            }
            if (batchResult?.error) jobError = batchResult.error;
          }

          // Dispatch each (task, chain) result individually so the per-chain
          // progress counters and per-chain merge logic stay intact.
          for (const { task, chain } of taskChainPairs) {
            const chainMap = byAddress.get(task.addr.toLowerCase());
            const chainResult = chainMap?.get(chain.toUpperCase());
            if (chainResult) markWalletChainDone(task, chain, [chainResult]);
            else markWalletChainDone(task, chain, [], jobError || "batch_missing_chain_result");
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "batch_scan_failed";
          console.warn("Batch scan job failed:", { vm: job.vm, chains: job.chains, message });
          for (const { task, chain } of taskChainPairs) markWalletChainDone(task, chain, [], message);
        } finally {
          if (!c && myRunId === scanRunIdRef.current) {
            completedJobs++;
            setScanningAddr(`${job.vm} batch ${completedJobs}/${jobs.length}`);
            setActiveScanChains(prev => {
              const next = new Map(prev);
              for (const addr of addressesForJob) {
                const addrChains = new Set(next.get(addr) || []);
                for (const chain of job.chains) addrChains.delete(chain);
                if (addrChains.size === 0) next.delete(addr);
                else next.set(addr, addrChains);
              }
              return next;
            });
          }
        }
      };

      // Start SVM/Cosmos first so they are not buried behind the EVM flood, but
      // keep one shared pool so EVM scans run in parallel instead of waiting.
      // Each job now covers CHAIN_BATCH_SIZE chains, so divide the job-level
      // concurrency to keep the number of chains in flight ≈ GLOBAL_CHAIN_CONCURRENCY
      // (don't multiply RPC pressure on the server by batching).
      const jobConcurrency = Math.max(1, Math.floor(GLOBAL_CHAIN_CONCURRENCY / CHAIN_BATCH_SIZE));
      await runWithConcurrency(orderScanJobsForExecution(jobs), jobConcurrency, scanOneJob, cancelSignal);
      // Final flush: ensure all batched updates are applied before processing results
      if (flushPending) {
        flushPending = false;
        setResults([...updated]);
      }
      if (c || myRunId !== scanRunIdRef.current) return;
      clearInterval(timer);
      const endTime = Date.now();
      setScanDuration(Math.round((endTime - startTime) / 1000));
      setScanningAddr(null);
      setActiveScanChains(new Map());
      setScanStartTime(null);
      setLastScanCompleteTime(endTime);
      setRefreshingAll(false);
      forceRefreshRef.current = false;
      forceRefreshAddrsRef.current = new Set();
      if (total > 0) {
        const chainCount = new Set(updated.flatMap(u => u.chains.map(c => c.chainKey))).size;
        const tokenCount = updated.flatMap(u => u.chains).reduce((s, c) => s + c.totals.tokenCount, 0);
        setToastMsg(`Scan complete · ${chainCount} chains · ${tokenCount} tokens`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 4000);
      }
    })();
    return () => {
      c = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- this ref is a scan generation counter, not a rendered node.
      scanRunIdRef.current++;
      if (timer) clearInterval(timer);
      setScanningAddr(null);
      setActiveScanChains(new Map());
      setScanStartTime(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chains.join(","), deepScan, scanTrigger]);

  useEffect(() => {
    // Debounce circuit breaker fetch to avoid 110+ redundant HTTP calls during scan.
    // Fetch at most once every 10s or when scan completes.
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/circuit`)
        .then(r => r.json())
        .then((d: { circuits?: Record<string, { state: string; failureCount: number; openedAt: number | null }> }) => {
          if (d.circuits) setCircuitBreakers(d.circuits);
        })
        .catch(() => {});
    }, 10_000);
    return () => clearTimeout(timer);
  }, [results]);

  const resultAddresses = new Set((results ?? []).map(r => r.address.toLowerCase()));
  /* eslint-disable react-hooks/refs */
  const displayResults = (results ?? []).concat(
    prevResultsRef.current.filter(pr => !resultAddresses.has(pr.address.toLowerCase()))
  );
  const scanProgressDisplay = getScanProgressDisplay({
    walletDone: progress.done,
    walletTotal: progress.total,
    currentChainDone: chainProgress.done,
    currentChainTotal: chainProgress.total,
    overallChainDone: overallChainProgress.done,
    overallChainTotal: overallChainProgress.total,
    deepScan,
  });

  const timedOutChains = useMemo(() => {
    if (!results) return [];
    const chains: Array<{ chainKey: string; chainName: string; address: string; label: string }> = [];
    for (const r of results) {
      for (const c of r.chains) {
        if (c.errors?.some((e: { message?: string }) => e.message?.includes("chain_timeout"))) {
          chains.push({ chainKey: c.chainKey, chainName: c.chainName, address: r.address, label: r.label });
        }
      }
    }
    return chains;
  }, [results]);
  const circuitOpenChains = useMemo(() => {
    if (!results) return [];
    const chains: Array<{ chainKey: string; chainName: string; address: string; label: string }> = [];
    for (const r of results) {
      for (const c of r.chains) {
        if (c.errors?.some((e: { message?: string }) => e.message?.includes("circuit_open"))) {
          chains.push({ chainKey: c.chainKey, chainName: c.chainName, address: r.address, label: r.label });
        }
      }
    }
    return chains;
  }, [results]);

  const handleRetryTimedOut = useCallback(async () => {
    setRetryingTimedOut(true);
    const uniqueChains = new Map<string, string[]>();
    for (const c of timedOutChains) {
      const addrs = uniqueChains.get(c.chainKey) ?? [];
      if (!addrs.includes(c.address)) addrs.push(c.address);
      uniqueChains.set(c.chainKey, addrs);
    }
    for (const [chainKey, addrs] of uniqueChains) {
      const batchResult = await fetchBatchScan(addrs, [chainKey], deepScan, customTokenList, true);
      if (batchResult?.wallets) {
        const byAddress = new Map(batchResult.wallets.map(w => [w.address.toLowerCase(), w]));
        setResults(prev => (prev ?? []).map(wallet => {
          const fresh = byAddress.get(wallet.address.toLowerCase());
          if (!fresh) return wallet;
          const idx = wallet.chains.findIndex(c => c.chainKey === chainKey);
          const newChain = fresh.chains[0];
          const newChains = idx >= 0
            ? wallet.chains.map((c, i) => i === idx && newChain ? newChain : c)
            : newChain ? [...wallet.chains, newChain] : wallet.chains;
          const sorted = newChains.sort((a, b) => b.totals.valueEur - a.totals.valueEur);
          return { ...wallet, chains: sorted, totalEur: Math.round(sorted.reduce((s, c) => s + c.totals.valueEur, 0) * 100) / 100 };
        }));
      }
    }
    setRetryingTimedOut(false);
  }, [timedOutChains, deepScan, customTokenList]);
  /* eslint-enable react-hooks/refs */

  const triggerForceRefresh = useCallback(() => {
    setRefreshingAll(true);
    forceRefreshRef.current = true;
    forceRefreshAddrsRef.current = new Set(); // global force
    setScanTrigger(s => s + 1);
  }, []);

  // Refresh a single wallet: force-refresh (cache bypass) only that address;
  // other wallets re-scan from cache instead of hammering RPCs.
  const refreshWallet = useCallback((addr: string) => {
    forceRefreshRef.current = false;
    forceRefreshAddrsRef.current = new Set([addr.toLowerCase()]);
    setScanTrigger(s => s + 1);
  }, []);

  const mergePrevResults = useCallback((incoming: ScanResult[]) => {
    const merged = [...prevResultsRef.current];
    for (const r of incoming) {
      const idx = merged.findIndex(m => m.address.toLowerCase() === r.address.toLowerCase());
      if (idx >= 0) merged[idx] = r;
      else merged.push(r);
    }
    prevResultsRef.current = merged;
  }, []);

  return {
    results,
    setResults,
    progress,
    chainProgress,
    overallChainProgress,
    mergePrevResults,
    scanningAddr,
    scanningSince,
    refreshingAll,
    setRefreshingAll,
    retryingTimedOut,
    showToast,
    toastMsg,
    scanDuration,
    elapsed,
    scanTrigger,
    setScanTrigger,
    lastScanCompleteTime,
    triggerForceRefresh,
    refreshWallet,
    circuitBreakers,
    activeScanChains,
    scanChains,
    displayResults,
    scanProgressDisplay,
    timedOutChains,
    circuitOpenChains,
    handleRetryTimedOut,
  };
}
