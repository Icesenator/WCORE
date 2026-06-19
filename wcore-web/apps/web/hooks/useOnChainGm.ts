"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { encodeFunctionData } from "viem";
import { useSendTransaction, useChainId, useAccount } from "wagmi";
import { gmOnChainAbi, gmFactoryAbi } from "@/lib/gm-abi";
import { getFactory, getFactoryAddress } from "@wcore/shared";
import { getApiUrl, apiFetch } from "@/lib/api";
import { lsContractDeployed, lsSetContractDeployed, lsSetGmDone } from "@/lib/gm-storage";
import { useSafeSwitchChain } from "./useSafeSwitchChain";
import { switchChainAny, sendTransactionAny, type RawProvider } from "@/lib/onchain-tx";

export { getFactoryAddress };

export function getGmChainId(chainKey: string): number {
  const f = getFactory(chainKey);
  if (!f) throw new Error(`GM not supported on ${chainKey}. Factory not deployed yet.`);
  return f.chainId;
}

const API_URL = getApiUrl();

interface GmConfig {
  chainKey?: string;
  walletAddress: string | null;
  streak: number;
  /**
   * Optional map of prefetched native prices keyed by chainKey. When the page
   * pre-warms /api/price/native on mount, deployContract and sendGm can read
   * the price synchronously from this map and skip the 3-retry ladder that
   * previously delayed the MetaMask popup by 500-1500ms.
   */
  nativePriceMap?: Record<string, number>;
}

interface RandomContract {
  chainKey: string;
  contractAddress: string;
}

export function useOnChainGm(config: GmConfig) {
  const [sending, setSending] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const { sendTransactionAsync } = useSendTransaction();
  const safeSwitchChain = useSafeSwitchChain();
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const chainIdRef = useRef(currentChainId);
  useEffect(() => { chainIdRef.current = currentChainId; }, [currentChainId]);

  // The wallet picker connects MetaMask/Rabby/etc. via the raw EIP-6963 path
  // (ConnectButton.connectWith) which never registers a wagmi connector, so
  // `isConnected` is false even though the user is logged in. Wagmi's
  // sendTransaction/switchChain throw "connector not connected" in that case.
  // Build a sender set that routes through wagmi when a connector exists and
  // falls back to the raw injected provider otherwise (same approach as the
  // raw `personal_sign` login fallback).
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
      from: config.walletAddress,
    };
  }, [isConnected, sendTransactionAsync, safeSwitchChain, config.walletAddress]);

  const getRandomContract = useCallback(async (): Promise<RandomContract> => {
    const params = new URLSearchParams();
    // ChainCard passes chainKey → filter to that chain's contracts
    // Header doesn't pass chainKey → pick from ALL site contracts
    if (config.chainKey) params.set("chain", config.chainKey);
    if (config.walletAddress) params.set("address", config.walletAddress);
    const res = await apiFetch(`${API_URL}/api/gm/random?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "no_contracts_available" })) as { error?: string };
      throw new Error(err.error || "no_contracts_available");
    }
    return res.json();
  }, [config.chainKey, config.walletAddress]);

  const checkHasDeployed = useCallback(async (): Promise<boolean | null> => {
    const chain = config.chainKey?.toLowerCase();
    if (!chain) return null;

    if (lsContractDeployed(chain)) return true;

    try {
      const depRes = await apiFetch(`${API_URL}/api/gm/has-deployed?chain=${chain}`);
      if (depRes.ok) {
          const depData = (await depRes.json()) as { hasDeployed?: boolean };
          if (depData.hasDeployed) { lsSetContractDeployed(chain, "1"); return true; }
      }
      return false;
    } catch {
      return false;
    }
  }, [config.chainKey]);

  // The chain must be the one actually being used for the tx. For the header GM,
  // config.chainKey is undefined and the real chain comes from getRandomContract()
  // — passing it explicitly avoids /api/price/native?chain=undefined.
  const fetchNativePrice = useCallback(async (chainKey: string | undefined): Promise<number> => {
    if (!chainKey) throw new Error("Native price chain missing");
    // Use the prefetched price when the page warmed it on mount. This is the
    // hot path for /gm and the header GM button: the price is already in
    // memory, so deployContract and sendGm can proceed straight to
    // safeSwitchChain / sendTransactionAsync without waiting for the network.
    const prefetched = config.nativePriceMap?.[chainKey.toLowerCase()];
    if (prefetched && prefetched > 0) return prefetched;
    // The native price endpoint depends on DefiLlama/CoinGecko which hiccup
    // transiently. Retry a couple of times before failing the GM flow so a
    // single upstream blip doesn't surface "Native price zero".
    let lastErr = `Native price unavailable for ${chainKey}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetch(`${API_URL}/api/price/native?chain=${encodeURIComponent(chainKey)}`);
        if (res.ok) {
          const data = await res.json() as { price?: number };
          if (data.price && data.price > 0) return data.price;
          lastErr = `Native price unavailable for ${chainKey} — try again in a moment`;
        }
      } catch (e) { lastErr = (e as Error).message || lastErr; }
      if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
    throw new Error(lastErr);
  }, [config.nativePriceMap]);

  const sendGm = useCallback(async (): Promise<string> => {
    if (!config.walletAddress) throw new Error("Wallet not connected");
    setSending(true);
    try {
      // Always pick a random contract from ALL contracts on the site
      const contractInfo = await getRandomContract();
      const { chainKey, contractAddress } = contractInfo;

      const senders = buildSenders();
      const expectedChainId = getGmChainId(chainKey);
      try {
        await switchChainAny(senders, expectedChainId);
      } catch {
        throw new Error(`Could not switch to ${chainKey.replace(/_/g, " ")}. Check your wallet and try again.`);
      }
      // Some wallets silently no-op on switchChain, and wagmi React state may be stale.
      // Poll the wallet directly for up to 3s until it confirms the switch.
      const switchDeadline = Date.now() + 3000;
      let providerConfirmed = false;
      while (Date.now() < switchDeadline) {
        if (chainIdRef.current === expectedChainId) { providerConfirmed = true; break; }
        // Also check wallet directly for providers that lag behind wagmi state
        const actualHex = await window.ethereum?.request({ method: "eth_chainId" }).catch(() => null) as string | null;
        if (actualHex && Number(actualHex) === expectedChainId) { providerConfirmed = true; break; }
        await new Promise((r) => setTimeout(r, 250));
      }
      // Accept the provider-confirmed switch even if wagmi React state still lags.
      if (!providerConfirmed && chainIdRef.current !== expectedChainId) {
        throw new Error(`Wallet did not switch to ${chainKey.replace(/_/g, " ")}. Switch manually and retry.`);
      }

      const ethPrice = await fetchNativePrice(chainKey);
      if (!ethPrice || ethPrice <= 0) throw new Error("ETH price unavailable");
      const tipUsd = 0.05;
      const tipWei = BigInt(Math.ceil(tipUsd / ethPrice * 1e18 * 1.02));

      const data = encodeFunctionData({
        abi: gmOnChainAbi,
        functionName: "sayGm",
        args: [BigInt(config.streak)],
      });

      const txHash = await sendTransactionAny(senders, {
        to: contractAddress,
        value: tipWei,
        data,
      });

      // Wait for the tx to be validated on-chain before flipping the button
      // to "GM Done". Without this, MetaMask returning the txHash after
      // signature (NOT after confirmation) made the button flicker:
      //   spinner -> "GM Done" (optimistic) -> "Say GM" (checkStatus read
      //   a stale API response while recordGmBackend was still retrying).
      // 60s matches deployContract and covers slow chains (B3, etc.).
      const ethereum = (window as unknown as Record<string, unknown>).ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;
      await waitForGmReceipt(txHash, ethereum, 60_000);

      // Record on-chain GM in backend. Receipt is now validated, so the
      // DB write will succeed on the first try in nearly all cases; the
      // retry loop is defense in depth for B3 and other slow chains.
      const recordGmBackend = async () => {
        let lastError = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await apiFetch(`${API_URL}/api/gm/onchain`, {
              method: "POST",
              body: JSON.stringify({ txHash, chainKey, contractAddress }),
              signal: AbortSignal.timeout(15000 + attempt * 15000),
            });
            if (res.ok) return; // success, GM recorded in DB
            const errData = await res.json().catch(() => ({})) as { error?: string };
            if (errData.error === "duplicate_gm") return; // already recorded
            lastError = errData.error || `server_error_${res.status}`;
          } catch (err) {
            lastError = (err as Error).message || "unreachable";
          }
          if (attempt < 2) await new Promise(r => setTimeout(r, 10000 * (attempt + 1)));
        }
        console.warn("Backend GM record failed after retries:", lastError);
      };
      void recordGmBackend(); // fire-and-forget: don't block the UI

      const today = new Date().toISOString().slice(0, 10);
      lsSetGmDone(chainKey);
      window.dispatchEvent(new CustomEvent("wcore-gm-done", { detail: { date: today, chain: chainKey } }));

      return txHash;
    } finally {
      setSending(false);
    }
  }, [config.walletAddress, config.streak, getRandomContract, fetchNativePrice, buildSenders]);

  const deployContract = useCallback(async (): Promise<{ address: string; txHash: string }> => {
    if (!config.chainKey) throw new Error("chainKey required for deploy");
    if (!config.walletAddress) throw new Error("Wallet not connected");
    setDeploying(true);
    try {
      const factoryAddr = getFactoryAddress(config.chainKey)??"";
      if (!factoryAddr) throw new Error(`No factory for ${config.chainKey}`);

      const senders = buildSenders();
      const expectedChainId = getGmChainId(config.chainKey);
      await switchChainAny(senders, expectedChainId);
      const switchDeadline = Date.now() + 3000;
      let providerConfirmed = false;
      while (Date.now() < switchDeadline) {
        if (chainIdRef.current === expectedChainId) { providerConfirmed = true; break; }
        const actualHex = await window.ethereum?.request({ method: "eth_chainId" }).catch(() => null) as string | null;
        if (actualHex && Number(actualHex) === expectedChainId) { providerConfirmed = true; break; }
        await new Promise((r) => setTimeout(r, 250));
      }
      // Accept the provider-confirmed switch even if wagmi React state still lags.
      if (!providerConfirmed && chainIdRef.current !== expectedChainId) {
        throw new Error(`Wallet did not switch to ${config.chainKey.replace(/_/g, " ")}. Switch manually and retry.`);
      }

      const ethPrice = await fetchNativePrice(config.chainKey);
      const feeUsd = 0.10;
      const feeWei = BigInt(Math.ceil(feeUsd / ethPrice * 1e18 * 1.02));

      const deployData = encodeFunctionData({
        abi: gmFactoryAbi,
        functionName: "deployGMContract",
      });

      const txHash = await sendTransactionAny(senders, {
        to: factoryAddr,
        value: feeWei,
        data: deployData,
      });

      let contractAddress = "";
      const ethereum = (window as unknown as Record<string, unknown>).ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;
      if (!ethereum) throw new Error("No ethereum provider for receipt polling");
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const receipt = await ethereum.request({
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }) as { status?: string; logs?: Array<{ address: string; topics: string[] }> } | null;
          if (!receipt || receipt.status !== "0x1") continue;

          // Read deployed contract address from ContractDeployed event (topics[1])
          // Safer than contractCount() which has race conditions
          const DEPLOYED_EVENT = "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688";
          const factoryAddrLower = factoryAddr.toLowerCase();
          const deployedLog = receipt.logs?.find((log) =>
            log.address.toLowerCase() === factoryAddrLower
            && log.topics[0]?.toLowerCase() === DEPLOYED_EVENT
          );
          if (deployedLog?.topics[1]) {
            contractAddress = "0x" + deployedLog.topics[1].slice(26);
            break;
          }
        } catch { /* retry */ }
      }
      if (!contractAddress) throw new Error("Could not find deployed contract address");

      // Register the deployed contract in the backend DB. The tx is already
      // confirmed on-chain, so a registration failure must NEVER lose the
      // contract: retry in the background with backoff (uniform for every
      // chain — public RPC receipt indexing can lag the wallet RPC).
      const registerDeploy = () => apiFetch(`${API_URL}/api/gm/contracts/deploy`, {
        method: "POST",
        body: JSON.stringify({ chainKey: config.chainKey, contractAddress, txHash }),
      });
      const verifyRes = await registerDeploy().catch(() => null);
      if (!verifyRes?.ok) {
        const data = await verifyRes?.json().catch(() => null) as { error?: string } | null;
        console.error("Contract deploy API failed, retrying in background:", data?.error || "network");
        void (async () => {
          for (const delayMs of [5000, 15000, 30000]) {
            await new Promise((r) => setTimeout(r, delayMs));
            try {
              const res = await registerDeploy();
              // 409 contract_already_registered = recovered by server-side sync.
              if (res.ok || res.status === 409) return;
            } catch (e) { console.error("Contract deploy registration retry failed:", e); }
          }
          console.error("Contract deploy registration exhausted retries; server-side sync will recover it on the next /gm load.");
        })();
      }

      // Cache locally so subsequent checks are instant
      if (config.chainKey) lsSetContractDeployed(config.chainKey, contractAddress);

      return { address: contractAddress, txHash };
    } finally {
      setDeploying(false);
    }
  }, [config.chainKey, config.walletAddress, fetchNativePrice, buildSenders]);

  return { sendGm, deployContract, checkHasDeployed, sending, deploying };
}

/**
 * Poll the wallet's RPC for `eth_getTransactionReceipt` until the tx is
 * mined. Resolves on `status === "0x1"`, throws on `status === "0x0"`
 * (reverted) or after `timeoutMs`. Mirrors the polling loop in
 * `deployContract` so the two flows have the same UX.
 */
async function waitForGmReceipt(
  txHash: string,
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!ethereum) throw new Error("No ethereum provider for receipt polling");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = (await ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      })) as { status?: string } | null;
      if (receipt) {
        if (receipt.status === "0x1") return; // success
        if (receipt.status === "0x0") {
          throw new Error("Transaction reverted on-chain. Check your wallet for details.");
        }
      }
    } catch (e) {
      if ((e as Error).message?.includes("reverted")) throw e;
      // Network / RPC blip — keep polling until deadline.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction validation timeout (${Math.round(timeoutMs / 1000)}s). The tx may still be mined — check your wallet.`);
}
