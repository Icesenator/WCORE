"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useWallet } from "@/components/ConnectButton";
import { useGmContracts, type GmContractWithBalance } from "@/hooks/useGmContracts";
import { getApiUrl, apiFetch } from "@/lib/api";

const API_URL = getApiUrl();

interface GmContextValue {
  // Per-chain deployment state (unified source of truth)
  /** Per-chain: has the user deployed a GM contract? null = loading/unknown */
  deployedByChain: Record<string, boolean | null>;
  /** Per-chain: has user done on-chain GM today? */
  gmDoneByChain: Record<string, boolean>;
  /** Whether deployment status has been initialized for a chain */
  isChainInitialized: (chainKey: string) => boolean;

  // Global GM state
  offChainDoneToday: boolean;
  onChainDoneToday: boolean;
  gmStreak: number;
  globalStatusLoaded: boolean;

  // Contract data (single shared fetch)
  contracts: GmContractWithBalance[];
  contractsByChain: Map<string, GmContractWithBalance[]>;
  contractsLoading: boolean;
  withdrawingId: string | null;

  // Actions
  /** Mark a chain as deployed (called after successful deploy or wcore-gm-done event) */
  markDeployed: (chainKey: string) => void;
  /** Mark GM done for a chain */
  markGmDone: (chainKey: string) => void;
  /** Refresh deployed status for a specific chain from API */
  refreshDeployedStatus: (chainKey: string) => Promise<void>;
  /** Refresh all contract data from API */
  refreshContracts: () => Promise<GmContractWithBalance[]>;
  /** Refresh global GM status from API */
  refreshGlobalStatus: () => Promise<void>;
  /** Withdraw creator tips from a contract */
  withdrawCreator: (contract: GmContractWithBalance) => Promise<void>;
  /** Withdraw platform fees from a contract */
  withdrawPlatform: (contract: GmContractWithBalance) => Promise<void>;
}

const GmContext = createContext<GmContextValue | null>(null);

export function useGm(): GmContextValue {
  const ctx = useContext(GmContext);
  if (!ctx) throw new Error("useGm must be used within GmProvider");
  return ctx;
}

/** Optional: returns undefined instead of throwing, for components that may render outside GmProvider */
export function useGmOptional(): GmContextValue | undefined {
  return useContext(GmContext) ?? undefined;
}

export function GmProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress } = useWallet();

  // Contract data — single shared fetch replaces N independent useGmContracts calls
  const {
    contracts,
    contractsByChain,
    loading: contractsLoading,
    withdrawingId,
    refreshContracts,
    withdrawCreator,
    withdrawPlatform,
  } = useGmContracts(walletAddress);

  // Global GM status
  const [offChainDoneToday, setOffChainDoneToday] = useState(false);
  const [onChainDoneToday, setOnChainDoneToday] = useState(false);
  const [gmStreak, setGmStreak] = useState(0);
  const [globalStatusLoaded, setGlobalStatusLoaded] = useState(false);

  // Per-chain deployed state — the unified source of truth
  const [deployedByChain, setDeployedByChain] = useState<Record<string, boolean | null>>({});
  const [gmDoneByChain, setGmDoneByChain] = useState<Record<string, boolean>>({});
  const initializedRef = useRef<Set<string>>(new Set());

  const refreshGlobalStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/api/auth/me`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        gmOffChainToday?: boolean;
        gmOnChainToday?: boolean;
        gmStreak?: number;
      };
      setOffChainDoneToday(!!data.gmOffChainToday);
      setOnChainDoneToday(!!data.gmOnChainToday);
      setGmStreak(data.gmStreak ?? 0);
      setGlobalStatusLoaded(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshGlobalStatus();
  }, [refreshGlobalStatus]);

  const refreshDeployedStatus = useCallback(
    async (chainKey: string) => {
      if (!walletAddress) return;
      try {
        const res = await apiFetch(`${API_URL}/api/gm/status`);
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, { deployed: boolean; gmDone: boolean }>;
        const s = data[chainKey];
        if (s) {
          setDeployedByChain((prev) => ({ ...prev, [chainKey]: s.deployed ? true : prev[chainKey] ?? false }));
          setGmDoneByChain((prev) => ({ ...prev, [chainKey]: prev[chainKey] || s.gmDone }));
          initializedRef.current.add(chainKey);
        }
      } catch {
        /* ignore — consumer hooks will fall back to on-chain check */
      }
    },
    [walletAddress],
  );

  const markDeployed = useCallback((chainKey: string) => {
    setDeployedByChain((prev) => ({ ...prev, [chainKey]: true }));
    initializedRef.current.add(chainKey);
  }, []);

  const markGmDone = useCallback((chainKey: string) => {
    setGmDoneByChain((prev) => ({ ...prev, [chainKey]: true }));
  }, []);

  const isChainInitialized = useCallback((chainKey: string) => {
    return initializedRef.current.has(chainKey);
  }, []);

  // Listen for wcore-gm-done events from any source (header, ChainCard, /gm page)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { chain?: string };
      if (detail.chain) {
        markDeployed(detail.chain);
        markGmDone(detail.chain);
      }
      void refreshGlobalStatus();
    };
    window.addEventListener("wcore-gm-done", handler);
    return () => window.removeEventListener("wcore-gm-done", handler);
  }, [markDeployed, markGmDone, refreshGlobalStatus]);

  const value = useMemo<GmContextValue>(
    () => ({
      deployedByChain,
      gmDoneByChain,
      isChainInitialized,
      offChainDoneToday,
      onChainDoneToday,
      gmStreak,
      globalStatusLoaded,
      contracts,
      contractsByChain,
      contractsLoading,
      withdrawingId,
      markDeployed,
      markGmDone,
      refreshDeployedStatus,
      refreshContracts,
      refreshGlobalStatus,
      withdrawCreator,
      withdrawPlatform,
    }),
    [
      deployedByChain,
      gmDoneByChain,
      isChainInitialized,
      offChainDoneToday,
      onChainDoneToday,
      gmStreak,
      globalStatusLoaded,
      contracts,
      contractsByChain,
      contractsLoading,
      withdrawingId,
      markDeployed,
      markGmDone,
      refreshDeployedStatus,
      refreshContracts,
      refreshGlobalStatus,
      withdrawCreator,
      withdrawPlatform,
    ],
  );

  return <GmContext.Provider value={value}>{children}</GmContext.Provider>;
}
