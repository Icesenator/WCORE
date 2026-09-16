// WC-10 — semantic contract separating a tokenized stock's *reference* price from its
// *executable* claim value.
//
// WCORE only ever observes a reference/mark price for a tokenized stock (e.g. Yahoo
// regularMarketPrice via the relay, with a CompaniesMarketCap fallback). That number is
// the spot of the underlying — it is NOT the price at which the on-chain token/claim can
// actually be bought, sold or redeemed. Presenting the reference as the executable value
// would be a silent product lie.
//
// This module defines the distinction explicitly and fails closed: unless a verifiable
// executable source is supplied, `executable` is UNKNOWN (null), never a copy of the
// reference. It performs no trading, no signing and no network I/O — pure data shaping.

export type ValuationStatus = "AVAILABLE" | "UNKNOWN" | "STALE" | "NOT_APPLICABLE";

/** Reference / spot / mark price of the underlying. */
export interface ReferenceValue {
  priceEur: number | null;
  source: string | null;
  stale: boolean;
  status: ValuationStatus;
}

/** Price at which the token/claim can really be exchanged — only when observed. */
export interface ExecutableValue {
  priceEur: number | null;
  source: string | null;
  venue: string | null;
  stale: boolean;
  status: ValuationStatus;
}

/** Premium (positive) or discount (negative) of executable vs reference, as a fraction. */
export interface PremiumDiscount {
  pct: number | null;
  status: ValuationStatus;
}

export interface LiquidityValue {
  /** Executable notional in EUR, only when a venue actually reports depth. Never inferred. */
  notionalEur: number | null;
  status: ValuationStatus;
}

export interface FeesValue {
  /** Total round-trip cost in EUR, only when a venue reports it. Never inferred. */
  costEur: number | null;
  status: ValuationStatus;
}

export interface RedemptionValue {
  status: ValuationStatus;
}

export interface StockValuation {
  reference: ReferenceValue;
  executable: ExecutableValue;
  premiumDiscount: PremiumDiscount;
  liquidity: LiquidityValue;
  fees: FeesValue;
  redemption: RedemptionValue;
}

export interface ExecutableSource {
  priceEur: number | null | undefined;
  source?: string | null;
  venue?: string | null;
  stale?: boolean;
}

export interface DeriveStockValuationInput {
  referencePriceEur: number | null | undefined;
  referenceSource?: string | null;
  referenceStale?: boolean;
  /**
   * Executable price, ONLY when a verifiable executable source exists. Must never be
   * defaulted to the reference — callers that have no executable feed pass nothing, and
   * the resulting executable value stays UNKNOWN.
   */
  executable?: ExecutableSource | null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Premium/discount fraction of executable vs reference (same currency required).
 * Returns null (UNKNOWN) unless BOTH prices are valid — never fabricated from one side.
 * Guard: the reference must be strictly positive.
 */
export function computePremiumDiscountPct(
  referencePriceEur: number | null | undefined,
  executablePriceEur: number | null | undefined,
): number | null {
  if (!isPositiveFinite(referencePriceEur) || !isPositiveFinite(executablePriceEur)) return null;
  return (executablePriceEur - referencePriceEur) / referencePriceEur;
}

export function deriveStockValuation(input: DeriveStockValuationInput): StockValuation {
  const referencePrice = isPositiveFinite(input.referencePriceEur) ? input.referencePriceEur : null;
  const referenceStale = referencePrice !== null && Boolean(input.referenceStale);
  const reference: ReferenceValue = {
    priceEur: referencePrice,
    source: referencePrice === null ? null : (input.referenceSource ?? null),
    stale: referenceStale,
    status: referencePrice === null ? "UNKNOWN" : (referenceStale ? "STALE" : "AVAILABLE"),
  };

  const exe = input.executable ?? null;
  const exePrice = exe && isPositiveFinite(exe.priceEur) ? exe.priceEur : null;
  const exeStale = exePrice !== null && Boolean(exe?.stale);
  const executable: ExecutableValue = {
    priceEur: exePrice,
    source: exePrice === null ? null : (exe?.source ?? null),
    venue: exePrice === null ? null : (exe?.venue ?? null),
    stale: exeStale,
    status: exePrice === null ? "UNKNOWN" : (exeStale ? "STALE" : "AVAILABLE"),
  };

  const pct = computePremiumDiscountPct(referencePrice, exePrice);
  const premiumDiscount: PremiumDiscount = {
    pct,
    status: pct === null ? "UNKNOWN" : "AVAILABLE",
  };

  return {
    reference,
    executable,
    premiumDiscount,
    liquidity: { notionalEur: null, status: "UNKNOWN" },
    fees: { costEur: null, status: "UNKNOWN" },
    redemption: { status: "UNKNOWN" },
  };
}
