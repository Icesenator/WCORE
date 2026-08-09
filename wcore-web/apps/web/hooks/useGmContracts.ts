"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData } from "viem";
import { useSendTransaction, useAccount } from "wagmi";
import { getFactory } from "@wcore/shared";
import { gmOnChainAbi } from "@/lib/gm-abi";
import { apiFetch } from "@/lib/api";
import { useSafeSwitchChain } from "./useSafeSwitchChain";
import { switchChainAny, sendTransactionAny } from "@/lib/onchain-tx";
import { useWallet } from "@/components/ConnectButton";

const MIN_WITHDRAW_WEI = 1_000_000_000_000n;
const LEGACY_GM_CHAIN_IDS: Record<string, number> = {
  duckchain: 5545,
};
let cachedContracts: GmContractWithBalance[] = [];
let cachedKey = "";
// Each listener is bound to a specific cacheKey (the wallet address it cares
// about). publishContracts publishes the (key, contracts) pair, and each
// listener filters on its own key — so a stale response for user A can never
// overwrite the state of a hook subscribed for user B.
type ContractsListener = (key: string, contracts: GmContractWithBalance[]) => void;
const contractListeners = new Set<ContractsListener>();

export interface GmContractWithBalance {
  id: string;
  chainKey: string;
  contractAddress: string;
  creatorBalance: string;
  platformBalance: string;
  role?: string;
}

import nativeSymbolsMap from "@/lib/chain-native-symbols.json";

export function getNativeSymbol(chainKey: string): string {
  return (nativeSymbolsMap as Record<string, string>)[chainKey.toLowerCase()] || "NATIVE";
}

export function weiToNative(value: string): number {
  try {
    const wei = BigInt(value || "0");
    return wei > 0n ? Number(wei) / 1e18 : 0;
  } catch {
    return 0;
  }
}

export function hasWithdrawableBalance(value: string): boolean {
  try {
    return BigInt(value || "0") >= MIN_WITHDRAW_WEI;
  } catch {
    return false;
  }
}

export function getGmContractChainId(chainKey: string): number | undefined {
  const normalized = chainKey.trim().toLowerCase();
  return getFactory(normalized)?.chainId ?? LEGACY_GM_CHAIN_IDS[normalized];
}

function contractPriority(contract: GmContractWithBalance): number {
  if (hasWithdrawableBalance(contract.creatorBalance)) return 3;
  if (hasWithdrawableBalance(contract.platformBalance)) return 2;
  return 1;
}

function publishContracts(key: string, contracts: GmContractWithBalance[]) {
  cachedKey = key;
  cachedContracts = contracts;
  for (const listener of contractListeners) listener(key, contracts);
}

export function useGmContracts(address: string | undefined | null) {
  const cacheKey = address?.toLowerCase() ?? "";
  const [contracts, setContracts] = useState<GmContractWithBalance[]>(cachedKey === cacheKey ? cachedContracts : []);
  const [loading, setLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const activeKeyRef = useRef(cacheKey);
  const { sendTransactionAsync } = useSendTransaction();
  const safeSwitchChain = useSafeSwitchChain();
  const { isConnected } = useAccount();
  const { rawProvider } = useWallet();

  // Keep the selected EIP-6963 provider authoritative; otherwise use wagmi.
  // The wallet picker connects via the raw
  // EIP-6963 path (no wagmi connector), so wagmi's sendTransaction would throw
  // "connector not connected" for withdrawals. See lib/onchain-tx.ts.
  const buildSenders = useCallback(() => {
    return {
      wagmiConnected: isConnected,
      wagmiSend: (p: { to: string; value: bigint; data: string }) =>
        sendTransactionAsync({ to: p.to as `0x${string}`, value: p.value, data: p.data as `0x${string}` }),
      wagmiSwitch: (chainId: number) => safeSwitchChain(chainId),
      rawProvider: rawProvider ?? undefined,
      from: cacheKey || null,
    };
  }, [isConnected, sendTransactionAsync, safeSwitchChain, rawProvider, cacheKey]);

  const refreshContracts = useCallback(async (signal?: AbortSignal) => {
    if (!address) {
      return [];
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/gm/my-contracts", { signal });
      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as { contracts?: Array<GmContractWithBalance> };
      const withBalances = (data.contracts ?? []).map((contract) => ({
        ...contract,
        creatorBalance: contract.creatorBalance || "0",
        platformBalance: contract.platformBalance || "0",
      }));
      if (!signal?.aborted && activeKeyRef.current === cacheKey) publishContracts(cacheKey, withBalances);
      return withBalances;
    } finally {
      if (activeKeyRef.current === cacheKey) setLoading(false);
    }
  }, [address, cacheKey]);

  useEffect(() => {
    activeKeyRef.current = cacheKey;
    const listener = (publishedKey: string, nextContracts: GmContractWithBalance[]) => {
      if (publishedKey === cacheKey) setContracts(nextContracts);
    };
    contractListeners.add(listener);
    setContracts(cachedKey === cacheKey ? cachedContracts : []);
    setWithdrawingId(null);
    return () => { contractListeners.delete(listener); };
  }, [cacheKey]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshContracts(controller.signal).catch((error) => {
      if (!controller.signal.aborted) console.error("Failed to load GM contracts:", error);
    });
    return () => controller.abort();
  }, [refreshContracts]);

  const contractsByChain = useMemo(() => {
    const map = new Map<string, GmContractWithBalance[]>();
    for (const contract of contracts) {
      const key = contract.chainKey.toLowerCase();
      const current = map.get(key) ?? [];
      current.push(contract);
      current.sort((a, b) => contractPriority(b) - contractPriority(a));
      map.set(key, current);
    }
    return map;
  }, [contracts]);

  const withdrawCreator = useCallback(async (contract: GmContractWithBalance) => {
    const chainId = getGmContractChainId(contract.chainKey);
    setWithdrawingId(contract.id);
    try {
      if (!chainId) throw new Error(`Unsupported GM contract chain: ${contract.chainKey}`);
      const senders = buildSenders();
      await switchChainAny(senders, chainId);
      const data = encodeFunctionData({ abi: gmOnChainAbi, functionName: "withdrawCreator" });
      await sendTransactionAny(senders, { to: contract.contractAddress, value: 0n, data });
      await refreshContracts();
    } finally {
      setWithdrawingId(null);
    }
  }, [refreshContracts, buildSenders]);

  const withdrawPlatform = useCallback(async (contract: GmContractWithBalance) => {
    const chainId = getGmContractChainId(contract.chainKey);
    setWithdrawingId(contract.id);
    try {
      if (!chainId) throw new Error(`Unsupported GM contract chain: ${contract.chainKey}`);
      const senders = buildSenders();
      await switchChainAny(senders, chainId);
      const data = encodeFunctionData({ abi: gmOnChainAbi, functionName: "withdrawPlatform" });
      await sendTransactionAny(senders, { to: contract.contractAddress, value: 0n, data });
      await refreshContracts();
    } finally {
      setWithdrawingId(null);
    }
  }, [refreshContracts, buildSenders]);

  return { contracts, contractsByChain, loading, withdrawingId, refreshContracts, withdrawCreator, withdrawPlatform };
}
