"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData } from "viem";
import { useSendTransaction, useAccount } from "wagmi";
import { getFactory } from "@wcore/shared";
import { gmOnChainAbi } from "@/lib/gm-abi";
import { apiFetch } from "@/lib/api";
import { useSafeSwitchChain } from "./useSafeSwitchChain";
import { switchChainAny, sendTransactionAny, type RawProvider } from "@/lib/onchain-tx";

const MIN_WITHDRAW_WEI = 1_000_000_000_000n;
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
  return getFactory(chainKey)?.chainId;
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
  const { sendTransactionAsync } = useSendTransaction();
  const safeSwitchChain = useSafeSwitchChain();
  const { isConnected } = useAccount();

  // Route through wagmi when a connector is connected, fall back to the raw
  // injected provider otherwise. The wallet picker connects via the raw
  // EIP-6963 path (no wagmi connector), so wagmi's sendTransaction would throw
  // "connector not connected" for withdrawals. See lib/onchain-tx.ts.
  const buildSenders = useCallback(() => {
    const rawProvider = (typeof window !== "undefined"
      ? (window as unknown as { ethereum?: RawProvider }).ethereum
      : undefined);
    return {
      wagmiConnected: isConnected,
      wagmiSend: (p: { to: string; value: bigint; data: string }) =>
        sendTransactionAsync({ to: p.to as `0x${string}`, value: p.value, data: p.data as `0x${string}` }),
      wagmiSwitch: (chainId: number) => safeSwitchChain(chainId),
      rawProvider,
      from: cacheKey || null,
    };
  }, [isConnected, sendTransactionAsync, safeSwitchChain, cacheKey]);

  const refreshContracts = useCallback(async () => {
    if (!address) {
      return [];
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/gm/my-contracts");
      if (!res.ok) {
        return [];
      }

      const data = (await res.json()) as { contracts?: Array<GmContractWithBalance> };
      const withBalances = (data.contracts ?? []).map((contract) => ({
        ...contract,
        creatorBalance: contract.creatorBalance || "0",
        platformBalance: contract.platformBalance || "0",
      }));
      publishContracts(cacheKey, withBalances);
      return withBalances;
    } finally {
      setLoading(false);
    }
  }, [address, cacheKey]);

  useEffect(() => {
    const listener = (publishedKey: string, nextContracts: GmContractWithBalance[]) => {
      if (publishedKey === cacheKey) setContracts(nextContracts);
    };
    contractListeners.add(listener);
    if (cachedKey === cacheKey) setContracts(cachedContracts);
    return () => { contractListeners.delete(listener); };
  }, [cacheKey]);

  useEffect(() => {
    void refreshContracts();
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
      const senders = buildSenders();
      if (chainId) await switchChainAny(senders, chainId);
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
      const senders = buildSenders();
      if (chainId) await switchChainAny(senders, chainId);
      const data = encodeFunctionData({ abi: gmOnChainAbi, functionName: "withdrawPlatform" });
      await sendTransactionAny(senders, { to: contract.contractAddress, value: 0n, data });
      await refreshContracts();
    } finally {
      setWithdrawingId(null);
    }
  }, [refreshContracts, buildSenders]);

  return { contracts, contractsByChain, loading, withdrawingId, refreshContracts, withdrawCreator, withdrawPlatform };
}
