/**
 * WC-12 — control plane de consultation des quotes (READ-ONLY).
 *
 * Frontière d'admission d'une requête de quote. Toutes les ressources sont
 * DÉDIÉES à la consultation de quotes et n'ont AUCUN partage implicite avec le
 * scan portfolio :
 *   QUOTE_BUDGET / QUOTE_CACHE / QUOTE_BREAKER / QUOTE_TELEMETRY
 * ne sont jamais des instances de
 *   PORTFOLIO_SCAN_BUDGET / PORTFOLIO_SCAN_CACHE / PORTFOLIO_SCAN_BREAKER.
 *
 * L'entrée publique refuse tout transport : aucun grant LIVE n'est implémenté.
 * Le harness offline séparé accepte uniquement du code de test de confiance ;
 * il ne fournit PAS une isolation réseau/OS. Aucune transaction ni signature.
 */
import type { ProviderQuote, QuoteBlocker } from "./types.js";
import type { ProviderRegistry, QuoteRequest } from "./registry.js";
import { providerEligibility } from "./registry.js";
import { normalizeQuote } from "./normalize.js";
import { canonicalRequest, snapshotRequest } from "./request.js";
import { resolveOfflineTransport } from "./offline-testing.js";
import { createQuotaWindow } from "./quota.js";
import type { QuoteQuotaPolicy } from "./quota.js";

export interface QuoteClock {
  now(): number;
}

export interface QuoteTelemetryEvent {
  ts: number;
  providerId: string;
  outcome: QuoteAdmissionOutcome;
  reason: string | null;
}

export interface QuoteTelemetrySink {
  record(event: QuoteTelemetryEvent): void;
}

export interface QuoteTransport {
  /** Déclaration informative, jamais une autorité réseau. */
  mode?: "SYNTHETIC_OFFLINE" | "NETWORK_CAPABLE";
  fetchQuote(providerId: string, request: QuoteRequest, signal?: AbortSignal): Promise<unknown>;
}

export interface QuoteBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface QuoteControlPlaneConfig {
  registry: ProviderRegistry;
  /** Budget global de consultation. `undefined` => budget indisponible. */
  budget?: { capacity: number };
  quotaPerProvider: number;
  /** Optionnel : quota fenêtré piloté par l'horloge. Absent => quotaPerProvider per-instance. */
  quotaPolicy?: QuoteQuotaPolicy;
  cacheTtlMs: number;
  breaker: QuoteBreakerConfig;
  telemetry: QuoteTelemetrySink;
  /** Refusé par l'entrée publique ; injection réservée au harness offline de confiance. */
  transport?: QuoteTransport | null;
  clock: QuoteClock;
  transportTimeoutMs?: number;
  timer?: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
}

export type QuoteAdmissionOutcome =
  | "SERVED"
  | "CACHE_HIT"
  | "REFUSED_INVALID_REQUEST"
  | "REFUSED_REQUEST_MISMATCH"
  | "REFUSED_TRANSPORT_TIMEOUT"
  | "REFUSED_PROVIDER"
  | "REFUSED_BREAKER_OPEN"
  | "REFUSED_BUDGET_UNAVAILABLE"
  | "REFUSED_BUDGET_EXHAUSTED"
  | "REFUSED_QUOTA_EXCEEDED"
  | "REFUSED_QUOTA_UNATTESTED"
  | "REFUSED_QUOTA_CLOCK_INVALID"
  | "REFUSED_NO_TRANSPORT"
  | "REFUSED_TRANSPORT_UNAUTHORIZED"
  | "REFUSED_MALFORMED_QUOTE"
  | "REFUSED_NON_COMPARABLE"
  | "REFUSED_EXPIRED_QUOTE"
  | "REFUSED_TRANSPORT_ERROR"
  | "REFUSED_TELEMETRY_FAILURE";

export interface QuoteAdmission {
  providerId: string;
  outcome: QuoteAdmissionOutcome;
  served: boolean;
  quote: ProviderQuote | null;
  fromCache: boolean;
  blocker: string | null;
}

interface CacheEntry {
  value: ProviderQuote;
  expiresAt: number;
}

interface BreakerEntry {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  openedAt: number;
}

/** Clé de cache : provider + chaînes + actifs + contrainte de montant. */
export function quoteCacheKey(providerId: string, request: QuoteRequest): string {
  return JSON.stringify([providerId, canonicalRequest(request)]);
}

function isQuoteShape(value: unknown): value is ProviderQuote {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.provider === "string"
    && typeof q.routeId === "string"
    && typeof q.fromChainId === "number"
    && typeof q.toChainId === "number"
    && typeof q.fromToken === "string"
    && typeof q.toToken === "string"
    && typeof q.amountInRaw === "bigint"
    && typeof q.amountOutRaw === "bigint"
    && typeof q.costs === "object" && q.costs !== null
    && typeof q.costUnit === "string"
    && typeof q.slippageBps === "number"
    && typeof q.estimatedDurationSec === "number"
    && typeof q.steps === "number"
    && Array.isArray(q.path)
    && (typeof q.riskScore === "number" || q.riskScore === "UNKNOWN")
    && q.path.every(hop => typeof hop === "string" && hop.trim().length > 0)
    && Number.isFinite(q.estimatedDurationSec) && q.estimatedDurationSec >= 0
    && ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"].every(key => {
      const cost = (q.costs as Record<string, unknown>)[key];
      return cost === undefined || typeof cost === "bigint";
    })
    && ["minAmountOutRaw", "expectedOutRaw"].every(key => q[key] === undefined || (typeof q[key] === "bigint" && q[key] >= 0n))
  );
}

export interface QuoteControlPlane {
  request(providerId: string, request: QuoteRequest): Promise<QuoteAdmission>;
  budgetUsed(): number;
  quotaUsed(providerId: string): number;
  breakerState(providerId: string): "CLOSED" | "OPEN" | "HALF_OPEN";
  cacheEntries(): number;
}

export function createQuoteControlPlane(config: QuoteControlPlaneConfig): QuoteControlPlane {
  return createOfflineBoundControlPlane(config);
}

/** Interne au harness ; non exporté par le barrel public. */
export function createOfflineBoundControlPlane(config: QuoteControlPlaneConfig, context?: object): QuoteControlPlane {
  const { registry, budget, quotaPerProvider, cacheTtlMs, breaker, telemetry, clock } = config;
  const transport = resolveOfflineTransport(context, config.transport);
  const cache = new Map<string, CacheEntry>();
  const breakers = new Map<string, BreakerEntry>();
  const quotas = new Map<string, number>();
  const probes = new Set<string>();
  // Horloge du control plane en SECONDES ; la fenêtre quota est en millisecondes.
  const quotaWindow = config.quotaPolicy
    ? createQuotaWindow(config.quotaPolicy, { now: () => clock.now() * 1000 })
    : null;
  const timeoutMs = config.transportTimeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("INVALID_TRANSPORT_TIMEOUT");
  const timer = config.timer ?? {
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let budgetUsed = 0;

  const record = (providerId: string, outcome: QuoteAdmissionOutcome, reason: string | null): boolean => {
    try {
      telemetry.record({ ts: clock.now(), providerId, outcome, reason });
      return true;
    } catch {
      return false;
    }
  };

  const refuse = (providerId: string, outcome: QuoteAdmissionOutcome, blocker: string | null): QuoteAdmission => {
    record(providerId, outcome, blocker);
    return { providerId, outcome, served: false, quote: null, fromCache: false, blocker };
  };

  const breakerFor = (providerId: string): BreakerEntry => {
    let entry = breakers.get(providerId);
    if (!entry) {
      entry = { state: "CLOSED", failures: 0, openedAt: 0 };
      breakers.set(providerId, entry);
    }
    return entry;
  };

  const breakerAllows = (providerId: string, now: number): boolean => {
    const entry = breakerFor(providerId);
    if (entry.state === "CLOSED") return true;
    if (entry.state === "OPEN" && (now - entry.openedAt) * 1000 >= breaker.cooldownMs) {
      entry.state = "HALF_OPEN";
      return true;
    }
    return entry.state === "HALF_OPEN" && !probes.has(providerId);
  };

  const breakerSuccess = (providerId: string): void => {
    const entry = breakerFor(providerId);
    entry.state = "CLOSED";
    entry.failures = 0;
  };

  const breakerFailure = (providerId: string, now: number): void => {
    const entry = breakerFor(providerId);
    entry.failures += 1;
    if (entry.failures >= breaker.failureThreshold) {
      entry.state = "OPEN";
      entry.openedAt = now;
    }
  };

  const cacheGet = (key: string, now: number): ProviderQuote | null => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (now >= entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  };

  const cacheSet = (key: string, quote: ProviderQuote, now: number): void => {
    const bounded = cacheTtlMs > 0 ? cacheTtlMs : 0;
    let ttl = bounded;
    if (typeof quote.expiresAt === "number") {
      const remaining = (quote.expiresAt - now) * 1000;
      ttl = Math.min(bounded, remaining);
    }
    if (!(ttl > 0)) return;
    cache.set(key, { value: structuredClone(quote), expiresAt: now + ttl / 1000 });
  };

  const request = async (providerId: string, input: QuoteRequest): Promise<QuoteAdmission> => {
    let req: QuoteRequest;
    try { req = snapshotRequest(input); }
    catch { return refuse(providerId, "REFUSED_INVALID_REQUEST", "INVALID_REQUEST"); }
    const now = clock.now();

    const eligibility = providerEligibility(registry, providerId, req);
    if (!eligibility.eligible) return refuse(providerId, "REFUSED_PROVIDER", eligibility.blocker);

    if (config.transport && !transport) return refuse(providerId, "REFUSED_TRANSPORT_UNAUTHORIZED", "TRANSPORT_UNAUTHORIZED");

    if (!breakerAllows(providerId, now)) return refuse(providerId, "REFUSED_BREAKER_OPEN", "BREAKER_OPEN");

    const probe = breakerFor(providerId).state === "HALF_OPEN";
    if (probe) probes.add(providerId);
    try {
      if (!budget || !(budget.capacity > 0)) return refuse(providerId, "REFUSED_BUDGET_UNAVAILABLE", "BUDGET_UNAVAILABLE");

      const key = quoteCacheKey(providerId, req);
      const hit = cacheGet(key, now);
      if (hit) {
        if (!record(providerId, "CACHE_HIT", null)) return refuse(providerId, "REFUSED_TELEMETRY_FAILURE", "TELEMETRY_FAILURE");
        return { providerId, outcome: "CACHE_HIT", served: true, quote: structuredClone(hit), fromCache: true, blocker: null };
      }

      if (budgetUsed >= budget.capacity) return refuse(providerId, "REFUSED_BUDGET_EXHAUSTED", "BUDGET_EXHAUSTED");
      if (quotaWindow) {
        const decision = quotaWindow.admit(providerId);
        if (decision !== "ADMITTED") return refuse(providerId, decision, decision);
      } else if ((quotas.get(providerId) ?? 0) >= quotaPerProvider) {
        return refuse(providerId, "REFUSED_QUOTA_EXCEEDED", "QUOTA_EXCEEDED");
      }
      if (!transport) return refuse(providerId, "REFUSED_NO_TRANSPORT", "NO_TRANSPORT");

      // Réservation SYNCHRONE avant l'appel : deux demandes concurrentes ne
      // peuvent pas dépasser le même quota.
      budgetUsed += 1;
      if (!quotaWindow) quotas.set(providerId, (quotas.get(providerId) ?? 0) + 1);

      let raw: unknown;
      const controller = new AbortController();
      const timeout = new Error("TRANSPORT_TIMEOUT");
      let handle: unknown;
      try {
        const deadline = new Promise<never>((_resolve, reject) => {
          handle = timer.setTimeout(() => { reject(timeout); controller.abort(); }, timeoutMs);
        });
        raw = await Promise.race([transport.fetchQuote(providerId, structuredClone(req), controller.signal), deadline]);
        if ((clock.now() - now) * 1000 >= timeoutMs) { controller.abort(); throw timeout; }
      } catch (error) {
        breakerFailure(providerId, clock.now());
        return refuse(providerId, error === timeout ? "REFUSED_TRANSPORT_TIMEOUT" : "REFUSED_TRANSPORT_ERROR", error === timeout ? "TRANSPORT_TIMEOUT" : error instanceof Error ? error.name : "ERROR");
      } finally {
        timer.clearTimeout(handle);
      }

      if (!isQuoteShape(raw)) {
        breakerFailure(providerId, clock.now());
        return refuse(providerId, "REFUSED_MALFORMED_QUOTE", "MALFORMED_QUOTE");
      }
      // Le transport peut prendre plus longtemps que la validité de la quote.
      // Relire l'horloge après await ; le temps d'admission initial ne suffit pas.
      const receivedAt = clock.now();
      if (raw.provider !== providerId || raw.fromChainId !== req.fromChainId || raw.toChainId !== req.toChainId
        || raw.fromToken !== req.fromAsset || raw.toToken !== req.toAsset || (raw.outputToken ?? raw.toToken) !== req.toAsset
        || raw.amountInRaw !== req.amountInRaw || raw.slippageBps > req.maxSlippageBps
        || raw.amountOutRaw < req.minAmountOutRaw || (raw.minAmountOutRaw ?? 0n) < req.minAmountOutRaw
        || (raw.feePolicy ?? "ADDITIONAL") !== req.feePolicy
        || (req.route.routeId !== undefined && raw.routeId !== req.route.routeId)
        || (req.route.maxSteps !== undefined && raw.steps > req.route.maxSteps)
        || (req.route.path !== undefined && JSON.stringify(raw.path) !== JSON.stringify(req.route.path))) {
        breakerFailure(providerId, receivedAt);
        return refuse(providerId, "REFUSED_REQUEST_MISMATCH", "REQUEST_MISMATCH");
      }
      let normalized;
      try { normalized = normalizeQuote(raw, { now: receivedAt }); }
      catch {
        breakerFailure(providerId, receivedAt);
        return refuse(providerId, "REFUSED_MALFORMED_QUOTE", "MALFORMED_QUOTE");
      }
      if (normalized.netReceivedRaw !== null && normalized.netReceivedRaw < req.minAmountOutRaw) {
        breakerFailure(providerId, receivedAt);
        return refuse(providerId, "REFUSED_REQUEST_MISMATCH", "REQUEST_MISMATCH");
      }
      if (!normalized.comparable) {
        const blocker: QuoteBlocker | null = normalized.blocker;
        breakerFailure(providerId, clock.now());
        return refuse(
          providerId,
          blocker === "QUOTE_EXPIRED" ? "REFUSED_EXPIRED_QUOTE" : "REFUSED_NON_COMPARABLE",
          blocker,
        );
      }

      // Télémétrie AVANT admission durable : un échec de télémétrie interdit un
      // faux succès d'admission.
      if (!record(providerId, "SERVED", null)) {
        breakerFailure(providerId, clock.now());
        return refuse(providerId, "REFUSED_TELEMETRY_FAILURE", "TELEMETRY_FAILURE");
      }

      cacheSet(key, normalized.quote, receivedAt);
      breakerSuccess(providerId);
      return { providerId, outcome: "SERVED", served: true, quote: structuredClone(normalized.quote), fromCache: false, blocker: null };
    } finally {
      if (probe) probes.delete(providerId);
    }
  };

  return {
    request,
    budgetUsed: () => budgetUsed,
    quotaUsed: (providerId) => quotaWindow ? quotaWindow.used(providerId) : (quotas.get(providerId) ?? 0),
    breakerState: (providerId) => breakerFor(providerId).state,
    cacheEntries: () => cache.size,
  };
}
