import type { StockNativeQuote } from "../cex/stock-relay.js";

export interface ResolvedStockPrice {
  priceNative: number | null;
  currency: string | null;
  priceEur: number | null;
  priceSource: string | null;
  fallbackSource: string | null;
  appliedRatio: number;
  stale: boolean;
  updatedAt: string;
  errors: Array<{ code: string; message: string }>;
}

export interface ResolveStockPriceInput {
  quote: StockNativeQuote | null | undefined;
  nativeToEur: number | null | undefined;
  companiesMarketCapPriceEur: number | null | undefined;
  lastGood: ResolvedStockPrice | null | undefined;
  now?: Date | string;
  appliedRatio?: number;
}

const COMPANIES_MARKET_CAP_SOURCE = "companiesmarketcap";
const DRIFT_ERROR = {
  code: "source_drift",
  message: "Yahoo and CompaniesMarketCap prices differ by more than 15%",
};
const UNAVAILABLE_ERROR = {
  code: "price_unavailable",
  message: "No valid stock price is available",
};
const SUPPORTED_FX_CURRENCIES = new Set(["USD", "KRW", "CHF", "JPY", "GBX", "CNY", "HKD", "TWD", "SEK", "DKK", "NOK", "AUD", "CAD", "SAR", "AED"]);

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeCurrency(value: string): string {
  const currency = value.trim();
  return currency === "GBp" ? "GBX" : currency.toUpperCase();
}

function decimalInteger(value: number): { coefficient: bigint; exponent: number } {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.toString());
  if (!match) throw new Error("Invalid finite decimal");
  const fraction = match[2] ?? "";
  return {
    coefficient: BigInt(`${match[1]}${fraction}`),
    exponent: Number(match[3] ?? 0) - fraction.length,
  };
}

function isDriftAboveLimit(a: number, b: number): boolean {
  const left = decimalInteger(a);
  const right = decimalInteger(b);
  const commonExponent = Math.min(left.exponent, right.exponent);
  const leftInteger = left.coefficient * 10n ** BigInt(left.exponent - commonExponent);
  const rightInteger = right.coefficient * 10n ** BigInt(right.exponent - commonExponent);
  const difference = leftInteger > rightInteger ? leftInteger - rightInteger : rightInteger - leftInteger;
  const maximum = leftInteger > rightInteger ? leftInteger : rightInteger;
  return difference * 100n > maximum * 15n;
}

function resolveUpdatedAt(now: Date | string | undefined): string {
  const candidate = now instanceof Date ? now : new Date(now ?? Date.now());
  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : new Date().toISOString();
}

function quotePriceEur(quote: StockNativeQuote | null | undefined, nativeToEur: number | null | undefined): number | null {
  if (!quote || !isPositiveFinite(quote.priceNative) || typeof quote.currency !== "string") return null;

  const currency = normalizeCurrency(quote.currency);
  if (currency === "EUR") return quote.priceNative;
  if (!SUPPORTED_FX_CURRENCIES.has(currency) || !isPositiveFinite(nativeToEur)) return null;

  const nativeUnits = currency === "GBX" ? quote.priceNative / 100 : quote.priceNative;
  const priceEur = nativeUnits * nativeToEur;
  return isPositiveFinite(priceEur) ? priceEur : null;
}

function validLastGood(lastGood: ResolvedStockPrice | null | undefined): lastGood is ResolvedStockPrice {
  return Boolean(
    lastGood
    && isPositiveFinite(lastGood.priceEur)
    && (lastGood.priceNative === null || isPositiveFinite(lastGood.priceNative))
    && isPositiveFinite(lastGood.appliedRatio),
  );
}

function staleResult(lastGood: ResolvedStockPrice, error?: { code: string; message: string }): ResolvedStockPrice {
  return {
    ...lastGood,
    stale: true,
    errors: error ? [...lastGood.errors, error] : [...lastGood.errors],
  };
}

export function resolveStockPrice(input: ResolveStockPriceInput): ResolvedStockPrice {
  const updatedAt = resolveUpdatedAt(input.now);
  const appliedRatio = isPositiveFinite(input.appliedRatio) ? input.appliedRatio : 1;
  const currency = typeof input.quote?.currency === "string" && input.quote.currency.trim()
    ? normalizeCurrency(input.quote.currency)
    : null;
  const priceNative = isPositiveFinite(input.quote?.priceNative) ? input.quote.priceNative : null;
  const yahooPriceEur = quotePriceEur(input.quote, input.nativeToEur);
  const companiesMarketCapPriceEur = isPositiveFinite(input.companiesMarketCapPriceEur)
    ? input.companiesMarketCapPriceEur
    : null;

  if (yahooPriceEur !== null && companiesMarketCapPriceEur !== null) {
    if (isDriftAboveLimit(yahooPriceEur, companiesMarketCapPriceEur)) {
      if (validLastGood(input.lastGood)) return staleResult(input.lastGood, DRIFT_ERROR);
      return {
        priceNative,
        currency,
        priceEur: null,
        priceSource: null,
        fallbackSource: null,
        appliedRatio,
        stale: false,
        updatedAt,
        errors: [DRIFT_ERROR],
      };
    }
  }

  if (yahooPriceEur !== null) {
    return {
      priceNative,
      currency,
      priceEur: yahooPriceEur,
      priceSource: input.quote?.source?.trim() || "yahoo:relay",
      fallbackSource: companiesMarketCapPriceEur === null ? null : COMPANIES_MARKET_CAP_SOURCE,
      appliedRatio,
      stale: false,
      updatedAt,
      errors: [],
    };
  }

  if (companiesMarketCapPriceEur !== null) {
    return {
      priceNative,
      currency,
      priceEur: companiesMarketCapPriceEur,
      priceSource: COMPANIES_MARKET_CAP_SOURCE,
      fallbackSource: null,
      appliedRatio,
      stale: false,
      updatedAt,
      errors: [],
    };
  }

  if (validLastGood(input.lastGood)) return staleResult(input.lastGood, UNAVAILABLE_ERROR);

  return {
    priceNative,
    currency,
    priceEur: null,
    priceSource: null,
    fallbackSource: null,
    appliedRatio,
    stale: false,
    updatedAt,
    errors: [UNAVAILABLE_ERROR],
  };
}
