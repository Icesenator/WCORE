import type {
  NormalizedQuote,
  PathCompleteness,
  ProviderQuote,
  QuoteBlocker,
} from "./types.js";

const isPositive = (value: bigint): boolean => value > 0n;

/** Clé de déduplication : même paire, mêmes tokens, même chemin sous-jacent complet. */
export function pathKey(quote: ProviderQuote): string {
  // Le tuple JSON conserve les frontières des champs et des hops, même si
  // un identifiant contient les anciens séparateurs « : » ou « > ».
  return JSON.stringify([
    quote.fromChainId,
    quote.toChainId,
    quote.fromToken,
    quote.outputToken ?? quote.toToken,
    quote.path,
  ]);
}

/** Bucket de comparaison : deux tokens de sortie différents ne se comparent pas. */
export function bucketKey(quote: ProviderQuote): string {
  return [quote.fromChainId, quote.toChainId, quote.outputToken ?? quote.toToken].join(":");
}

function totalCost(quote: ProviderQuote): bigint {
  const { gasRaw = 0n, bridgeFeeRaw = 0n, protocolFeeRaw = 0n } = quote.costs;
  return gasRaw + bridgeFeeRaw + protocolFeeRaw;
}

function amountOutBasis(quote: ProviderQuote): "GROSS" | "NET" {
  return quote.amountOutBasis ?? "GROSS";
}

function feePolicy(quote: ProviderQuote): "INCLUDED" | "ADDITIONAL" | "UNDOCUMENTED" {
  return quote.feePolicy ?? "ADDITIONAL";
}

function pathCompleteness(quote: ProviderQuote): PathCompleteness {
  return quote.pathCompleteness ?? "COMPLETE";
}

function blockerFor(quote: ProviderQuote, now: number): QuoteBlocker | null {
  if (quote.signed === true) return "SIGNED_QUOTE_FORBIDDEN";
  // Un coût dans une autre unité n'est jamais traité comme zéro.
  if (quote.costUnit !== "OUTPUT_RAW") return "COST_UNIT_NOT_NORMALIZED";
  if (feePolicy(quote) === "UNDOCUMENTED") return "FEES_UNDOCUMENTED";
  // Frais annoncés inclus mais montant déclaré brut : ambiguïté de contrat.
  if (feePolicy(quote) === "INCLUDED" && amountOutBasis(quote) === "GROSS") return "FEE_POLICY_CONFLICT";
  if (!isPositive(quote.amountInRaw)) return "INVALID_AMOUNT_IN";
  if (!isPositive(quote.amountOutRaw)) return "INVALID_AMOUNT_OUT";
  if (!Number.isInteger(quote.slippageBps) || quote.slippageBps < 0 || quote.slippageBps > 10_000) {
    return "INVALID_SLIPPAGE";
  }
  if (!Number.isInteger(quote.steps) || quote.steps < 1) return "INVALID_STEPS";
  if (quote.riskScore !== "UNKNOWN"
      && (typeof quote.riskScore !== "number" || !Number.isFinite(quote.riskScore) || quote.riskScore < 0 || quote.riskScore > 1)) {
    return "INVALID_RISK";
  }
  if (quote.path.length === 0) return "MISSING_PATH";
  // Un chemin incomplet rend la déduplication non fiable : jamais fusionné.
  if (pathCompleteness(quote) === "INCOMPLETE") return "PATH_INCOMPLETE";
  if (quote.expiresAt !== undefined) {
    if (!Number.isFinite(quote.expiresAt)) return "INVALID_EXPIRY";
    if (now >= quote.expiresAt) return "QUOTE_EXPIRED";
  }
  if (quote.expectedOutRaw !== undefined
      && (typeof quote.expectedOutRaw !== "bigint" || quote.expectedOutRaw < 0n)) {
    return "INVALID_EXPECTED_AMOUNT_OUT";
  }
  if (quote.minAmountOutRaw !== undefined
      && (typeof quote.minAmountOutRaw !== "bigint" || quote.minAmountOutRaw < 0n)) {
    return "INVALID_MIN_AMOUNT_OUT";
  }
  if (quote.expectedOutRaw !== undefined && quote.minAmountOutRaw !== undefined
      && quote.minAmountOutRaw > quote.expectedOutRaw) {
    return "INVALID_MIN_AMOUNT_OUT";
  }
  const costs = quote.costs;
  for (const value of [costs.gasRaw, costs.bridgeFeeRaw, costs.protocolFeeRaw]) {
    if (value !== undefined && value < 0n) return "NEGATIVE_COST";
  }
  return null;
}

function warningsFor(quote: ProviderQuote): string[] {
  const warnings: string[] = [];
  if (quote.riskScore === "UNKNOWN") warnings.push("RISK_UNKNOWN");
  if ((quote.slippageSource ?? "UNKNOWN") === "UNKNOWN") warnings.push("SLIPPAGE_SOURCE_UNKNOWN");
  if (quote.minAmountOutRaw === undefined) warnings.push("MIN_AMOUNT_OUT_UNKNOWN");
  if (quote.expiresAt === undefined) warnings.push("EXPIRY_UNKNOWN");
  return warnings;
}

/**
 * Normalise une quote par montant NET REÇU.
 *
 * - `amountOutBasis=NET` : le montant est déjà net, aucun coût n'est re-soustrait.
 * - `feePolicy=INCLUDED` : frais déjà compris, aucun coût n'est re-soustrait.
 * - `feePolicy=ADDITIONAL` + `amountOutBasis=GROSS` : coûts déduits une fois.
 * - `feePolicy=UNDOCUMENTED` : refus, jamais assimilé à zéro.
 */
export function normalizeQuote(quote: ProviderQuote, { now = Date.now() / 1000 }: { now?: number } = {}): NormalizedQuote {
  const base = {
    quote,
    pathKey: pathKey(quote),
    bucket: bucketKey(quote),
    warnings: warningsFor(quote),
  };
  const blocker = blockerFor(quote, now);
  if (blocker !== null) {
    return { ...base, comparable: false, blocker, totalCostRaw: null, netReceivedRaw: null };
  }

  const alreadyNet = amountOutBasis(quote) === "NET" || feePolicy(quote) === "INCLUDED";
  const cost = alreadyNet ? 0n : totalCost(quote);
  const net = quote.amountOutRaw - cost;

  if (quote.minAmountOutRaw !== undefined && net < quote.minAmountOutRaw) {
    return { ...base, comparable: false, blocker: "BELOW_MIN_AMOUNT_OUT", totalCostRaw: cost, netReceivedRaw: net };
  }
  if (net <= 0n) {
    return { ...base, comparable: false, blocker: "NON_POSITIVE_NET", totalCostRaw: cost, netReceivedRaw: net };
  }
  return { ...base, comparable: true, blocker: null, totalCostRaw: cost, netReceivedRaw: net };
}
