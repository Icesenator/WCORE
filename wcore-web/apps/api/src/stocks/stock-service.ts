import { getEurUsdRate, type CacheStore } from "@wcore/core";
import { cacheKey } from "@wcore/shared";
import {
  fetchStockFxQuotesViaRelay,
  fetchStockQuotesViaRelay,
  type StockFxQuoteMap,
  type StockNativeQuoteMap,
} from "../cex/stock-relay.js";
import { getBitpandaSecurity, mapTopMarketCapTicker } from "./mappings.js";
import { resolveStockPrice, type ResolvedStockPrice } from "./stock-pricing.js";
import { parseTopMarketCapCsv } from "./top-market-cap.js";

const CMC_URL = "https://companiesmarketcap.com/?download=csv";
const DEFAULT_SNAPSHOT_LIMIT = 300;
const MAX_SNAPSHOT_LIMIT = 5_000;
const STOCK_QUOTE_BATCH_SIZE = 50;
const FRESH_TTL_MS = 1 * 60 * 60 * 1000;
const LAST_GOOD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;
const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;

export interface StockSnapshotRow extends ResolvedStockPrice {
  rank: number;
  company: string;
  country: string;
  sourceTicker: string;
  canonicalTicker: string;
  yahooTicker: string | null;
  bitpandaAliases: string[];
  marketCapUsd: number;
  marketCapEur: number;
  supply: number;
}

export interface TopMarketCapSnapshot {
  ok: true;
  generatedAt: string;
  universeSource: "companiesmarketcap";
  rows: StockSnapshotRow[];
  stats: {
    requested: number;
    pricedFresh: number;
    pricedStale: number;
    unpriced: number;
  };
  stale: boolean;
}

export interface CanonicalStockServiceDeps {
  cache: CacheStore;
  fetchImpl?: typeof fetch;
  fetchStockQuotes?: (symbols: string[]) => Promise<StockNativeQuoteMap>;
  fetchStockFxQuotes?: (currencies: string[]) => Promise<StockFxQuoteMap>;
  getUsdToEur?: () => Promise<number>;
  now?: () => Date;
}

export class StockServiceUnavailableError extends Error {
  constructor(message = "Canonical stock snapshot is unavailable") {
    super(message);
    this.name = "StockServiceUnavailableError";
  }
}

export class CanonicalStockService {
  private readonly fetchImpl: typeof fetch;
  private readonly fetchQuotes: (symbols: string[]) => Promise<StockNativeQuoteMap>;
  private readonly fetchFx: (currencies: string[]) => Promise<StockFxQuoteMap>;
  private readonly usdToEur: () => Promise<number>;
  private readonly now: () => Date;

  constructor(private readonly deps: CanonicalStockServiceDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    const relay = () => ({
      fetchImpl: this.fetchImpl,
      relayUrl: stockRelayUrl(),
      relayToken: process.env.RELAY_TOKEN ?? "",
    });
    this.fetchQuotes = deps.fetchStockQuotes ?? ((symbols) => fetchStockQuotesViaRelay(symbols, relay()));
    this.fetchFx = deps.fetchStockFxQuotes ?? ((currencies) => fetchStockFxQuotesViaRelay(currencies, relay()));
    this.usdToEur = deps.getUsdToEur ?? (() => getEurUsdRate({ cache: deps.cache }));
    this.now = deps.now ?? (() => new Date());
  }

  async getTopMarketCapSnapshot(limit = DEFAULT_SNAPSHOT_LIMIT, opts?: { fresh?: boolean }): Promise<TopMarketCapSnapshot> {
    const skipCache = !!(opts && opts.fresh);
    const requested = validateLimit(limit);
    const freshKey = cacheKey("stockTopMarketCapFresh", {});
    const cached = await this.safeGet<TopMarketCapSnapshot>(freshKey);
    if (!skipCache && isCompleteSnapshot(cached, this.now(), FRESH_TTL_MS) && cached.rows.length >= requested) return sliceSnapshot(cached, requested);

    const lockKey = cacheKey("stockTopMarketCapLock", {});
    let acquired: boolean;
    try {
      acquired = await this.deps.cache.add(lockKey, this.now().toISOString(), LOCK_TTL_MS);
    } catch {
      acquired = false;
    }
    if (!acquired) return this.staleSnapshotOrThrow(requested);

    try {
      const snapshot = await this.buildSnapshot(Math.max(DEFAULT_SNAPSHOT_LIMIT, requested));
      if (!isCompleteSnapshot(snapshot, this.now(), FRESH_TTL_MS)) {
        throw new StockServiceUnavailableError("Invalid or partial canonical stock snapshot");
      }
      await this.persistRows(snapshot.rows);
      await this.safeSet(freshKey, snapshot, FRESH_TTL_MS);
      await this.safeSet(cacheKey("stockTopMarketCapLastGood", {}), snapshot, LAST_GOOD_TTL_MS);
      return sliceSnapshot(snapshot, requested);
    } catch (error) {
      const fallback = await this.safeGet<TopMarketCapSnapshot>(cacheKey("stockTopMarketCapLastGood", {}));
      if (isCompleteSnapshot(fallback, this.now(), LAST_GOOD_TTL_MS) && fallback.rows.length >= requested) {
        return sliceSnapshot(markSnapshotStale(fallback), requested);
      }
      if (error instanceof StockServiceUnavailableError) throw error;
      throw new StockServiceUnavailableError(error instanceof Error ? error.message : undefined);
    } finally {
      try { await this.deps.cache.delete(lockKey); } catch { /* lock expires */ }
    }
  }

  async getPricesForBitpandaSymbols(symbols: string[]): Promise<Record<string, ResolvedStockPrice>> {
    if (!Array.isArray(symbols) || symbols.length > 50) throw new RangeError("Stock symbols must contain at most 50 entries");
    const unique = [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
    if (unique.length === 0) return {};

    let snapshot: TopMarketCapSnapshot | undefined;
    try { snapshot = await this.getTopMarketCapSnapshot(); } catch { /* explicit symbols may live outside Top 300 */ }
    const rows = new Map(snapshot?.rows.map((row) => [row.canonicalTicker, row]));
    const freshByCanonical = new Map<string, ResolvedStockPrice>();
    for (const symbol of unique) {
      const canonical = getBitpandaSecurity(symbol).canonicalTicker;
      if (rows.has(canonical) || freshByCanonical.has(canonical)) continue;
      const fresh = await this.safeGet<ResolvedStockPrice>(cacheKey("stockPriceFresh", { ticker: canonical }));
      if (isResolvedPrice(fresh, this.now(), FRESH_TTL_MS)) freshByCanonical.set(canonical, fresh);
    }
    const missing = unique.filter((symbol) => {
      const canonical = getBitpandaSecurity(symbol).canonicalTicker;
      return !rows.has(canonical) && !freshByCanonical.has(canonical);
    });
    let quotes: StockNativeQuoteMap = {};
    let usdToEur = Number.NaN;
    let fx: StockFxQuoteMap = {};
    if (missing.length) {
      try {
        quotes = await this.fetchQuotesChunked(missing);
        const currencies = distinctFxCurrencies(Object.values(quotes).map((quote) => quote.currency));
        [usdToEur, fx] = await Promise.all([this.usdToEur(), currencies.length ? this.fetchFx(currencies) : Promise.resolve({})]);
      } catch {
        quotes = {};
        fx = {};
      }
    }
    const output: Record<string, ResolvedStockPrice> = {};

    for (const symbol of unique) {
      const mapping = getBitpandaSecurity(symbol);
      const row = rows.get(mapping.canonicalTicker);
      let resolved: ResolvedStockPrice;
      if (row) {
        resolved = pickResolved(row);
      } else if (freshByCanonical.has(mapping.canonicalTicker)) {
        resolved = pickResolved(freshByCanonical.get(mapping.canonicalTicker)!);
      } else {
        const quote = quotes[symbol];
        const lastGood = await this.readPrice(mapping.canonicalTicker, false);
        resolved = resolveStockPrice({
          quote,
          nativeToEur: rateFor(quote?.currency, usdToEur, fx),
          companiesMarketCapPriceEur: null,
          lastGood,
          now: this.now(),
        });
        if (resolved.priceEur !== null && !resolved.stale) {
          await this.safeSet(cacheKey("stockPriceFresh", { ticker: mapping.canonicalTicker }), resolved, FRESH_TTL_MS);
          await this.safeSet(cacheKey("stockPriceLastGood", { ticker: mapping.canonicalTicker }), resolved, LAST_GOOD_TTL_MS);
        }
      }
      const ratio = mapping.unitsPerReceipt ?? 1;
      output[symbol] = ratio === 1 ? { ...resolved, errors: [...resolved.errors] } : {
        ...resolved,
        priceEur: resolved.priceEur === null ? null : resolved.priceEur * ratio,
        appliedRatio: ratio,
        errors: [...resolved.errors],
      };
    }
    return output;
  }

  private async buildSnapshot(limit: number): Promise<TopMarketCapSnapshot> {
    const response = await this.fetchImpl(CMC_URL, {
      headers: { "User-Agent": "WCORE/1.0 canonical-stock-service" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new StockServiceUnavailableError(`CompaniesMarketCap HTTP ${response.status}`);
    const sourceRows = parseTopMarketCapCsv(await response.text(), limit);
    if (sourceRows.length < Math.min(DEFAULT_SNAPSHOT_LIMIT, limit)) {
      throw new StockServiceUnavailableError(`CompaniesMarketCap returned ${sourceRows.length} valid rows, expected at least ${Math.min(DEFAULT_SNAPSHOT_LIMIT, limit)}`);
    }

    const quotes = await this.fetchQuotesChunked(sourceRows.map((row) => row.sourceTicker));
    const currencies = distinctFxCurrencies(Object.values(quotes).map((quote) => quote.currency));
    const [usdToEur, fx] = await Promise.all([this.usdToEur(), currencies.length ? this.fetchFx(currencies) : Promise.resolve({})]);
    if (!Number.isFinite(usdToEur) || usdToEur <= 0) throw new StockServiceUnavailableError("Canonical USD/EUR rate is unavailable");
    const generatedAt = this.now().toISOString();
    const rows: StockSnapshotRow[] = [];

    for (const source of sourceRows) {
      const mapping = mapTopMarketCapTicker(source.sourceTicker);
      const quote = quotes[source.sourceTicker];
      const lastGood = await this.readPrice(mapping.canonicalTicker, true);
      const supplyMultiplier = mapping.supplyMultiplier ?? 1;
      const fallbackPriceEur = (source.priceUsd / supplyMultiplier) * usdToEur;
      const resolved = resolveStockPrice({
        quote,
        nativeToEur: rateFor(quote?.currency, usdToEur, fx),
        companiesMarketCapPriceEur: fallbackPriceEur,
        lastGood,
        now: generatedAt,
      });
      const row: StockSnapshotRow = {
        rank: source.rank,
        company: source.company,
        country: source.country,
        sourceTicker: source.sourceTicker,
        canonicalTicker: mapping.canonicalTicker,
        yahooTicker: quote?.yahooTicker ?? mapping.yahooTickers[0] ?? null,
        bitpandaAliases: [...mapping.bitpandaAliases],
        ...resolved,
        marketCapUsd: source.marketCapUsd,
        marketCapEur: source.marketCapUsd * usdToEur,
        supply: (source.marketCapUsd / source.priceUsd) * supplyMultiplier,
      };
      rows.push(row);
    }
    return makeSnapshot(rows, generatedAt, false);
  }

  private async persistRows(rows: StockSnapshotRow[]): Promise<void> {
    for (const row of rows) {
      if (row.priceEur === null || row.stale) continue;
      const resolved = pickResolved(row);
      await this.safeSet(cacheKey("stockPriceFresh", { ticker: row.canonicalTicker }), resolved, FRESH_TTL_MS);
      await this.safeSet(cacheKey("stockPriceLastGood", { ticker: row.canonicalTicker }), resolved, LAST_GOOD_TTL_MS);
    }
  }

  private async fetchQuotesChunked(symbols: string[]): Promise<StockNativeQuoteMap> {
    const output: StockNativeQuoteMap = {};
    for (let index = 0; index < symbols.length; index += STOCK_QUOTE_BATCH_SIZE) {
      Object.assign(output, await this.fetchQuotes(symbols.slice(index, index + STOCK_QUOTE_BATCH_SIZE)));
    }
    return output;
  }

  private async readPrice(ticker: string, includeFresh: boolean): Promise<ResolvedStockPrice | undefined> {
    if (includeFresh) {
      const fresh = await this.safeGet<ResolvedStockPrice>(cacheKey("stockPriceFresh", { ticker }));
      if (isResolvedPrice(fresh, this.now(), FRESH_TTL_MS)) return fresh;
    }
    const lastGood = await this.safeGet<ResolvedStockPrice>(cacheKey("stockPriceLastGood", { ticker }));
    return isResolvedPrice(lastGood, this.now(), LAST_GOOD_TTL_MS) ? lastGood : undefined;
  }

  private async staleSnapshotOrThrow(limit: number): Promise<TopMarketCapSnapshot> {
    const lastGood = await this.safeGet<TopMarketCapSnapshot>(cacheKey("stockTopMarketCapLastGood", {}));
    if (isCompleteSnapshot(lastGood, this.now(), LAST_GOOD_TTL_MS) && lastGood.rows.length >= limit) {
      return sliceSnapshot(markSnapshotStale(lastGood), limit);
    }
    throw new StockServiceUnavailableError("Canonical stock refresh is already in progress and no last-good snapshot exists");
  }

  private async safeGet<T>(key: string): Promise<T | undefined> {
    try { return await this.deps.cache.get<T>(key); } catch { return undefined; }
  }

  private async safeSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try { await this.deps.cache.set(key, value, ttlMs); } catch { /* healthy upstream data remains usable */ }
  }
}

function stockRelayUrl(): string {
  return process.env.STOCK_RELAY_URL || process.env.CEX_RELAY_URL || process.env.BYBIT_RELAY_URL
    || process.env.BINANCE_RELAY_URL || process.env.RAILWAY_SERVICE_CEX_RELAY_URL || "";
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SNAPSHOT_LIMIT) throw new RangeError("Stock snapshot limit must be an integer from 1 to 5000");
  return limit;
}

function distinctFxCurrencies(currencies: Array<string | undefined>): string[] {
  return [...new Set(currencies.map((currency) => currency === "GBX" ? "GBP" : currency?.toUpperCase())
    .filter((currency): currency is string => Boolean(currency && currency !== "USD" && currency !== "EUR")))];
}

function rateFor(currency: string | undefined, usdToEur: number, fx: StockFxQuoteMap): number | null {
  const normalized = currency === "GBp" ? "GBX" : currency?.toUpperCase();
  if (normalized === "EUR") return 1;
  if (normalized === "USD") return usdToEur;
  const fxCurrency = normalized === "GBX" ? "GBP" : normalized;
  const unitsPerEur = fxCurrency ? fx[fxCurrency]?.unitsPerEur : undefined;
  return typeof unitsPerEur === "number" && unitsPerEur > 0 ? 1 / unitsPerEur : null;
}

function pickResolved(row: ResolvedStockPrice): ResolvedStockPrice {
  return {
    priceNative: row.priceNative,
    currency: row.currency,
    priceEur: row.priceEur,
    priceSource: row.priceSource,
    fallbackSource: row.fallbackSource,
    appliedRatio: row.appliedRatio,
    stale: row.stale,
    updatedAt: row.updatedAt,
    errors: row.errors.map((error) => ({ ...error })),
  };
}

function makeSnapshot(rows: StockSnapshotRow[], generatedAt: string, stale: boolean): TopMarketCapSnapshot {
  return {
    ok: true,
    generatedAt,
    universeSource: "companiesmarketcap",
    rows,
    stats: {
      requested: rows.length,
      pricedFresh: rows.filter((row) => row.priceEur !== null && !row.stale).length,
      pricedStale: rows.filter((row) => row.priceEur !== null && row.stale).length,
      unpriced: rows.filter((row) => row.priceEur === null).length,
    },
    stale,
  };
}

function isCompleteSnapshot(value: unknown, now: Date, maxAgeMs: number): value is TopMarketCapSnapshot {
  if (!isRecord(value) || value.ok !== true || value.universeSource !== "companiesmarketcap" || value.stale !== false) return false;
  if (!isRecentIso(value.generatedAt, now, maxAgeMs) || !Array.isArray(value.rows) || value.rows.length < DEFAULT_SNAPSHOT_LIMIT || value.rows.length > MAX_SNAPSHOT_LIMIT) return false;
  if (!isRecord(value.stats) || value.stats.requested !== value.rows.length) return false;
  const snapshot = value as unknown as TopMarketCapSnapshot;
  const ranks = new Set<number>();
  const tickers = new Set<string>();
  let previousRank = 0;
  for (const [index, row] of snapshot.rows.entries()) {
    if (!isRecord(row)) return false;
    if (
      !Number.isInteger(row.rank) || row.rank <= previousRank || ranks.has(row.rank as number)
      || !isNonemptyString(row.company) || !isNonemptyString(row.country) || !isNonemptyString(row.sourceTicker)
      || !isNonemptyString(row.canonicalTicker) || tickers.has(row.canonicalTicker)
      || !(row.yahooTicker === null || isNonemptyString(row.yahooTicker))
      || !Array.isArray(row.bitpandaAliases) || !row.bitpandaAliases.every(isNonemptyString)
      || !Number.isFinite(row.marketCapUsd) || row.marketCapUsd <= 0
      || !Number.isFinite(row.marketCapEur) || row.marketCapEur <= 0
      || !Number.isFinite(row.supply) || row.supply <= 0
      || !isResolvedPrice(row, now, row.stale ? LAST_GOOD_TTL_MS : FRESH_TTL_MS)
    ) return false;
    ranks.add(row.rank as number);
    tickers.add(row.canonicalTicker);
    previousRank = row.rank as number;
  }
  if (ranks.size !== snapshot.rows.length) return false;
  return Number.isInteger(snapshot.stats.pricedFresh) && Number.isInteger(snapshot.stats.pricedStale) && Number.isInteger(snapshot.stats.unpriced)
    && snapshot.stats.pricedFresh === snapshot.rows.filter((row) => row.priceEur !== null && !row.stale).length
    && snapshot.stats.pricedStale === snapshot.rows.filter((row) => row.priceEur !== null && row.stale).length
    && snapshot.stats.unpriced === snapshot.rows.filter((row) => row.priceEur === null).length
    && snapshot.stats.pricedFresh + snapshot.stats.pricedStale + snapshot.stats.unpriced === snapshot.rows.length;
}

function isResolvedPrice(value: unknown, now: Date, maxAgeMs: number): value is ResolvedStockPrice {
  if (!isRecord(value)) return false;
  const resolved = value as unknown as ResolvedStockPrice;
  const nullablePositive = (candidate: unknown) => candidate === null
    || (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0);
  const nullableString = (candidate: unknown) => candidate === null || isNonemptyString(candidate);
  if (
    !nullablePositive(value.priceNative) || !nullableString(value.currency)
    || !nullablePositive(value.priceEur) || !nullableString(value.priceSource) || !nullableString(value.fallbackSource)
    || typeof value.appliedRatio !== "number" || !Number.isFinite(value.appliedRatio) || value.appliedRatio <= 0
    || typeof value.stale !== "boolean" || !isRecentIso(value.updatedAt, now, maxAgeMs)
    || !Array.isArray(value.errors)
    || !value.errors.every((error) => isRecord(error) && isNonemptyString(error.code) && isNonemptyString(error.message))
  ) return false;
  if (resolved.priceNative !== null && resolved.currency === null) return false;
  if (resolved.priceEur !== null && resolved.priceSource === null) return false;
  return resolved.priceEur !== null || resolved.errors.length > 0;
}

function isRecentIso(value: unknown, now: Date, maxAgeMs: number): value is string {
  if (typeof value !== "string" || !Number.isFinite(now.getTime())) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) return false;
  const age = now.getTime() - parsed.getTime();
  return age >= -CLOCK_TOLERANCE_MS && age <= maxAgeMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function markSnapshotStale(snapshot: TopMarketCapSnapshot): TopMarketCapSnapshot {
  const rows = snapshot.rows.map((row) => ({
    ...row,
    bitpandaAliases: [...row.bitpandaAliases],
    errors: row.errors.map((error) => ({ ...error })),
    stale: true,
  }));
  return makeSnapshot(rows, snapshot.generatedAt, true);
}

function sliceSnapshot(snapshot: TopMarketCapSnapshot, limit: number): TopMarketCapSnapshot {
  if (limit === 300) return structuredClone(snapshot);
  const rows = structuredClone(snapshot.rows.slice(0, limit));
  return makeSnapshot(rows, snapshot.generatedAt, snapshot.stale);
}
