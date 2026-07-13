// Stock prices are fetched through the cex-relay (Railway IP). Yahoo Finance
// refuses connections from the WCORE API datacenter IP (`fetch failed`), exactly
// like Binance HTTP 451. The relay reaches Yahoo, prices Bitpanda stock/ETF
// symbols, converts to EUR, and returns a {SYMBOL:{priceEur,source}} map.

import { getBitpandaSecurity } from "../stocks/mappings.js";

export type StockPriceMap = Record<string, { priceEur: number; source: string }>;

export interface StockNativeQuote {
  priceNative: number;
  currency: string;
  yahooTicker: string;
  source: string;
}

export type StockNativeQuoteMap = Record<string, StockNativeQuote>;

export interface StockFxQuote {
  unitsPerEur: number;
  currency: string;
  yahooTicker: string;
  source: string;
}

export type StockFxQuoteMap = Record<string, StockFxQuote>;

export interface StockRelayDeps {
  fetchImpl?: typeof fetch;
  relayUrl: string;
  relayToken: string;
}

function normalizeStockCurrency(value: string): string {
  const currency = value.trim();
  return currency === "GBp" ? "GBX" : currency.toUpperCase();
}

const STOCK_FX_CURRENCIES = new Set([
  "CNY", "HKD", "CHF", "JPY", "TWD", "GBP", "SEK", "DKK", "NOK",
  "AUD", "CAD", "KRW", "SAR", "AED", "EUR",
]);
const STOCK_QUOTE_CURRENCIES = new Set([
  "USD", "EUR", "CNY", "HKD", "CHF", "JPY", "TWD", "GBX", "SEK", "DKK",
  "NOK", "AUD", "CAD", "KRW", "SAR", "AED",
]);

function normalizeStockFxCurrencies(currencies: string[]): string[] | null {
  if (!Array.isArray(currencies) || currencies.length > 20) return null;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of currencies) {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    const currency = raw.toUpperCase() === "GBX" || raw === "GBp" ? "GBP" : raw.toUpperCase();
    if (!STOCK_FX_CURRENCIES.has(currency)) return null;
    if (!seen.has(currency)) {
      seen.add(currency);
      unique.push(currency);
    }
  }
  return unique;
}

export async function fetchStockPricesViaRelay(symbols: string[], deps: StockRelayDeps): Promise<StockPriceMap> {
  const unique = [...new Set(symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${deps.relayUrl.replace(/\/+$/, "")}/stock/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: deps.relayToken, symbols: unique }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return {};
    const data = await res.json() as { ok?: boolean; prices?: StockPriceMap };
    if (!data?.ok || !data.prices) return {};
    const out: StockPriceMap = {};
    for (const [sym, price] of Object.entries(data.prices)) {
      if (price && typeof price.priceEur === "number" && price.priceEur > 0) {
        out[sym.toUpperCase()] = { priceEur: price.priceEur, source: price.source ?? "yahoo:relay" };
      }
    }
    return out;
  } catch (e) {
    console.error("cex stock relay error:", (e as Error).message);
    return {};
  }
}

export async function fetchStockQuotesViaRelay(symbols: string[], deps: StockRelayDeps): Promise<StockNativeQuoteMap> {
  if (!Array.isArray(symbols) || symbols.length > 300) return {};
  const unique = [...new Set(symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return {};
  const requested = new Set(unique);
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${deps.relayUrl.replace(/\/+$/, "")}/stock/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: deps.relayToken, symbols: unique }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return {};
    const data = await res.json() as { ok?: unknown; quotes?: unknown };
    if (data?.ok !== true || !data.quotes || typeof data.quotes !== "object" || Array.isArray(data.quotes)) return {};
    const out: StockNativeQuoteMap = {};
    for (const [symbol, value] of Object.entries(data.quotes)) {
      const normalizedSymbol = symbol.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(normalizedSymbol) || !requested.has(normalizedSymbol)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const quote = value as Record<string, unknown>;
      const currency = typeof quote.currency === "string" ? normalizeStockCurrency(quote.currency) : "";
      const yahooTicker = typeof quote.yahooTicker === "string" ? quote.yahooTicker.trim().toUpperCase() : "";
      const source = typeof quote.source === "string" ? quote.source.trim() : "";
      const security = getBitpandaSecurity(normalizedSymbol);
      const allowedCandidates = new Set(security.yahooTickers.map((candidate) => candidate.toUpperCase()));
      const expectedCurrency = security.expectedCurrency ? normalizeStockCurrency(security.expectedCurrency) : null;
      if (
        typeof quote.priceNative !== "number" || !Number.isFinite(quote.priceNative) || quote.priceNative <= 0
        || !STOCK_QUOTE_CURRENCIES.has(currency)
        || (expectedCurrency !== null && currency !== expectedCurrency)
        || !allowedCandidates.has(yahooTicker)
        || source !== "yahoo:relay"
      ) continue;
      out[normalizedSymbol] = {
        priceNative: quote.priceNative,
        currency,
        yahooTicker,
        source: "yahoo:relay",
      };
    }
    return out;
  } catch (e) {
    console.error("cex stock quote relay error:", (e as Error).message);
    return {};
  }
}

export async function fetchStockFxQuotesViaRelay(currencies: string[], deps: StockRelayDeps): Promise<StockFxQuoteMap> {
  const unique = normalizeStockFxCurrencies(currencies);
  if (!unique || unique.length === 0) return {};
  const requested = new Set(unique);
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${deps.relayUrl.replace(/\/+$/, "")}/stock/fx-quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: deps.relayToken, currencies: unique }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return {};
    const data = await res.json() as { ok?: unknown; quotes?: unknown };
    if (data?.ok !== true || !data.quotes || typeof data.quotes !== "object" || Array.isArray(data.quotes)) return {};
    const out: StockFxQuoteMap = {};
    for (const [key, value] of Object.entries(data.quotes)) {
      const currency = key.trim().toUpperCase();
      if (!requested.has(currency) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const quote = value as Record<string, unknown>;
      const isEurIdentity = currency !== "EUR" || (
        quote.unitsPerEur === 1
        && quote.yahooTicker === "EUR"
        && quote.source === "identity:eur"
      );
      if (
        quote.currency !== currency
        || typeof quote.unitsPerEur !== "number" || !Number.isFinite(quote.unitsPerEur) || quote.unitsPerEur <= 0
        || typeof quote.yahooTicker !== "string" || quote.yahooTicker.trim() !== (currency === "EUR" ? "EUR" : `EUR${currency}=X`)
        || typeof quote.source !== "string" || !quote.source.trim()
        || !isEurIdentity
      ) continue;
      out[currency] = {
        unitsPerEur: quote.unitsPerEur,
        currency,
        yahooTicker: quote.yahooTicker.trim(),
        source: quote.source.trim(),
      };
    }
    return out;
  } catch (e) {
    console.error("cex stock FX relay error:", (e as Error).message);
    return {};
  }
}
