import type { ChainConfig } from "../types.js";
import type { BalanceDecision, BalanceSource, BalanceVote } from "../balances/index.js";
import type { WalletAssetsCommon, ScanPhases, CacheStats } from "./types.js";

export interface WalletAssetPrice {
  symbol: string;
  balance: number;
  priceEur: number | null;
  valueEur: number | null;
  logoUrl?: string;
}

export interface EvmWalletToken extends WalletAssetPrice {
  [key: string]: unknown;
  contract: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

export type EvmScanPhases = ScanPhases;

export interface EvmWalletAssets extends WalletAssetsCommon<EvmWalletToken> {
  cacheStats?: CacheStats;
}

export const DEFAULT_LOG_SCAN_BLOCKS = 5_000;
export const _DEEP_LOG_SCAN_BLOCKS = 50_000;

export interface BalanceCacheEntry {
  balance: string;
  ts?: number;
  source?: Exclude<BalanceSource, "none">;
  confidence?: number;
}

export function cacheVote(entry: BalanceCacheEntry | undefined): BalanceVote | undefined {
  if (!entry) return undefined;
  try {
    return {
      source: "cache",
      raw: BigInt(entry.balance),
      confidence: entry.confidence ?? 0.8,
      observedAt: entry.ts,
    };
  } catch {
    return undefined;
  }
}

export function liveVote(source: "rpc" | "multicall", raw: bigint, consensus: boolean, confidence: number, endpoint?: string): BalanceVote {
  return { source, raw, consensus, confidence, endpoint, observedAt: Date.now() };
}

export function failedLiveVote(source: "rpc" | "multicall", error: string): BalanceVote {
  return { source, raw: 0n, confidence: 0, error, observedAt: Date.now() };
}

export function cacheEntry(decision: BalanceDecision): BalanceCacheEntry {
  return {
    balance: decision.raw.toString(),
    ts: Date.now(),
    source: decision.source === "none" ? undefined : decision.source,
    confidence: decision.confidence,
  };
}

export function pushBalanceDecisionError(errors: string[], symbol: string, decision: BalanceDecision): void {
  if (!decision.degraded || decision.source === "none") return;
  errors.push(`[DEGRADED] ${symbol} balance: ${decision.reason}, using ${decision.source} fallback`);
}

export const NATIVE_LOGOS: Record<string, string> = {
  ETH: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg",
  SOL: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/sol.svg",
  BNB: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/bnb.svg",
  POL: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/matic.svg",
  AVAX: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/avax.svg",
  ATOM: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/atom.svg",
  CELO: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/celo.svg",
  MATIC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/matic.svg",
};

export function getNativeLogo(chain: ChainConfig): string {
  const symbol = String(chain.CHAIN?.NATIVE_SYMBOL ?? "").toUpperCase();
  if (NATIVE_LOGOS[symbol]) return NATIVE_LOGOS[symbol]!;
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${symbol.toLowerCase()}.svg`;
}

export function normalizeChainKey(chainKey: string): string {
  return String(chainKey || "").trim().toUpperCase();
}

export function normalizeEvmAddress(address: string): string | null {
  const value = String(address || "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) ? value : null;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
