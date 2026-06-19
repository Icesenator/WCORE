import type { CacheStore } from "../../cache/types.js";
import type { PricingToken, RealTSource, SourcePriceLike } from "../types.js";
import { isPositiveFinite } from "../types.js";

const REGISTRY_REDIS_KEY = "realt:registry:v2";
const REGISTRY_TTL_MS = 6 * 60 * 60 * 1000;
// Defense-in-depth: hard Redis expiry so a polluted/stale registry cannot
// persist forever. Logical staleness (6h) + stale-serve fallback still apply;
// this only caps how long a never-refreshed snapshot can survive.
const REGISTRY_REDIS_SAFETY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRODUCT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const SUPPORTED_CHAINS = new Set(["GNOSIS", "ETHEREUM"]);

interface RealTEntry {
  priceUsd: number;
  currency: string;
  symbol: string;
}

interface RealTRegistryCache {
  ts: number;
  entries: Array<[string, RealTEntry]>;
}

interface RealTApiRow {
  uuid?: string;
  xDaiContract?: string | null;
  gnosisContract?: string | null;
  ethereumContract?: string | null;
  symbol?: string;
  tokenPrice?: number;
  currency?: string;
}

interface RealTWooProduct {
  id?: number;
  name?: string;
  prices?: {
    price?: string;
    currency_code?: string;
    currency_minor_unit?: number;
  };
}

interface RealTWooCacheEntry {
  priceUsd: number;
  symbol: string;
  name: string;
  productId?: number;
}

export class RealTPriceSource implements RealTSource {
  private registry: Map<string, RealTEntry> | null = null;
  private registryLoadedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(private readonly store?: CacheStore, private readonly fetchImpl: typeof fetch = fetch) {}

  private async ensureRegistry(): Promise<void> {
    if (this.registry && Date.now() - this.registryLoadedAt < REGISTRY_TTL_MS) return;
    if (this.inflight) return this.inflight;
    this.inflight = this.loadRegistry().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async loadRegistry(): Promise<void> {
    let hasStaleCache = false;
    if (this.store) {
      try {
        const cached = await this.store.get<RealTRegistryCache>(REGISTRY_REDIS_KEY);
        if (cached?.entries?.length) {
          this.registry = new Map(cached.entries);
          this.registryLoadedAt = cached.ts;
          if (Date.now() - cached.ts < REGISTRY_TTL_MS) {
            return;
          }
          hasStaleCache = true;
        }
      } catch { /* ignore */ }
    }
    try {
      const res = await this.fetchImpl("https://api.realtoken.community/v1/token", {
        headers: { accept: "application/json", "User-Agent": "WCORE/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        if (hasStaleCache || this.registry) this.registryLoadedAt = Date.now();
        return;
      }
      const rows = (await res.json()) as RealTApiRow[];
      const map = new Map<string, RealTEntry>();
      for (const r of rows) {
        const price = Number(r?.tokenPrice);
        if (!isPositiveFinite(price)) continue;
        const entry: RealTEntry = { priceUsd: price, currency: r.currency ?? "USD", symbol: r.symbol ?? "" };
        for (const c of [r.uuid, r.xDaiContract, r.gnosisContract, r.ethereumContract]) {
          if (typeof c === "string" && /^0x[0-9a-fA-F]{40}$/.test(c)) map.set(c.toLowerCase(), entry);
        }
      }
      if (map.size === 0) {
        if (hasStaleCache || this.registry) this.registryLoadedAt = Date.now();
        return;
      }
      this.registry = map;
      this.registryLoadedAt = Date.now();
      if (this.store) {
        try { await this.store.set(REGISTRY_REDIS_KEY, { ts: this.registryLoadedAt, entries: [...map.entries()] }, REGISTRY_REDIS_SAFETY_TTL_MS); } catch { /* ignore */ }
      }
    } catch {
      // Always set a cooldown after a failed fetch, even without stale cache,
      // to prevent hammering the API on every scan.
      this.registryLoadedAt = Date.now();
    }
  }

  async isKnownRealTContract(token: PricingToken): Promise<boolean> {
    const chainKey = String(token.chain.key ?? "").toUpperCase();
    if (!SUPPORTED_CHAINS.has(chainKey)) return false;
    const contract = (token.contract ?? "").toLowerCase();
    if (!contract) return false;
    await this.ensureRegistry();
    if (this.registry?.has(contract)) return true;
    // Fallback: recognize RealT tokens by symbol pattern when registry is unavailable
    const symbol = String(token.symbol ?? "");
    if (symbol.startsWith("REALTOKEN-")) return true;
    return false;
  }

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    const chainKey = String(token.chain.key ?? "").toUpperCase();
    if (!SUPPORTED_CHAINS.has(chainKey)) return null;
    const contract = (token.contract ?? "").toLowerCase();
    if (!contract || !/^0x[0-9a-f]{40}$/.test(contract)) return null;

    await this.ensureRegistry();

    // If registry is loaded, look up the contract
    const entry = this.registry?.get(contract);
    if (entry) {
      if (entry.currency !== "USD") return null;
      return { priceUsd: entry.priceUsd, source: "realt", symbol: entry.symbol || undefined, name: undefined };
    }

    // Fallback: recognize RealT tokens by symbol pattern and try a direct API fetch.
    // Gated on cooldown to avoid double-fetching every REALTOKEN- token after
    // ensureRegistry() has already attempted (and either succeeded or set a cooldown).
    // Without this gate, a vague of N REALTOKEN- tokens fires N + 1 fetches per scan.
    const symbol = String(token.symbol ?? "");
    const withinCooldown = this.registryLoadedAt > 0 && (Date.now() - this.registryLoadedAt) < REGISTRY_TTL_MS;
    if (symbol.startsWith("REALTOKEN-") && !withinCooldown) {
      // Try one more direct fetch in case the registry wasn't loaded
      try {
        const res = await this.fetchImpl("https://api.realtoken.community/v1/token", {
          headers: { accept: "application/json", "User-Agent": "WCORE/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.ok) {
          const rows = (await res.json()) as RealTApiRow[];
          for (const r of rows) {
            const price = Number(r?.tokenPrice);
            if (!isPositiveFinite(price)) continue;
            const contracts = [r.uuid, r.xDaiContract, r.gnosisContract, r.ethereumContract];
            if (contracts.some(c => typeof c === "string" && c.toLowerCase() === contract)) {
              return { priceUsd: price, source: "realt", symbol: r.symbol || undefined, name: undefined };
            }
          }
        }
      } catch { /* API unavailable */ }
    }

    if (symbol.startsWith("REALTOKEN-")) {
      const woo = await this.getWooCommercePrice(token, contract, symbol);
      if (woo) return woo;
    }

    return null;
  }

  private async getWooCommercePrice(token: PricingToken, contract: string, symbol: string): Promise<SourcePriceLike> {
    const cacheKey = `realt:woo:${contract}`;
    if (this.store) {
      try {
        const cached = await this.store.get<RealTWooCacheEntry>(cacheKey);
        if (cached && isPositiveFinite(cached.priceUsd)) {
          return { priceUsd: cached.priceUsd, source: "realt", symbol: cached.symbol, name: cached.name };
        }
      } catch { /* cache miss */ }
    }

    const requirements = buildWooMatchRequirements(token);
    if (requirements.required.length === 0 || !requirements.search) return null;

    let rows: RealTWooProduct[];
    try {
      const url = `https://realt.co/wp-json/wc/store/v1/products?search=${encodeURIComponent(requirements.search)}`;
      const res = await this.fetchImpl(url, {
        headers: { accept: "application/json", "User-Agent": "WCORE/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      rows = (await res.json()) as RealTWooProduct[];
    } catch {
      return null;
    }

    const matches = rows.filter((row) => isWooProductMatch(row, requirements.required));
    if (matches.length !== 1) return null;

    const product = matches[0]!;
    const priceUsd = parseWooUsdPrice(product);
    if (!isPositiveFinite(priceUsd)) return null;

    const entry: RealTWooCacheEntry = {
      priceUsd,
      symbol,
      name: product.name ?? symbol,
      productId: product.id,
    };
    if (this.store) {
      try { await this.store.set(cacheKey, entry, PRODUCT_CACHE_TTL_MS); } catch { /* ignore */ }
    }
    return { priceUsd, source: "realt", symbol, name: entry.name };
  }
}

function buildWooMatchRequirements(token: PricingToken): { search: string; required: string[] } {
  const raw = String(token.name || token.symbol || "");
  const tokens = normalizeWords(raw).filter((word) => !REAL_TOKEN_STOP_WORDS.has(word));
  const required = Array.from(new Set(tokens));
  const search = required.find((word) => /\d/.test(word) || word.length >= 5) ?? required[0] ?? "";
  return { search: search.toUpperCase(), required };
}

const REAL_TOKEN_STOP_WORDS = new Set([
  "realtoken",
  "real",
  "token",
  "loan",
  "s",
  "sl",
  "pa",
  "se",
  "sel",
  "ph",
]);

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isWooProductMatch(product: RealTWooProduct, required: string[]): boolean {
  const productWords = new Set(normalizeWords(product.name ?? ""));
  return required.every((word) => productWords.has(word));
}

function parseWooUsdPrice(product: RealTWooProduct): number | null {
  if (product.prices?.currency_code !== "USD") return null;
  const rawPrice = Number(product.prices?.price);
  const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
  if (!isPositiveFinite(rawPrice) || !Number.isFinite(minorUnit) || minorUnit < 0) return null;
  return rawPrice / 10 ** minorUnit;
}
