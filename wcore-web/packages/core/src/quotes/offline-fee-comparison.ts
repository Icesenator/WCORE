import { normalizeFeeLines } from "./fee-conversion.js";
import type { FeeAssetIdentity, FeeConversionInput } from "./fee-conversion.js";
import { normalizeQuote } from "./normalize.js";
import type { AmountOutBasis, CostUnit, FeePolicy, ProviderQuote, QuoteCosts } from "./types.js";

/** Attestation locale complète, jamais dérivée d'une réponse provider partielle. */
export interface OfflineFeeFixture {
  quote: ProviderQuote;
  conversion: FeeConversionInput;
  contract: {
    provenance: "SYNTHETIC_FIXTURE";
    completeness: "COMPLETE";
    source: FeeAssetIdentity;
    output: FeeAssetIdentity;
    amountInRaw: bigint;
    amountOutRaw: bigint;
    amountOutBasis: AmountOutBasis;
    feePolicy: FeePolicy;
    costUnit: CostUnit;
    /** Association positionnelle de chaque ligne au poste original, zéros compris. */
    feeFields: readonly (keyof QuoteCosts)[];
  };
}
export interface OfflineFeeResult {
  readonly quote: ProviderQuote;
  readonly totalAdditionalOutputRaw: bigint | null;
  /** Objectif économique en outputRaw, PAS un montant net garanti reçu. */
  readonly comparisonObjectiveRaw: bigint | null;
  readonly blocker: string | null;
  readonly warnings: readonly string[];
}
const fields = ["gasRaw", "bridgeFeeRaw", "protocolFeeRaw"] as const;
const identity = (a: FeeAssetIdentity, b: FeeAssetIdentity): boolean =>
  a.chainId === b.chainId && a.token === b.token && a.decimals === b.decimals && a.role === b.role;

function prepare(f: OfflineFeeFixture, now: number): OfflineFeeResult {
  const { quote: q, conversion: c, contract: k } = f;
  const reject = (blocker: string, warnings: readonly string[] = []): OfflineFeeResult => ({ quote: q, totalAdditionalOutputRaw: null, comparisonObjectiveRaw: null, blocker, warnings });
  if (!k || k.provenance !== "SYNTHETIC_FIXTURE" || k.completeness !== "COMPLETE") return reject("COMPLETE_FIXTURE_REQUIRED");
  if (!Number.isFinite(now) || c.now !== now) return reject("CLOCK_MISMATCH");
  if (!identity(k.source, c.source) || !identity(k.output, c.output)
      || c.source.chainId !== q.fromChainId || c.source.token !== q.fromToken
      || c.output.chainId !== q.toChainId || c.output.token !== (q.outputToken ?? q.toToken)
      || k.amountInRaw !== q.amountInRaw || k.amountOutRaw !== q.amountOutRaw
      || k.amountOutBasis !== (q.amountOutBasis ?? "GROSS") || k.feePolicy !== (q.feePolicy ?? "ADDITIONAL")
      || k.costUnit !== q.costUnit) return reject("FIXTURE_BINDING_MISMATCH");
  if (!Array.isArray(c.fees) || !Array.isArray(k.feeFields) || c.fees.length !== 3 || k.feeFields.length !== 3
      || new Set(k.feeFields).size !== 3 || !fields.every(field => k.feeFields.includes(field))) return reject("COMPLETE_FEES_REQUIRED");
  for (let i = 0; i < 3; i++) {
    const fee = c.fees[i];
    const raw = q.costs[k.feeFields[i]];
    if (!fee || typeof raw !== "bigint" || fee.amountRaw !== raw) return reject("FEE_AMOUNT_BINDING_MISMATCH");
    if ((q.costUnit === "INPUT_RAW" && !identity(fee.asset, c.source))
        || (q.costUnit === "OUTPUT_RAW" && !identity(fee.asset, c.output))) return reject("FEE_UNIT_MISMATCH");
    if (k.feePolicy === "INCLUDED" && !fee.included) return reject("INCLUDED_BINDING_MISMATCH");
  }
  const converted = normalizeFeeLines(c);
  if (converted.status === "UNKNOWN") return reject(converted.reason);
  // Projection PRIVÉE de validation seulement. Les coûts convertis ne sont jamais
  // injectés comme net reçu ni utilisés pour valider un minimum garanti provider.
  const guarded = normalizeQuote({ ...q, costUnit: "OUTPUT_RAW", costs: { gasRaw: 0n, bridgeFeeRaw: 0n, protocolFeeRaw: 0n } }, { now });
  if (!guarded.comparable) return reject(guarded.blocker ?? "QUOTE_INVALID", guarded.warnings);
  const additional = k.amountOutBasis === "NET" || k.feePolicy === "INCLUDED" ? 0n : converted.totalAdditionalOutputRaw;
  const objective = q.amountOutRaw - additional;
  if (objective <= 0n) return reject("NON_POSITIVE_OBJECTIVE", guarded.warnings);
  return { quote: q, totalAdditionalOutputRaw: additional, comparisonObjectiveRaw: objective, blocker: null, warnings: guarded.warnings };
}

/** Pure, sans réseau/cache/budget/permission. Aucune admission de quote LIVE. */
export function compareOfflineFees(fixtures: readonly OfflineFeeFixture[], { now }: { now: number }) {
  const results = fixtures.map(f => prepare(f, now));
  const first = fixtures[0];
  const mixed = first && fixtures.some(f => !identity(first.conversion.source, f.conversion.source)
    || !identity(first.conversion.output, f.conversion.output) || first.quote.amountInRaw !== f.quote.amountInRaw);
  if (mixed) return { provenance: "SYNTHETIC_FIXTURE" as const, ranked: [], unrankable: results.map(r => ({ ...r, totalAdditionalOutputRaw: null, comparisonObjectiveRaw: null, blocker: "MIXED_REQUEST" })), best: null };
  const candidates = results.filter(r => r.blocker === null);
  const mixedRisk = candidates.some(r => r.quote.riskScore === "UNKNOWN");
  const ranked = candidates.sort((a, b) => {
    const delta = b.comparisonObjectiveRaw! - a.comparisonObjectiveRaw!;
    if (delta !== 0n) return delta > 0n ? 1 : -1;
    return a.quote.estimatedDurationSec - b.quote.estimatedDurationSec || a.quote.steps - b.quote.steps
      || (!mixedRisk ? (a.quote.riskScore as number) - (b.quote.riskScore as number) : 0);
  });
  return { provenance: "SYNTHETIC_FIXTURE" as const, ranked, unrankable: results.filter(r => r.blocker !== null), best: ranked[0] ?? null };
}
