import type {
  DuplicateQuote,
  NormalizedQuote,
  ProviderQuote,
  QuoteComparison,
  RankedQuote,
} from "./types.js";
import { normalizeQuote } from "./normalize.js";

function byBestFirst(a: NormalizedQuote, b: NormalizedQuote): number {
  const net = (b.netReceivedRaw ?? 0n) - (a.netReceivedRaw ?? 0n);
  if (net !== 0n) return net > 0n ? 1 : -1;
  if (a.quote.estimatedDurationSec !== b.quote.estimatedDurationSec) {
    return a.quote.estimatedDurationSec - b.quote.estimatedDurationSec;
  }
  if (a.quote.steps !== b.quote.steps) return a.quote.steps - b.quote.steps;
  // UNKNOWN n'est pas une estimation moyenne : aucun avantage de sécurité.
  if (typeof a.quote.riskScore === "number" && typeof b.quote.riskScore === "number") {
    return a.quote.riskScore - b.quote.riskScore;
  }
  return 0;
}

/**
 * Compare des quotes de façon PURE et READ-ONLY.
 *
 * - normalise chaque route par montant net reçu ;
 * - ne déduplique que des chemins sous-jacents COMPLETS et identiques ;
 * - ne compare jamais deux tokens de sortie différents (buckets séparés) ;
 * - laisse les routes non comparables hors classement avec leur motif exact ;
 * - ne construit, ne signe et n'envoie aucune transaction.
 */
export function compareQuotes(
  quotes: readonly ProviderQuote[],
  { now = Date.now() / 1000 }: { now?: number } = {},
): QuoteComparison {
  const normalized = quotes.map((quote) => normalizeQuote(quote, { now }));
  const unrankable: NormalizedQuote[] = [];
  const duplicates: DuplicateQuote[] = [];
  const bestByPath = new Map<string, NormalizedQuote>();

  for (const item of normalized) {
    if (!item.comparable || item.netReceivedRaw === null) {
      unrankable.push(item);
      continue;
    }
    const existing = bestByPath.get(item.pathKey);
    if (!existing) {
      bestByPath.set(item.pathKey, item);
      continue;
    }
    const existingNet = existing.netReceivedRaw ?? 0n;
    if (item.netReceivedRaw > existingNet) {
      duplicates.push({ quote: existing.quote, duplicateOf: item.quote.routeId, netReceivedRaw: existingNet });
      bestByPath.set(item.pathKey, item);
    } else {
      duplicates.push({ quote: item.quote, duplicateOf: existing.quote.routeId, netReceivedRaw: item.netReceivedRaw });
    }
  }

  const comparable = [...bestByPath.values()];
  // Un groupe mixte doit employer une seule relation transitive : désactiver
  // le départage par risque pour tout le groupe si une mesure est inconnue.
  const mixedRisk = comparable.some(item => item.quote.riskScore === "UNKNOWN");
  const ranked: RankedQuote[] = comparable
    .sort((a, b) => mixedRisk
      ? byBestFirst({ ...a, quote: { ...a.quote, riskScore: "UNKNOWN" } }, { ...b, quote: { ...b.quote, riskScore: "UNKNOWN" } })
      : byBestFirst(a, b))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const bestByBucket: Record<string, RankedQuote> = {};
  for (const item of ranked) {
    if (!bestByBucket[item.bucket]) bestByBucket[item.bucket] = item;
  }

  return {
    ranked,
    unrankable,
    duplicates,
    best: ranked[0] ?? null,
    bestByBucket,
  };
}
