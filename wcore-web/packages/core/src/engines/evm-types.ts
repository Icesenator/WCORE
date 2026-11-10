import type { ChainConfig } from "../types.js";
import type { BalanceDecision, BalanceSource, BalanceVote } from "../balances/index.js";
import type { WalletAssetsCommon, WalletAssetProvenance, ScanPhases, CacheStats } from "./types.js";

export interface WalletAssetPrice {
  symbol: string;
  balance: number;
  priceEur: number | null;
  valueEur: number | null;
  logoUrl?: string;
  priceSource?: string | null;
  /** STALE_IS_NOT_FRESH: set when priceEur comes from the stale-cache fallback. */
  priceStale?: boolean;
  /** Epoch ms at which a stale price was observed. */
  priceTs?: number;
}

export interface EvmWalletToken extends WalletAssetPrice, WalletAssetProvenance {
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

/**
 * Log discovery window for one scan. A block window is a time window only through the block
 * time: 5,000 blocks are hours on most chains but minutes on fast ones, while Ledger scans run
 * hours apart. A chain may declare RPC.MIN_LOG_SCAN_BLOCKS, a floor that widens the requested
 * window (never narrows it). RPC.MAX_LOG_RANGE still caps the range afterwards.
 */
export function effectiveLogScanWindow(chain: { RPC?: { MIN_LOG_SCAN_BLOCKS?: unknown } & Record<string, unknown> }, requested: number | undefined): number {
  const base = requested ?? DEFAULT_LOG_SCAN_BLOCKS;
  const floor = chain.RPC?.MIN_LOG_SCAN_BLOCKS;
  return typeof floor === "number" && Number.isSafeInteger(floor) && floor > 0 ? Math.max(base, floor) : base;
}
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
  if (!decision.degraded) return;
  if (decision.source === "none") {
    errors.push(`[DEGRADED] ${symbol} balance unavailable: ${decision.reason}`);
    return;
  }
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
