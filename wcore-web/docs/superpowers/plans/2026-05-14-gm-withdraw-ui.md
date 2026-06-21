# GM Withdraw UI Implementation Plan

> **Historical/completed plan.** Kept for implementation history only; verify current GM behavior in code, `AGENTS.md`, and `docs/AUDIT.md` before acting on any task here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve GM Contracts UI and expose withdraw actions in `/gm` and wallet `ChainCard` only when a creator balance is withdrawable.

**Architecture:** GM contract balance loading is centralized in `/api/gm/my-contracts`, which returns `creatorBalance` and `platformBalance` for each contract using multi-RPC fallback. The frontend consumes one shared `useGmContracts` hook with an in-memory cache reused by Header, `/gm`, `/profile?tab=gm-contracts`, and wallet `ChainCard` so withdrawal counts and buttons stay consistent across navigation and refreshes.

**Tech Stack:** Next.js React client components, wagmi `useSwitchChain` / `useSendTransaction`, viem `encodeFunctionData`, enriched `/api/gm/my-contracts`, legacy `/api/gm/contracts/:id/balance` for targeted refresh/debug, Tailwind CSS.

---

## 2026-05-15 Implementation Notes

- `/api/gm/my-contracts` is now the source of truth for contract lists and balances. Do not reintroduce per-contract balance fan-out in the frontend.
- `useGmContracts` stores a module-level cache keyed by `address:token` and publishes updates to all consumers. Header, `/gm`, `/profile`, and wallet cards should use this hook instead of local fetch logic.
- `contractsByChain` is `Map<string, GmContractWithBalance[]>`, not a single contract. A chain can have multiple withdrawable contracts; `/gm` and `ChainCard` must render all relevant `GmWithdrawButton`s.
- `GmWithdrawNotification` may preserve the last non-zero count during transient re-fetches, because the real source of truth remains the hook/API. It must not invent a count from unrelated localStorage.
- GM action buttons on `/gm` use the shared visual class `GM_ACTION_CLASS` (`h-9 flex items-center justify-center`) so `Coming Soon`, `Deploy`, `Say GM`, and `GM Done` stay visually identical.
- Zora is active for GM: factory `0xd0f92622a510f82eef0178e596a4d6f17418c3c2`, chainId `7777777`, RPCs `https://rpc.zora.energy`, `https://zora.drpc.org`, `https://1rpc.io/zora`.

---

### Task 1: Shared GM Contract Utilities

**Files:**
- Create: `apps/web/hooks/useGmContracts.ts`

- [ ] **Step 1: Add shared contract loading and withdraw helpers**

Create `apps/web/hooks/useGmContracts.ts` with:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData } from "viem";
import { useSendTransaction, useSwitchChain } from "wagmi";
import { GM_FACTORIES } from "@wcore/shared";
import { gmOnChainAbi } from "@/lib/gm-abi";

const API_URL = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000") : "http://127.0.0.1:4000";
const MIN_WITHDRAW_WEI = 1_000_000_000_000n;

export interface GmContractWithBalance {
  id: string;
  chainKey: string;
  contractAddress: string;
  creatorBalance: string;
  platformBalance: string;
  role?: string;
}

export function getNativeSymbol(chainKey: string): string {
  const nativeSymbols: Record<string, string> = {
    ethereum: "ETH", base: "ETH", arbitrum_one: "ETH", optimism: "ETH", polygon: "POL",
    bsc: "BNB", avalanche: "AVAX", gnosis: "xDAI", soneium: "ETH", zksync_era: "ETH",
    scroll: "ETH", linea: "ETH", mantle: "MNT", blast: "ETH", celo: "CELO", fraxtal: "FRAX",
    worldchain: "ETH", unichain: "ETH", berachain: "BERA", ink: "ETH", abstract: "ETH", sonic: "S",
  };
  return nativeSymbols[chainKey.toLowerCase()] || "ETH";
}

export function weiToNative(value: string): number {
  try {
    const wei = BigInt(value || "0");
    return wei > 0n ? Number(wei) / 1e18 : 0;
  } catch {
    return 0;
  }
}

export function hasWithdrawableCreatorBalance(value: string): boolean {
  try {
    return BigInt(value || "0") >= MIN_WITHDRAW_WEI;
  } catch {
    return false;
  }
}

export function useGmContracts(address: string | undefined, token: string | null) {
  const [contracts, setContracts] = useState<GmContractWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const refreshContracts = useCallback(async () => {
    if (!address || !token) {
      setContracts([]);
      return [];
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/gm/my-contracts`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setContracts([]);
        return [];
      }
      const data = (await res.json()) as { contracts?: Array<Omit<GmContractWithBalance, "creatorBalance" | "platformBalance">> };
      const withBalances = await Promise.all((data.contracts ?? []).map(async (contract) => {
        const balRes = await fetch(`${API_URL}/api/gm/contracts/${contract.id}/balance`, { headers: { authorization: `Bearer ${token}` } });
        const balData = (await balRes.json().catch(() => ({ creatorBalance: "0", platformBalance: "0" }))) as { creatorBalance?: string; platformBalance?: string };
        return { ...contract, creatorBalance: balData.creatorBalance || "0", platformBalance: balData.platformBalance || "0" };
      }));
      setContracts(withBalances);
      return withBalances;
    } finally {
      setLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    void refreshContracts();
  }, [refreshContracts]);

  const contractsByChain = useMemo(() => {
    const map = new Map<string, GmContractWithBalance>();
    for (const contract of contracts) map.set(contract.chainKey.toLowerCase(), contract);
    return map;
  }, [contracts]);

  const withdrawCreator = useCallback(async (contract: GmContractWithBalance) => {
    const chainId = GM_FACTORIES[contract.chainKey.toLowerCase()]?.chainId;
    setWithdrawingId(contract.id);
    try {
      if (chainId) await switchChainAsync({ chainId });
      const data = encodeFunctionData({ abi: gmOnChainAbi, functionName: "withdrawCreator" });
      await sendTransactionAsync({ to: contract.contractAddress as `0x${string}`, data });
      await refreshContracts();
    } finally {
      setWithdrawingId(null);
    }
  }, [refreshContracts, sendTransactionAsync, switchChainAsync]);

  const withdrawPlatform = useCallback(async (contract: GmContractWithBalance) => {
    const chainId = GM_FACTORIES[contract.chainKey.toLowerCase()]?.chainId;
    setWithdrawingId(contract.id);
    try {
      if (chainId) await switchChainAsync({ chainId });
      const data = encodeFunctionData({ abi: gmOnChainAbi, functionName: "withdrawPlatform" });
      await sendTransactionAsync({ to: contract.contractAddress as `0x${string}`, data });
      await refreshContracts();
    } finally {
      setWithdrawingId(null);
    }
  }, [refreshContracts, sendTransactionAsync, switchChainAsync]);

  return { contracts, contractsByChain, loading, withdrawingId, refreshContracts, withdrawCreator, withdrawPlatform };
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `rtk pnpm --filter web typecheck`

Expected: Either pass or only unrelated pre-existing errors.

### Task 2: Shared Withdraw Button

**Files:**
- Create: `apps/web/components/GmWithdrawButton.tsx`

- [ ] **Step 1: Add null-rendering withdraw button**

Create `apps/web/components/GmWithdrawButton.tsx` with:

```tsx
"use client";

import { Logo } from "./Logo";
import { type GmContractWithBalance, getNativeSymbol, hasWithdrawableCreatorBalance, weiToNative } from "@/hooks/useGmContracts";

interface GmWithdrawButtonProps {
  contract: GmContractWithBalance | undefined;
  withdrawingId: string | null;
  onWithdraw: (contract: GmContractWithBalance) => Promise<void>;
  className?: string;
  compact?: boolean;
}

export function GmWithdrawButton({ contract, withdrawingId, onWithdraw, className = "", compact = false }: GmWithdrawButtonProps) {
  if (!contract || !hasWithdrawableCreatorBalance(contract.creatorBalance)) return null;

  const symbol = getNativeSymbol(contract.chainKey);
  const amount = weiToNative(contract.creatorBalance);
  const withdrawing = withdrawingId === contract.id;

  return (
    <button
      type="button"
      onClick={() => void onWithdraw(contract)}
      disabled={withdrawing}
      className={`${compact ? "rounded border border-accent/30 px-2 py-0.5 text-[10px]" : "rounded-lg border border-accent/30 px-3 py-2 text-xs"} font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition ${className}`}
      title={`Withdraw ${amount.toFixed(6)} ${symbol}`}
    >
      {withdrawing ? <Logo className="h-3 w-3 text-accent animate-spin inline-block" /> : `Withdraw ${amount.toFixed(6)} ${symbol}`}
    </button>
  );
}
```

### Task 3: Profile GM Contracts Redesign

**Files:**
- Modify: `apps/web/app/profile/ProfileClient.tsx`
- Modify: `apps/web/app/profile/components/GmContractsPanel.tsx`

- [ ] **Step 1: Replace local withdraw state with shared hook**

In `ProfileClient.tsx`, import `useGmContracts` and remove local fetch/withdraw duplication. Pass `contracts`, `withdrawCreator`, `withdrawPlatform`, and `withdrawingId` to the panel.

- [ ] **Step 2: Redesign panel as full-width summary + grid**

In `GmContractsPanel.tsx`, sort withdrawable contracts first, show summary cards, use grid cards per contract, and reuse `GmWithdrawButton` for creator withdraw. Keep platform withdraw visible only for platform owner and only when platform balance is withdrawable.

### Task 4: GM Page Withdraw Surface

**Files:**
- Modify: `apps/web/app/gm/GmPageClient.tsx`

- [ ] **Step 1: Load user GM contracts once**

Use `useGmContracts(address, token)` in `GmPageClient` and pass each chain's matching contract to `GmChainCard`.

- [ ] **Step 2: Show withdraw only when balance exists**

Render `<GmWithdrawButton compact />` inside deployed chain cards only when it returns non-null. Do not show zero balances or placeholder text.

### Task 5: Wallet ChainCard Withdraw Surface

**Files:**
- Modify: `apps/web/components/ChainCard.tsx`

- [ ] **Step 1: Load contracts for connected wallet**

Use `useGmContracts(connectedAddress, tokenFromLocalStorage)` or a small local token state.

- [ ] **Step 2: Show withdraw only when all gates pass**

Render a compact withdraw button only when wallet scanned equals connected wallet, chain supports GM, user has a contract on that chain, and creator balance is withdrawable. No UI should appear when balance is zero.

### Task 6: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run static checks**

Run: `rtk pnpm --filter web typecheck`

Expected: pass or report unrelated pre-existing errors.

- [ ] **Step 2: Run lint if available**

Run: `rtk pnpm --filter web lint`

Expected: pass or report unrelated pre-existing errors.

- [ ] **Step 3: Manual browser verification**

Open `/profile`, `/gm`, and wallet scan results. Confirm:
- Profile GM Contracts uses wide cards and prioritizes withdrawable balances.
- `/gm` shows withdraw only for chains with creator balance > threshold.
- `ChainCard` shows withdraw only on current connected wallet and only when creator balance > threshold.
- Zero-balance chains show no withdraw UI.

---

## Self-Review

Spec coverage: covers profile redesign, `/gm` conditional withdraw, and wallet `ChainCard` conditional withdraw. The explicit user rule "only if there is something to withdraw" is enforced by `GmWithdrawButton` returning `null` unless `creatorBalance` passes threshold.

Placeholder scan: no implementation placeholders remain in shared utilities or button. Profile, GM and ChainCard tasks specify exact behavior and files.

Type consistency: all tasks use `GmContractWithBalance`, `withdrawCreator`, `withdrawPlatform`, `contractsByChain`, and `withdrawingId` consistently.
