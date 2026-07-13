import type { CacheStore } from "@wcore/core";
import { cacheKey } from "@wcore/shared";

const CMC_LISTINGS_URL = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest";
const DEFAULT_SNAPSHOT_LIMIT = 5_000;
const MAX_SNAPSHOT_LIMIT = 5_000;
const MIN_VALID_ROWS = 1_000;
const FRESH_TTL_MS = 6 * 60 * 60 * 1000;
const LAST_GOOD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;
const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;

export interface CryptoListingRow {
  rank: number;
  symbol: string;
  name: string;
  priceEur: number;
  marketCapEur: number;
}

export interface CryptoListingSnapshot {
  ok: true;
  generatedAt: string;
  universeSource: "coinmarketcap";
  rows: CryptoListingRow[];
  stats: { requested: number };
  stale: boolean;
}

export interface CanonicalCryptoServiceDeps {
  cache: CacheStore;
  fetchImpl?: typeof fetch;
  apiKeys?: string[];
  now?: () => Date;
}

export class CryptoServiceUnavailableError extends Error {
  constructor(message = "Canonical crypto listing snapshot is unavailable") {
    super(message);
    this.name = "CryptoServiceUnavailableError";
  }
}

export class CanonicalCryptoService {
  private readonly fetchImpl: typeof fetch;
  private readonly apiKeys: () => string[];
  private readonly now: () => Date;

  constructor(private readonly deps: CanonicalCryptoServiceDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.apiKeys = deps.apiKeys
      ? () => deps.apiKeys!.filter(Boolean)
      : () => [process.env.CMC_API_KEY ?? "", process.env.CMC_API_KEY_FALLBACK ?? ""].filter(Boolean);
    this.now = deps.now ?? (() => new Date());
  }

  async getListingSnapshot(limit = DEFAULT_SNAPSHOT_LIMIT): Promise<CryptoListingSnapshot> {
    const requested = validateLimit(limit);
    const freshKey = cacheKey("cryptoTopMarketCapFresh", {});
    const cached = await this.safeGet<CryptoListingSnapshot>(freshKey);
    if (isUsableSnapshotForRequest(cached, this.now(), FRESH_TTL_MS, requested)) {
      return sliceSnapshot(cached, requested);
    }

    const lockKey = cacheKey("cryptoTopMarketCapLock", {});
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
        throw new CryptoServiceUnavailableError("Invalid or partial canonical crypto listing snapshot");
      }
      await this.safeSet(freshKey, snapshot, FRESH_TTL_MS);
      await this.safeSet(cacheKey("cryptoTopMarketCapLastGood", {}), snapshot, LAST_GOOD_TTL_MS);
      return sliceSnapshot(snapshot, requested);
    } catch (error) {
      const fallback = await this.safeGet<CryptoListingSnapshot>(cacheKey("cryptoTopMarketCapLastGood", {}));
      if (isUsableSnapshotForRequest(fallback, this.now(), LAST_GOOD_TTL_MS, requested)) {
        return sliceSnapshot(markSnapshotStale(fallback), requested);
      }
      // Last-good is absent but we may still have a complete fresh snapshot from a prior run.
      const freshFallback = await this.safeGet<CryptoListingSnapshot>(cacheKey("cryptoTopMarketCapFresh", {}));
      if (isUsableSnapshotForRequest(freshFallback, this.now(), LAST_GOOD_TTL_MS, requested)) {
        return sliceSnapshot(markSnapshotStale(freshFallback), requested);
      }
      if (error instanceof CryptoServiceUnavailableError) throw error;
      throw new CryptoServiceUnavailableError(error instanceof Error ? error.message : undefined);
    } finally {
      try { await this.deps.cache.delete(lockKey); } catch { /* lock expires */ }
    }
  }

  private async buildSnapshot(limit: number): Promise<CryptoListingSnapshot> {
    const keys = this.apiKeys();
    if (keys.length === 0) throw new CryptoServiceUnavailableError("CMC_API_KEY is not configured");

    let lastError: string = "no CMC API key succeeded";
    for (const key of keys) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${CMC_LISTINGS_URL}?start=1&limit=${limit}&convert=EUR`, {
          headers: {
            "X-CMC_PRO_API_KEY": key,
            "Accept": "application/json",
            "User-Agent": "WCORE/1.0 canonical-crypto-service",
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        continue;
      }
      if (!response.ok) {
        lastError = `CoinMarketCap HTTP ${response.status}`;
        // Rotate to the fallback key on auth/quota/server errors; anything else is fatal too,
        // so trying the next key is harmless.
        continue;
      }
      const payload = await response.json().catch(() => null) as CmcListingsPayload | null;
      const rows = parseCmcListings(payload);
      if (rows.length < limit) {
        lastError = `CoinMarketCap returned ${rows.length} valid rows, expected ${limit}`;
        continue;
      }
      if (!hasContiguousRanks(rows.slice(0, limit))) {
        lastError = `CoinMarketCap returned ${rows.length} valid rows, expected ${limit} contiguous ranks`;
        continue;
      }
      return makeSnapshot(rows.slice(0, limit), this.now().toISOString(), false);
    }
    throw new CryptoServiceUnavailableError(lastError);
  }

  private async staleSnapshotOrThrow(limit: number): Promise<CryptoListingSnapshot> {
    const lastGood = await this.safeGet<CryptoListingSnapshot>(cacheKey("cryptoTopMarketCapLastGood", {}));
    if (isUsableSnapshotForRequest(lastGood, this.now(), LAST_GOOD_TTL_MS, limit)) {
      return sliceSnapshot(markSnapshotStale(lastGood), limit);
    }
    // If we hold the lock but are about to throw, prefer returning a fresh cached snapshot
    // even if it is technically older than FRESH_TTL_MS, as long as it is still complete.
    const fresh = await this.safeGet<CryptoListingSnapshot>(cacheKey("cryptoTopMarketCapFresh", {}));
    if (isUsableSnapshotForRequest(fresh, this.now(), LAST_GOOD_TTL_MS, limit)) {
      return sliceSnapshot(markSnapshotStale(fresh), limit);
    }
    throw new CryptoServiceUnavailableError("Canonical crypto refresh is already in progress and no last-good snapshot exists");
  }

  private async safeGet<T>(key: string): Promise<T | undefined> {
    try { return await this.deps.cache.get<T>(key); } catch { return undefined; }
  }

  private async safeSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try { await this.deps.cache.set(key, value, ttlMs); } catch { /* healthy upstream data remains usable */ }
  }
}

interface CmcListingsPayload {
  data?: Array<{
    cmc_rank?: unknown;
    symbol?: unknown;
    name?: unknown;
    quote?: { EUR?: { price?: unknown; market_cap?: unknown } };
  }>;
}

function parseCmcListings(payload: CmcListingsPayload | null): CryptoListingRow[] {
  if (!payload || !Array.isArray(payload.data)) return [];
  const rows: CryptoListingRow[] = [];
  const ranks = new Set<number>();
  for (const entry of payload.data) {
    if (!entry || typeof entry !== "object") continue;
    const rank = entry.cmc_rank;
    const symbol = typeof entry.symbol === "string" ? entry.symbol.trim().toUpperCase() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const quote = entry.quote?.EUR;
    const priceEur = typeof quote?.price === "number" ? quote.price : Number.NaN;
    const marketCapEur = typeof quote?.market_cap === "number" && Number.isFinite(quote.market_cap) && quote.market_cap > 0
      ? quote.market_cap
      : 0;
    if (
      !Number.isInteger(rank) || (rank as number) <= 0 || ranks.has(rank as number)
      || symbol.length === 0 || name.length === 0
      || !Number.isFinite(priceEur) || priceEur <= 0
      || !Number.isFinite(marketCapEur) || marketCapEur < 0
    ) continue;
    ranks.add(rank as number);
    rows.push({ rank: rank as number, symbol, name, priceEur, marketCapEur });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SNAPSHOT_LIMIT) {
    throw new RangeError("Crypto listing snapshot limit must be an integer from 1 to 5000");
  }
  return limit;
}

function makeSnapshot(rows: CryptoListingRow[], generatedAt: string, stale: boolean): CryptoListingSnapshot {
  return {
    ok: true,
    generatedAt,
    universeSource: "coinmarketcap",
    rows,
    stats: { requested: rows.length },
    stale,
  };
}

function isCompleteSnapshot(value: unknown, now: Date, maxAgeMs: number): value is CryptoListingSnapshot {
  if (!isRecord(value) || value.ok !== true || value.universeSource !== "coinmarketcap" || typeof value.stale !== "boolean") return false;
  if (!isRecentIso(value.generatedAt, now, maxAgeMs) || !Array.isArray(value.rows)) return false;
  if (value.rows.length < MIN_VALID_ROWS || value.rows.length > MAX_SNAPSHOT_LIMIT) return false;
  if (!isRecord(value.stats) || value.stats.requested !== value.rows.length) return false;
  for (let i = 0; i < value.rows.length; i++) {
    const row = value.rows[i];
    if (!isRecord(row)) return false;
    if (
      row.rank !== i + 1
      || !isNonemptyString(row.symbol) || !isNonemptyString(row.name)
      || typeof row.priceEur !== "number" || !Number.isFinite(row.priceEur) || row.priceEur <= 0
      || typeof row.marketCapEur !== "number" || !Number.isFinite(row.marketCapEur) || row.marketCapEur < 0
    ) return false;
  }
  return true;
}

function hasContiguousRanks(rows: CryptoListingRow[]): boolean {
  return rows.every((row, index) => row.rank === index + 1);
}

function isUsableSnapshotForRequest(value: unknown, now: Date, maxAgeMs: number, requested: number): value is CryptoListingSnapshot {
  return isCompleteSnapshot(value, now, maxAgeMs) && value.rows.length >= requested;
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

function markSnapshotStale(snapshot: CryptoListingSnapshot): CryptoListingSnapshot {
  return makeSnapshot(snapshot.rows.map((row) => ({ ...row })), snapshot.generatedAt, true);
}

function sliceSnapshot(snapshot: CryptoListingSnapshot, limit: number): CryptoListingSnapshot {
  const rows = structuredClone(snapshot.rows.slice(0, limit));
  return makeSnapshot(rows, snapshot.generatedAt, snapshot.stale);
}
