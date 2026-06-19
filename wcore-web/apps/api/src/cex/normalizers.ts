export type CexProvider = "binance" | "bitpanda" | "bitfinex" | "bybit" | "coinbase" | "okx";

export interface RawCexRow {
  symbol: string;
  balance: number;
  bucket: string;
  source: string;
  quoteEur?: number | null;
  quoteSource?: string | null;
}

export interface RelayBuckets {
  spot?: unknown[];
  "earn-flexible"?: unknown[];
  "earn-locked"?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function parseCexAmount(value: unknown): number {
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function canonicalCexSymbol(symbol: unknown): string {
  return String(symbol ?? "").trim().toUpperCase();
}

function pushAggregated(rows: RawCexRow[], seen: Map<string, number>, row: RawCexRow): void {
  const symbol = canonicalCexSymbol(row.symbol);
  const balance = parseCexAmount(row.balance);
  if (!symbol || balance <= 0) return;
  const key = `${row.bucket}:${symbol}`;
  const existing = seen.get(key);
  if (existing != null) {
    rows[existing]!.balance += balance;
    return;
  }
  seen.set(key, rows.length);
  rows.push({ ...row, symbol, balance });
}

export function normalizeBinanceBuckets(buckets: RelayBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const bucketNames = ["spot", "earn-flexible", "earn-locked"] as const;
  for (const bucket of bucketNames) {
    const list = Array.isArray(buckets[bucket]) ? buckets[bucket] : [];
    for (const item of list) {
      if (!Array.isArray(item)) continue;
      const symbol = canonicalCexSymbol(item[0]);
      // Binance LD* wrapper assets duplicate lending/Earn exposure.
      if (/^LD[A-Z0-9]{2,}$/.test(symbol)) continue;
      const quote = buckets.prices?.[symbol];
      pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket, source: bucket, quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
    }
  }
  return rows;
}

export interface BitpandaBuckets {
  crypto?: Array<[unknown, unknown]>;
  fiat?: Array<[unknown, unknown]>;
  commodity?: Array<[unknown, unknown]>;
  stocks?: Array<[unknown, unknown]>;
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function normalizeBitpandaBuckets(buckets: BitpandaBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  for (const bucket of ["crypto", "fiat", "commodity", "stocks"] as const) {
    const list = buckets[bucket] ?? [];
    for (const item of list) {
      if (!Array.isArray(item)) continue;
      const symbol = canonicalCexSymbol(item[0]);
      const quote = buckets.prices?.[symbol];
      pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket, source: `bitpanda-${bucket}`, quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
    }
  }
  return rows;
}

// Bitfinex uses short/historical currency codes. Normalize them to the canonical
// tickers expected by the rest of the pricing pipeline (mirrors 37_BITFINEX_SYNC.gs).
const BITFINEX_SYMBOL_ALIASES: Record<string, string> = {
  UST: "USDT", ATO: "ATOM", DOG: "DOGE", DAT: "DATA", QSH: "QASH", QTM: "QTUM",
  IOT: "IOTA", MIOTA: "IOTA", BTCF0: "BTC", ETHF0: "ETH",
};

// Consolidate stablecoins/fiat (applied after the alias step):
//   any USD-side stable -> USDT, any EUR-side stable -> EURC.
const BITFINEX_STABLE_MAP: Record<string, string> = {
  USD: "USDT", USDT: "USDT", UST: "USDT", USDC: "USDT", UDC: "USDT", TUSD: "USDT", USTF0: "USDT",
  EUR: "EURC", EURC: "EURC", EURT: "EURC", EUT: "EURC", EURS: "EURC", EUS: "EURC", EURI: "EURC", EUTF0: "EURC",
};

export function bitfinexCanonicalSymbol(symbol: unknown): string {
  let s = canonicalCexSymbol(symbol);
  if (!s) return "";
  s = BITFINEX_SYMBOL_ALIASES[s] ?? s;
  s = BITFINEX_STABLE_MAP[s] ?? s;
  return s;
}

// Bitfinex /v2/auth/r/wallets response:
//   [ [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...], ... ]
// Only the "exchange" (spot) wallet is synced, mirroring the Apps Script module.
export interface BitfinexBuckets {
  spot?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function normalizeBitfinexBuckets(buckets: BitfinexBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(buckets.spot) ? buckets.spot : [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const symbol = bitfinexCanonicalSymbol(item[0]);
    if (!symbol) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "bitfinex-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}

export interface BybitBuckets {
  spot?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function normalizeBybitBuckets(buckets: BybitBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(buckets.spot) ? buckets.spot : [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const symbol = canonicalCexSymbol(item[0]);
    if (!symbol) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "bybit-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}

export interface CoinbaseBuckets {
  spot?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function normalizeCoinbaseBuckets(buckets: CoinbaseBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(buckets.spot) ? buckets.spot : [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const symbol = canonicalCexSymbol(item[0]);
    if (!symbol) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "coinbase-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}

export interface OkxBuckets {
  spot?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

export function normalizeOkxBuckets(buckets: OkxBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(buckets.spot) ? buckets.spot : [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const symbol = canonicalCexSymbol(item[0]);
    if (!symbol) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "okx-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}
