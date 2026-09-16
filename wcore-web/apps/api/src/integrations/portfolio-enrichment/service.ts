// WC-11 — provider-agnostic portfolio-enrichment framework (fail-closed server core).
//
// This is the common, secretless control layer every enrichment provider sits behind.
// Its whole reason to exist is a set of SAFETY INVARIANTS, not data fetching:
//
//   * WCORE/RPC is authoritative. Enrichment NEVER mutates `assetsByChain`; it only
//     reports provider snapshots and diagnostics. A provider can never inflate an
//     on-chain total without a separate, RPC-verified merge step this layer does not do.
//   * A provider fault is never a chain fault: it never throws out of `run`/`enrich`,
//     never opens the chain circuit breaker, and never marks the scan `degraded`.
//   * Budget, cache namespace and circuit breaker are per-provider and independent.
//   * Timeout is hard-bounded even if a provider misbehaves.
//   * Missing data stays UNKNOWN (EMPTY / errors surface as explicit statuses), never 0.
//
// No trading, no signing, no wallet connection, no invented provider.

import type {
  EnrichmentPurpose,
  PortfolioEnrichmentInput,
  PortfolioEnrichmentProvider,
  PortfolioEnrichmentResult,
  PortfolioEnrichmentService,
  ProviderId,
  ProviderPortfolioSnapshot,
  ProviderRequestContext,
} from "./types.js";

export type EnrichmentStatus =
  | "SUCCESS"
  | "EMPTY"
  | "STALE"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "DISABLED";

export interface EnrichmentOutcome {
  readonly provider: ProviderId;
  readonly status: EnrichmentStatus;
  readonly snapshot: ProviderPortfolioSnapshot | null;
  readonly stale: boolean;
  readonly errorKind?: string;
}

export interface ProviderPolicy {
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly maxPositions: number;
  /** When a provider is down, whether a recent healthy snapshot may be served as stale. */
  readonly allowStale: boolean;
  readonly staleTtlMs: number;
  readonly purposes: readonly EnrichmentPurpose[];
}

export interface EnrichmentCacheEntry {
  readonly snapshot: ProviderPortfolioSnapshot;
  readonly storedAt: number;
}
export interface EnrichmentCache {
  get(key: string): Promise<EnrichmentCacheEntry | null>;
  set(key: string, entry: EnrichmentCacheEntry): Promise<void>;
}

/** Independent, per-provider sliding-window budget. Exhaustion only stops this enrichment. */
export interface EnrichmentBudget {
  tryConsume(provider: ProviderId): boolean;
}

/** Per-provider circuit breaker, fully separate from the chain breaker. */
export interface EnrichmentBreaker {
  allow(provider: ProviderId): boolean;
  recordSuccess(provider: ProviderId): void;
  recordFailure(provider: ProviderId): void;
}

export function createSlidingWindowBudget(opts: {
  limit: number;
  windowMs: number;
  now: () => number;
}): EnrichmentBudget {
  const hits = new Map<ProviderId, number[]>();
  return {
    tryConsume(provider) {
      const now = opts.now();
      const windowStart = now - opts.windowMs;
      const recent = (hits.get(provider) ?? []).filter((t) => t > windowStart);
      if (recent.length >= opts.limit) {
        hits.set(provider, recent);
        return false;
      }
      recent.push(now);
      hits.set(provider, recent);
      return true;
    },
  };
}

export function createEnrichmentBreaker(opts: {
  failureThreshold: number;
  openMs: number;
  now: () => number;
}): EnrichmentBreaker {
  const state = new Map<ProviderId, { failures: number; openUntil: number }>();
  return {
    allow(provider) {
      const s = state.get(provider);
      if (!s) return true;
      if (s.openUntil > opts.now()) return false; // circuit still open
      return true; // closed, or open window elapsed (half-open probe allowed)
    },
    recordSuccess(provider) {
      state.set(provider, { failures: 0, openUntil: 0 });
    },
    recordFailure(provider) {
      const s = state.get(provider) ?? { failures: 0, openUntil: 0 };
      const failures = s.failures + 1;
      const openUntil = failures >= opts.failureThreshold ? opts.now() + opts.openMs : 0;
      state.set(provider, { failures, openUntil });
    },
  };
}

function classifyError(err: unknown): { status: "TIMEOUT" | "PROVIDER_ERROR"; kind: string } {
  const kind =
    err && typeof err === "object" && "kind" in err
      ? String((err as { kind: unknown }).kind)
      : "unknown";
  if (kind === "timeout") return { status: "TIMEOUT", kind };
  return { status: "PROVIDER_ERROR", kind };
}

function boundedTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error("enrichment timeout"), { kind: "timeout" }));
    }, ms);
    if (typeof (timer as unknown as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function snapshotIsEmpty(s: ProviderPortfolioSnapshot): boolean {
  return s.positions.length === 0 && s.walletHints.length === 0;
}

export interface PortfolioEnrichmentServiceDeps {
  readonly providers: readonly PortfolioEnrichmentProvider[];
  readonly policyFor: (id: ProviderId) => ProviderPolicy;
  readonly budget: EnrichmentBudget;
  readonly breaker: EnrichmentBreaker;
  readonly cache?: EnrichmentCache | null;
  readonly now?: () => number;
  readonly warn?: (message: string) => void;
}

export interface PortfolioEnrichmentFramework extends PortfolioEnrichmentService {
  /** Run every eligible provider for a wallet and return per-provider outcomes (never throws). */
  run(input: PortfolioEnrichmentInput): Promise<readonly EnrichmentOutcome[]>;
}

function requestKey(input: PortfolioEnrichmentInput): string {
  return `${input.address.toLowerCase()}|${[...input.requestedChains].sort().join(",")}`;
}

export function createPortfolioEnrichmentService(deps: PortfolioEnrichmentServiceDeps): PortfolioEnrichmentFramework {
  const now = deps.now ?? (() => Date.now());
  const cache = deps.cache ?? null;
  // Single-flight per provider+wallet so one scan cycle cannot fan out N identical loads.
  const inflight = new Map<string, Promise<EnrichmentOutcome>>();

  async function runOne(provider: PortfolioEnrichmentProvider, input: PortfolioEnrichmentInput): Promise<EnrichmentOutcome> {
    const policy = deps.policyFor(provider.id);
    if (!policy.enabled) return { provider: provider.id, status: "DISABLED", snapshot: null, stale: false, errorKind: "disabled" };
    if (!provider.supports(input.address)) return { provider: provider.id, status: "DISABLED", snapshot: null, stale: false, errorKind: "not_supported" };
    if (!deps.breaker.allow(provider.id)) return { provider: provider.id, status: "DISABLED", snapshot: null, stale: false, errorKind: "circuit_open" };
    if (!deps.budget.tryConsume(provider.id)) return { provider: provider.id, status: "DISABLED", snapshot: null, stale: false, errorKind: "budget_exhausted" };

    const key = `${provider.id}:${requestKey(input)}`;
    const existing = inflight.get(key);
    if (existing) return existing;

    const task = (async (): Promise<EnrichmentOutcome> => {
      const context: ProviderRequestContext = {
        address: input.address,
        requestedChains: input.requestedChains,
        purposes: policy.purposes,
        maxPositions: policy.maxPositions,
      };
      const cacheKey = `portfolio-enrich:${provider.id}:${input.address.toLowerCase()}`;
      try {
        const snapshot = await boundedTimeout(provider.load(context), policy.timeoutMs);
        deps.breaker.recordSuccess(provider.id);
        if (cache) {
          try { await cache.set(cacheKey, { snapshot, storedAt: now() }); } catch (e) { deps.warn?.(`enrichment cache set failed: ${(e as Error).message}`); }
        }
        return { provider: provider.id, status: snapshotIsEmpty(snapshot) ? "EMPTY" : "SUCCESS", snapshot, stale: false };
      } catch (err) {
        deps.breaker.recordFailure(provider.id);
        const { status, kind } = classifyError(err);
        if (cache && policy.allowStale) {
          try {
            const hit = await cache.get(cacheKey);
            if (hit && now() - hit.storedAt <= policy.staleTtlMs) {
              return { provider: provider.id, status: "STALE", snapshot: hit.snapshot, stale: true, errorKind: kind };
            }
          } catch (e) { deps.warn?.(`enrichment cache get failed: ${(e as Error).message}`); }
        }
        return { provider: provider.id, status, snapshot: null, stale: false, errorKind: kind };
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, task);
    return task;
  }

  async function run(input: PortfolioEnrichmentInput): Promise<readonly EnrichmentOutcome[]> {
    const settled = await Promise.allSettled(deps.providers.map((p) => runOne(p, input)));
    // Guarantee: enrichment never rejects and never throws into the scan pipeline.
    return settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { provider: deps.providers[i]!.id, status: "PROVIDER_ERROR" as const, snapshot: null, stale: false, errorKind: "unexpected" },
    );
  }

  async function enrich(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult> {
    const outcomes = await run(input);
    const diagnostics: Record<string, number | string | boolean> = {};
    for (const o of outcomes) diagnostics[`enrich_${o.provider}`] = o.stale ? "STALE" : o.status;
    // WCORE authority: same entries, fresh Map handle — enrichment never mutates assets.
    return { assetsByChain: new Map(input.assetsByChain), diagnostics };
  }

  return { run, enrich };
}
