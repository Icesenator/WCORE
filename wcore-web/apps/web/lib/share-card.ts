import { bucketChainCount, bucketWalletCount } from "./funnel-analytics";

export function roundTotalForShare(totalEur: number): string {
  const safe = Number.isFinite(totalEur) && totalEur > 0 ? totalEur : 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}k`;
  return String(Math.round(safe));
}

export type PortfolioOutputBlockReason = "scan_in_progress" | "no_result" | "partial_result";

/** Structural subset of ChainScan needed to judge whether a chain produced a result. */
export interface OutputChain {
  chainKey: string;
  errors: ReadonlyArray<unknown>;
  native: unknown;
  tokens: ReadonlyArray<unknown>;
}

/**
 * A chain with no asset at all is failed as soon as one of its errors is not benign. Engines and
 * catch branches emit free-form messages ("fetch failed", "no REST URL for X", "native balance
 * failed on all N RPCs"...), so failures cannot be enumerated: only the benign set is. It mirrors
 * BENIGN_ERROR_PATTERNS (apps/api/src/server-helpers.ts) plus per-token pricing gaps; the server
 * applies the same rule when it marks an async entry "error" (errors > 0 && tokens === 0).
 * The API always builds a zero native asset on failure (buildChainScan), so `native === null`
 * alone is not enough. A chain carrying a `stale_refresh_failed` marker holds an old value from a
 * failed refresh: it is never fresh, so it is failed even when it still shows assets.
 */
const STALE_MARKER = /stale_refresh_failed/i;
const BENIGN_CHAIN_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /^\[BAL_CACHE\]/,
  /decimals_unknown/i,
  /\bprice: NO_PRICE$/i,
  /explorer API No tokens found/i,
];

function isBenignChainError(message: string): boolean {
  return message.length === 0 || BENIGN_CHAIN_ERROR_PATTERNS.some((re) => re.test(message));
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return "";
}

function hasNonZeroAsset(chain: OutputChain): boolean {
  const balanceOf = (asset: unknown) => Number((asset as { balance?: unknown } | null)?.balance ?? 0);
  if (chain.native !== null && chain.native !== undefined && balanceOf(chain.native) !== 0) return true;
  return chain.tokens.length > 0;
}

export function isFailedChain(chain: OutputChain): boolean {
  if (chain.errors.length === 0) return false;
  if (chain.errors.some((error) => STALE_MARKER.test(errorMessage(error)))) return true;
  if (hasNonZeroAsset(chain)) return false;
  if (chain.native === null && chain.tokens.length === 0) return true;
  return chain.errors.some((error) => !isBenignChainError(errorMessage(error)));
}

export interface PortfolioOutputState {
  share: boolean;
  export: boolean;
  partial: boolean;
  usableChains: number;
  failedChains: number;
  reason: PortfolioOutputBlockReason | null;
}

/**
 * The public card summarises a complete scan only. The CSV is allowed for a finished
 * scan with failed chains, but must be labelled partial; it is never allowed while
 * running or when no chain produced a result.
 */
export function portfolioOutputAvailability(input: { scanComplete: boolean; chains: ReadonlyArray<OutputChain> }): PortfolioOutputState {
  const usable = new Set<string>();
  const failed = new Set<string>();
  for (const chain of input.chains ?? []) {
    if (isFailedChain(chain)) failed.add(chain.chainKey.toUpperCase());
    else usable.add(chain.chainKey.toUpperCase());
  }
  const usableChains = usable.size;
  const failedChains = failed.size;
  const base = { usableChains, failedChains };
  if (!input.scanComplete) return { share: false, export: false, partial: false, ...base, reason: "scan_in_progress" };
  if (usableChains === 0) return { share: false, export: false, partial: false, ...base, reason: "no_result" };
  if (failedChains > 0) return { share: false, export: true, partial: true, ...base, reason: "partial_result" };
  return { share: true, export: true, partial: false, ...base, reason: null };
}

export function portfolioCsvFilename(now: Date, partial: boolean): string {
  return `wcore-scan-${now.toISOString().slice(0, 10)}${partial ? "-partial" : ""}.csv`;
}

export function buildShareCardUrl(
  apiUrl: string,
  input: { totalEur: number; walletCount: number; chainCount: number; cexCount?: number },
): string | null {
  // bucketChainCount(0) would be labelled "1-5 chains": no card without at least one chain.
  if (!Number.isFinite(input.chainCount) || input.chainCount <= 0) return null;
  const params = new URLSearchParams({
    total: roundTotalForShare(input.totalEur),
    cur: "eur",
    wallets: bucketWalletCount(input.walletCount),
    chains: bucketChainCount(input.chainCount),
    cex: String(Math.min(20, Math.max(0, Math.round(input.cexCount ?? 0)))),
  });
  return `${apiUrl.replace(/\/$/, "")}/api/share/clean-total-card.png?${params}`;
}
