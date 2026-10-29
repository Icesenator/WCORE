import { compareOfflineFees } from "./offline-fee-comparison.js";
import type { OfflineFeeFixture, OfflineFeeResult } from "./offline-fee-comparison.js";
import type { FeeAssetIdentity, FeeLine } from "./fee-conversion.js";
import type { AmountOutBasis, PathCompleteness, ProviderQuote, QuoteCosts } from "./types.js";
import type { ProviderFeeConvention } from "./registry.js";

/** Projection interne de fixtures uniquement, jamais une admission provider LIVE. */
export interface OfflineEconomicResult {
  provider: ProviderQuote["provider"];
  routeId: ProviderQuote["routeId"];
  source: FeeAssetIdentity;
  output: FeeAssetIdentity;
  amountInRaw: bigint;
  amountOutRaw: bigint;
  amountOutBasis: AmountOutBasis;
  expectedOutRaw: bigint | null;
  /** Déclaration provider seulement, ni vérification de garantie ni net garanti. */
  providerMinimum: { status: "KNOWN"; amountRaw: bigint } | { status: "UNKNOWN"; amountRaw: null };
  declaredFees: ProviderFeeConvention & { costs: QuoteCosts; lines: readonly FeeLine[] };
  totalAdditionalOutputRaw: bigint | null;
  comparisonObjectiveRaw: bigint | null;
  objectiveStatus: "PROVISIONAL" | null;
  temporalStatus: "CURRENT" | "EXPIRED" | "UNKNOWN";
  expiresAt: number | null;
  path: ProviderQuote["path"];
  pathCompleteness: PathCompleteness;
  riskScore: ProviderQuote["riskScore"];
  warnings: readonly string[];
  blockers: readonly string[];
  provenance: "SYNTHETIC_FIXTURE";
  realAvailability: "NON_ATTESTED";
  guaranteedNet: "NOT_CLAIMED";
}

function project(result: OfflineFeeResult, fixture: OfflineFeeFixture, now: number): OfflineEconomicResult {
  const q = result.quote;
  // Les sous-objets de la projection sont détachés, y compris les identités des
  // lignes de frais ; compareOfflineFees conserve volontairement sa référence quote.
  return structuredClone({
    provider: q.provider,
    routeId: q.routeId,
    source: fixture.conversion.source,
    output: fixture.conversion.output,
    amountInRaw: q.amountInRaw,
    amountOutRaw: q.amountOutRaw,
    amountOutBasis: q.amountOutBasis ?? "GROSS",
    expectedOutRaw: typeof q.expectedOutRaw === "bigint" && q.expectedOutRaw >= 0n ? q.expectedOutRaw : null,
    providerMinimum: typeof q.minAmountOutRaw === "bigint" && q.minAmountOutRaw >= 0n
      ? { status: "KNOWN", amountRaw: q.minAmountOutRaw }
      : { status: "UNKNOWN", amountRaw: null },
    declaredFees: {
      policy: q.feePolicy ?? "ADDITIONAL",
      costUnit: q.costUnit,
      amountOutBasis: q.amountOutBasis ?? "GROSS",
      costs: q.costs,
      lines: fixture.conversion.fees,
    },
    totalAdditionalOutputRaw: result.totalAdditionalOutputRaw,
    comparisonObjectiveRaw: result.comparisonObjectiveRaw,
    objectiveStatus: result.comparisonObjectiveRaw === null ? null : "PROVISIONAL",
    temporalStatus: !Number.isFinite(now) || q.expiresAt === undefined || !Number.isFinite(q.expiresAt)
      ? "UNKNOWN" : now >= q.expiresAt ? "EXPIRED" : "CURRENT",
    expiresAt: q.expiresAt !== undefined && Number.isFinite(q.expiresAt) ? q.expiresAt : null,
    path: q.path,
    pathCompleteness: q.pathCompleteness ?? "COMPLETE",
    riskScore: q.riskScore,
    warnings: result.warnings,
    blockers: result.blocker === null ? [] : [result.blocker],
    provenance: "SYNTHETIC_FIXTURE",
    realAvailability: "NON_ATTESTED",
    guaranteedNet: "NOT_CLAIMED",
  } satisfies OfflineEconomicResult);
}

/** Pure : réutilise le classement offline sans reclassement ni permission réseau. */
export function compareOfflineEconomicResults(fixtures: readonly OfflineFeeFixture[], { now }: { now: number }) {
  // Une copie par occurrence permet de relier sans ambiguïté même deux fixtures
  // partageant la même quote d'entrée. Aucune référence de l'appelant ne sort.
  const snapshots = fixtures.map(fixture => structuredClone(fixture));
  const byQuote = new Map(snapshots.map(fixture => [fixture.quote, fixture]));
  const comparison = compareOfflineFees(snapshots, { now });
  const projectResult = (result: OfflineFeeResult) => project(result, byQuote.get(result.quote)!, now);
  const ranked = comparison.ranked.map(projectResult);
  return {
    provenance: comparison.provenance,
    ranked,
    unrankable: comparison.unrankable.map(projectResult),
    best: ranked[0] ?? null,
  };
}
