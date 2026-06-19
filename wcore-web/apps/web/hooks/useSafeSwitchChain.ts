"use client";

import { useCallback } from "react";
import { useSwitchChain } from "wagmi";

/**
 * Wagmi infers `chainId` as a literal union from the configured chain list, but
 * the GM flows resolve chain IDs dynamically at runtime (getGmChainId,
 * getRandomContract, GM contracts). Those IDs are valid on-chain but don't match
 * the narrow TypeScript union, which previously forced an `as any` on every
 * `switchChainAsync` call site.
 *
 * This hook centralizes the single, contained cast and returns a stable
 * `switchChain(chainId: number)` helper, so consumers never repeat the cast.
 */
export function useSafeSwitchChain(): (chainId: number) => Promise<unknown> {
  const { switchChainAsync } = useSwitchChain();
  return useCallback(
    (chainId: number) => switchChainAsync({ chainId } as Parameters<typeof switchChainAsync>[0]),
    [switchChainAsync],
  );
}
