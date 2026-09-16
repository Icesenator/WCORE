// WC-11 — wires runtime config into the provider-agnostic enrichment framework.
//
// Keep this layer deliberately thin and fail-closed: it only turns `ZerionEnrichmentConfig`
// into a live provider + per-provider policy, and it MUST never revive a provider that is
// disabled by design. No secret is logged; the API key only ever reaches the provider.

import type { ZerionEnrichmentConfig } from "../../config.js";
import {
  createEnrichmentBreaker,
  createPortfolioEnrichmentService,
  createSlidingWindowBudget,
  type EnrichmentCache,
  type PortfolioEnrichmentFramework,
  type ProviderPolicy,
} from "./service.js";
import { DISABLED_PROVIDER_IDS, type PortfolioEnrichmentProvider, type ProviderId } from "./types.js";
import { createZerionProvider } from "./zerion.js";

const DAY_MS = 86_400_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_OPEN_MS = 60_000;

const ALL_PURPOSES = ["complex-positions", "wallet-hints", "diagnostics"] as const;

const DISABLED_POLICY: ProviderPolicy = {
  enabled: false,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxPositions: 0,
  allowStale: false,
  staleTtlMs: 0,
  purposes: [],
};

export interface PortfolioEnrichmentFactoryDeps {
  readonly zerion: ZerionEnrichmentConfig;
  readonly cache?: EnrichmentCache | null;
  readonly now?: () => number;
  readonly warn?: (message: string) => void;
  readonly fetchImpl?: typeof fetch;
}

export function createConfiguredPortfolioEnrichment(deps: PortfolioEnrichmentFactoryDeps): PortfolioEnrichmentFramework {
  const now = deps.now ?? (() => Date.now());
  const z = deps.zerion;
  const apiKey = typeof z.apiKey === "string" ? z.apiKey.trim() : "";
  const zerionActive = z.enabled && apiKey.length > 0;

  const providers: PortfolioEnrichmentProvider[] = [];
  if (zerionActive) {
    providers.push(
      createZerionProvider({
        apiKey,
        timeoutMs: z.timeoutMs,
        maxResponseBytes: z.maxResponseBytes,
        maxPositions: z.maxPositions,
        fetchImpl: deps.fetchImpl,
        now,
      }),
    );
  }

  // Invariant: a provider disabled by design can never be registered here.
  for (const id of DISABLED_PROVIDER_IDS) {
    if (providers.some((provider) => provider.id === id)) {
      throw new Error(`enrichment provider "${id}" must stay disabled`);
    }
  }

  const policies: Record<ProviderId, ProviderPolicy> = {
    zerion: zerionActive
      ? {
          enabled: true,
          timeoutMs: z.timeoutMs,
          maxPositions: z.maxPositions,
          allowStale: true,
          staleTtlMs: z.lastGoodTtlMs,
          purposes: ALL_PURPOSES,
        }
      : DISABLED_POLICY,
    helius: DISABLED_POLICY,
    etherscan: DISABLED_POLICY,
    "lifi-earn": DISABLED_POLICY,
  };

  const budget = createSlidingWindowBudget({
    limit: Math.max(1, Math.floor(z.dailyBudget)),
    windowMs: DAY_MS,
    now,
  });
  const breaker = createEnrichmentBreaker({ failureThreshold: BREAKER_FAILURE_THRESHOLD, openMs: BREAKER_OPEN_MS, now });

  return createPortfolioEnrichmentService({
    providers,
    policyFor: (id) => policies[id],
    budget,
    breaker,
    cache: deps.cache ?? null,
    now,
    warn: deps.warn,
  });
}
