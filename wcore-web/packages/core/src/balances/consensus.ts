export type BalanceSource = "rpc" | "multicall" | "cache" | "explorer" | "indexer" | "none";

export interface BalanceVote {
  source: Exclude<BalanceSource, "none">;
  raw: bigint;
  confidence: number;
  observedAt?: number;
  consensus?: boolean;
  endpoint?: string;
  error?: string;
}

export interface BalanceDecision {
  raw: bigint;
  source: BalanceSource;
  confidence: number;
  degraded: boolean;
  reason: string;
  votes: BalanceVote[];
}

export interface BalanceConsensusPolicy {
  nowMs: number;
  freshCacheMs: number;
  staleCacheMs: number;
  maxCacheMs: number;
  minLiveConfidence: number;
  minFallbackConfidence: number;
}

const DEFAULT_POLICY: BalanceConsensusPolicy = {
  nowMs: Date.now(),
  freshCacheMs: 60 * 60 * 1000,
  staleCacheMs: 24 * 60 * 60 * 1000,
  maxCacheMs: 7 * 24 * 60 * 60 * 1000,
  minLiveConfidence: 0.65,
  minFallbackConfidence: 0.25,
};

const LIVE_SOURCES = new Set<BalanceSource>(["rpc", "multicall"]);
const FALLBACK_SOURCES = new Set<BalanceSource>(["cache", "explorer", "indexer"]);

export function resolveBalance(
  votes: BalanceVote[],
  policyOverrides: Partial<BalanceConsensusPolicy> = {},
): BalanceDecision {
  const policy = { ...DEFAULT_POLICY, nowMs: Date.now(), ...policyOverrides };
  const usable = votes.filter((v) => v.confidence > 0 && !v.error);

  if (usable.length === 0) {
    return { raw: 0n, source: "none", confidence: 0, degraded: true, reason: "no_votes", votes };
  }

  const liveConsensus = usable
    .filter((v) => LIVE_SOURCES.has(v.source) && v.consensus === true)
    .sort(sortByConfidenceThenObservedAt(policy.nowMs, policy.maxCacheMs))[0];
  if (liveConsensus) {
    return {
      raw: liveConsensus.raw,
      source: liveConsensus.source,
      confidence: liveConsensus.confidence,
      degraded: false,
      reason: "live_consensus",
      votes,
    };
  }

  const strongLive = usable
    .filter((v) => LIVE_SOURCES.has(v.source) && v.confidence >= policy.minLiveConfidence)
    .sort(sortByConfidenceThenObservedAt(policy.nowMs, policy.maxCacheMs))[0];

  const fallback = usable
    .filter((v) => FALLBACK_SOURCES.has(v.source) && v.raw > 0n)
    .map((v) => withAgeAdjustedConfidence(v, policy))
    .filter((v) => v.adjustedConfidence >= policy.minFallbackConfidence)
    .sort((a, b) => {
      if (a.adjustedConfidence !== b.adjustedConfidence) return b.adjustedConfidence - a.adjustedConfidence;
      return (b.observedAt ?? 0) - (a.observedAt ?? 0);
    })[0];
  const liveFailed = votes.some((v) => LIVE_SOURCES.has(v.source) && (v.error || v.confidence === 0));

  if (strongLive) {
    const staleFallback = fallback && fallback.adjustedConfidence < strongLive.confidence;
    const partialZeroAgainstFreshCache = strongLive.raw === 0n
      && liveFailed
      && fallback
      && fallback.adjustedConfidence >= policy.minLiveConfidence;
    if (!partialZeroAgainstFreshCache && (!fallback || staleFallback || strongLive.raw > 0n)) {
      return {
        raw: strongLive.raw,
        source: strongLive.source,
        confidence: strongLive.confidence,
        degraded: false,
        reason: "best_live_vote",
        votes,
      };
    }
  }

  if (fallback) {
    const conflicts = usable.some((v) => FALLBACK_SOURCES.has(v.source) && v.raw > 0n && v.raw !== fallback.raw);
    const reason = fallback.observedAt == null
      ? "legacy_cache_fallback"
      : conflicts
        ? "balance_conflict"
        : liveFailed
          ? "cache_fallback_live_failed"
          : "fallback_balance";
    return {
      raw: fallback.raw,
      source: fallback.source,
      confidence: fallback.adjustedConfidence,
      degraded: true,
      reason,
      votes,
    };
  }

  if (strongLive) {
    return {
      raw: strongLive.raw,
      source: strongLive.source,
      confidence: strongLive.confidence,
      degraded: false,
      reason: "best_live_vote",
      votes,
    };
  }

  return { raw: 0n, source: "none", confidence: 0, degraded: true, reason: "no_reliable_vote", votes };
}

function sortByConfidenceThenObservedAt(nowMs: number, maxCacheMs: number): (a: BalanceVote, b: BalanceVote) => number {
  return (a, b) => {
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return observedAtOrOld(b, nowMs, maxCacheMs) - observedAtOrOld(a, nowMs, maxCacheMs);
  };
}

function observedAtOrOld(vote: BalanceVote, nowMs: number, maxCacheMs: number): number {
  return vote.observedAt ?? (nowMs - maxCacheMs);
}

function withAgeAdjustedConfidence(
  vote: BalanceVote,
  policy: BalanceConsensusPolicy,
): BalanceVote & { adjustedConfidence: number } {
  if (vote.observedAt == null) return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.3) };
  const age = Math.max(0, policy.nowMs - vote.observedAt);
  if (age > policy.maxCacheMs) return { ...vote, adjustedConfidence: 0 };
  if (age <= policy.freshCacheMs) return { ...vote, adjustedConfidence: vote.confidence };
  if (age <= policy.staleCacheMs) return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.55) };
  return { ...vote, adjustedConfidence: Math.min(vote.confidence, 0.25) };
}
