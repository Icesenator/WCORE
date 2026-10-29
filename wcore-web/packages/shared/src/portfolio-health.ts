/**
 * WCORE — Portfolio Health (projection PURE, read-only).
 *
 * Objectif : rendre visibles les erreurs, les résultats partiels et les
 * inconnues du scanner EXISTANT, sans inventer de dimension ni de score.
 *
 * Contrat :
 * - aucune lecture réseau, aucune mutation, aucun nouveau backend ;
 * - UNKNOWN n'est jamais converti en 0 ;
 * - `knownValueEur` n'est pas un total exhaustif : `exhaustiveValueEur`
 *   reste null tant que la couverture n'est pas prouvée ;
 * - caché/scan/prix/balance sont des dimensions SÉPARÉES. Le schéma de scan
 *   ne fournit pas d'horodatage de prix ni de balance : ces champs restent
 *   null et ne sont jamais déduits de `generatedAt` ou `cachedAt`.
 */
import type { ChainScan, ScanResult, TokenAsset } from "./scan-result";
import { partyOf } from "./local-wallet-groups";

export const HEALTH_STATES = ["NOT_SCANNED", "KNOWN", "PARTIAL", "DEGRADED", "ERROR", "UNKNOWN"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export interface HealthSourceInput {
  readonly id: string;
  readonly address: string;
  readonly label?: string | null;
}

export interface HealthChainError {
  readonly chainKey: string;
  readonly stage: string;
  readonly message: string;
}

export interface SourceHealth {
  readonly id: string;
  readonly address: string;
  readonly state: HealthState;
  /** Valeur connue uniquement ; null si aucune valeur exploitable. */
  readonly knownValueEur: number | null;
  /** Un zéro prouvé est compté ; l'absence de preuve donne null. */
  readonly zeroBalancePositions: number | null;
  readonly unknownPricePositions: number;
  readonly missingChains: readonly string[];
  readonly unknownBalanceChains: readonly string[];
  readonly errors: readonly HealthChainError[];
  readonly valueComplete: boolean;
  /** Provenance brute, conservée même quand la date n'est pas exploitable. */
  readonly generatedAtRaw: string | null;
  readonly scanObservedAt: string | null;
  readonly cacheObservedAt: string | null;
  /** Âge calculé seulement depuis un `now` fourni ; null = UNKNOWN. */
  readonly scanAgeMs: number | null;
  /** null = non évalué (pas de seuil ou pas d'âge) ; jamais un défaut implicite. */
  readonly stale: boolean | null;
  /** Liste de chaînes réellement utilisée pour la couverture. */
  readonly requestedChainsSource: "FILTER" | "RESULT" | "NONE";
  /** Le schéma ne fournit pas ces horodatages : null = UNKNOWN. */
  readonly priceObservedAt: null;
  readonly balanceObservedAt: null;
}

export interface HealthTotals {
  readonly sources: number;
  readonly knownValueEur: number | null;
  readonly valueComplete: boolean;
  readonly exhaustiveValueEur: null;
  readonly unknownPricePositions: number;
  readonly sourcesNotScanned: number;
  readonly sourcesWithUnknown: number;
  readonly sourceErrors: number;
  /** true seulement si `now` et `maxScanAgeMs` ont été fournis. */
  readonly staleEvaluated: boolean;
  readonly staleSources: number | null;
}

export interface HealthScope {
  readonly requested: readonly string[];
  readonly covered: readonly string[];
  readonly missing: readonly string[];
  readonly consistent: boolean;
}

export interface PortfolioHealth {
  readonly sources: readonly SourceHealth[];
  readonly totals: HealthTotals;
  readonly scope: HealthScope;
}

export interface ProjectHealthInput {
  readonly sources: readonly HealthSourceInput[];
  readonly results: readonly ScanResult[];
  readonly filter: { readonly chains: readonly string[] } | null;
  /** Horloge explicite : sans elle, aucun âge n'est calculé. */
  readonly now?: string | null;
  /** Seuil fourni par l'appelant : aucun seuil par défaut n'est inventé. */
  readonly maxScanAgeMs?: number | null;
}

function parseTimestamp(value: string): string | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function positionsOf(chain: ChainScan): TokenAsset[] {
  return chain.native ? [chain.native, ...chain.tokens] : [...chain.tokens];
}

/**
 * Déduplique les sources par identité VM-aware (jamais par adresse brute) :
 * deux entrées du même wallet ne doivent être ni scannées ni comptées deux fois.
 */
function dedupeSources(sources: readonly HealthSourceInput[]): HealthSourceInput[] {
  const seen = new Set<string>();
  const out: HealthSourceInput[] = [];
  for (const source of sources) {
    let key: string;
    try {
      key = partyOf(source.address);
    } catch {
      // Adresse non qualifiable : conserver pour l'afficher comme inconnue,
      // sans fusionner avec une autre.
      key = `INVALID|${source.id}`;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

export function projectPortfolioHealth(input: ProjectHealthInput): PortfolioHealth {
  const sources = dedupeSources(input.sources);
  const nowMs = typeof input.now === "string" ? Date.parse(input.now) : NaN;
  const nowValid = Number.isFinite(nowMs);
  const maxScanAgeMs = typeof input.maxScanAgeMs === "number" && Number.isFinite(input.maxScanAgeMs) && input.maxScanAgeMs > 0
    ? input.maxScanAgeMs
    : null;
  const staleEvaluated = nowValid && maxScanAgeMs !== null;
  const byAddress = new Map<string, ScanResult>();
  const duplicateResults = new Set<string>();
  for (const result of input.results) {
    try {
      const key = partyOf(result.address);
      if (byAddress.has(key)) duplicateResults.add(key);
      else byAddress.set(key, result);
    } catch { /* Source invalide non fusionnée. */ }
  }
  const selectedResults: ScanResult[] = [];

  const projected: SourceHealth[] = sources.map((source) => {
    let result: ScanResult | undefined;
    try { result = byAddress.get(partyOf(source.address)); } catch { /* Aucune preuve de résultat. */ }
    if (!result) {
      return {
        id: source.id, address: source.address, state: "NOT_SCANNED",
        knownValueEur: null, zeroBalancePositions: null, unknownPricePositions: 0,
        missingChains: [], unknownBalanceChains: [], errors: [], valueComplete: false,
        generatedAtRaw: null, scanObservedAt: null, cacheObservedAt: null,
        scanAgeMs: null, stale: null, requestedChainsSource: "NONE",
        priceObservedAt: null, balanceObservedAt: null,
      };
    }

    const requestedChainsSource: "FILTER" | "RESULT" = input.filter ? "FILTER" : "RESULT";
    const requestedChains = (input.filter ? [...input.filter.chains] : result.requestedChains).map((key) => key.toLowerCase());
    const chains = [...new Map(result.chains.filter((c) => !input.filter || requestedChains.includes(c.chainKey.toLowerCase())).map((c) => [c.chainKey.toLowerCase(), c])).values()];
    selectedResults.push({ ...result, requestedChains, chains });
    const duplicateResult = duplicateResults.has(partyOf(source.address));
    const generatedAtRaw = typeof result.generatedAt === "string" ? result.generatedAt : null;
    const scanObservedAt = duplicateResult ? null : parseTimestamp(result.generatedAt);
    let scanAgeMs: number | null = null;
    if (scanObservedAt !== null && nowValid) {
      const scanMs = Date.parse(scanObservedAt);
      // Une date future est une horloge incohérente, pas une fraîcheur prouvée.
      if (Number.isFinite(scanMs) && scanMs <= nowMs) scanAgeMs = nowMs - scanMs;
    }
    const stale = scanAgeMs === null || maxScanAgeMs === null ? null : scanAgeMs > maxScanAgeMs;
    const chainKeys = chains.map((c) => c.chainKey.toLowerCase());
    const missingChains = requestedChains.filter((key) => !chainKeys.includes(key));
    const errors: HealthChainError[] = chains.flatMap((c) =>
      c.errors.map((e) => ({ chainKey: c.chainKey, stage: e.stage, message: e.message })),
    );

    const positions = chains.flatMap(positionsOf);
    const unknownPricePositions = positions.filter((p) => p.priceEur === null).length;
    const zeroBalancePositions = positions.filter((p) => p.balance === 0).length;
    const cacheStamps = chains.map((c) => c.cachedAt).filter((v): v is string => typeof v === "string");
    const cacheObservedAt = cacheStamps.length
      ? cacheStamps.map(parseTimestamp).filter((v): v is string => v !== null).sort().at(-1) ?? null
      : null;

    const unknownBalanceChains = chains.filter((c) => c.errors.some((e) => /balance|init/i.test(e.stage))).map((c) => c.chainKey);
    const knownPositions = chains.filter((c) => !unknownBalanceChains.includes(c.chainKey)).flatMap(positionsOf).filter((p) => Number.isFinite(p.balance) && p.valueEur !== null && Number.isFinite(p.valueEur));
    const rawKnownValue = knownPositions.reduce((sum, p) => sum + (p.valueEur ?? 0), 0);
    const hasValue = knownPositions.length > 0;
    const balanceFailure = errors.some((e) => /balance|init/i.test(e.stage));
    const degraded = chains.some((c) => c.degraded);

    let state: HealthState;
    if (scanObservedAt === null) state = "UNKNOWN";
    else if (chains.length === 0) state = "ERROR";
    else if (degraded) state = "DEGRADED";
    else if (missingChains.length > 0 || errors.length > 0 || unknownPricePositions > 0) state = "PARTIAL";
    else state = "KNOWN";

    return {
      id: source.id,
      address: source.address,
      state,
      knownValueEur: hasValue && scanObservedAt !== null ? rawKnownValue : null,
      zeroBalancePositions: chains.length > 0 && !balanceFailure ? zeroBalancePositions : null,
      unknownPricePositions,
      missingChains,
      unknownBalanceChains,
      errors,
      valueComplete: hasValue && scanObservedAt !== null && !degraded && missingChains.length === 0
        && errors.length === 0 && unknownPricePositions === 0,
      generatedAtRaw,
      scanObservedAt,
      cacheObservedAt,
      scanAgeMs,
      stale,
      requestedChainsSource,
      priceObservedAt: null,
      balanceObservedAt: null,
    };
  });

  const requested = input.filter
    ? [...new Set(input.filter.chains.map((key) => key.toLowerCase()))]
    : [...new Set(selectedResults.flatMap((r) => r.requestedChains))];
  const covered = [...new Set(selectedResults.flatMap((r) => r.chains.map((c) => c.chainKey.toLowerCase())))];
  const missing = requested.filter((key) => !covered.includes(key));

  const knownValues = projected.flatMap((s) => s.knownValueEur === null ? [] : [s.knownValueEur]);
  const knownValueEur = knownValues.length ? knownValues.reduce((sum, value) => sum + value, 0) : null;
  const totals: HealthTotals = {
    sources: projected.length,
    knownValueEur,
    valueComplete: projected.length > 0 && projected.every((s) => s.valueComplete),
    exhaustiveValueEur: null,
    unknownPricePositions: projected.reduce((n, s) => n + s.unknownPricePositions, 0),
    sourcesNotScanned: projected.filter((s) => s.state === "NOT_SCANNED").length,
    sourcesWithUnknown: projected.filter((s) => s.state === "UNKNOWN").length,
    sourceErrors: projected.filter((s) => s.state === "ERROR").length,
    staleEvaluated,
    staleSources: staleEvaluated ? projected.filter((s) => s.stale === true).length : null,
  };

  return {
    sources: projected,
    totals,
    scope: { requested, covered, missing, consistent: missing.length === 0 },
  };
}
