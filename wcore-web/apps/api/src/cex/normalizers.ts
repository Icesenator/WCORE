export type CexProvider = "binance" | "bitpanda" | "bitfinex" | "bybit" | "coinbase" | "okx" | "kraken";

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
      // Bitpanda "Cash Plus" positions (BCPEUR, BCPUSD, ...) are fiat cash held in the
      // securities account. Classify them as fiat so they line up with the GSheet fiat bucket.
      const effectiveBucket = /^BCP(EUR|USD|CHF|GBP)$/.test(symbol) ? "fiat" : bucket;
      const quote = buckets.prices?.[symbol];
      pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: effectiveBucket, source: `bitpanda-${bucket}`, quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
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

const OKX_SYMBOL_ALIASES: Record<string, string> = {
  OKSOL: "SOL",
};

export function okxCanonicalSymbol(symbol: unknown): string {
  const s = canonicalCexSymbol(symbol);
  if (!s) return "";
  return OKX_SYMBOL_ALIASES[s] ?? s;
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
    const symbol = okxCanonicalSymbol(item[0]);
    if (!symbol) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "okx-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}

export interface KrakenBuckets {
  spot?: unknown[];
  prices?: Record<string, { priceEur?: number; source?: string }>;
}

const KRAKEN_SYMBOL_ALIASES: Record<string, string> = {
  XXBT: "BTC", XETH: "ETH", XETC: "ETC", XLTC: "LTC",
  XXRP: "XRP", XXDG: "DOGE", XXLM: "XLM", XZEC: "ZEC",
  ATOM: "ATOM", DOT: "DOT", ADA: "ADA", SOL: "SOL",
  XTZ: "XTZ", AVAX: "AVAX", LINK: "LINK", MATIC: "POL",
  ALGO: "ALGO", UNI: "UNI", AAVE: "AAVE", SNX: "SNX",
  COMP: "COMP", CRV: "CRV", GRT: "GRT", ETC: "ETC",
  LTC: "LTC", BCH: "BCH", BSV: "BSV", EOS: "EOS",
  TRX: "TRX", FIL: "FIL", KSM: "KSM", FLOW: "FLOW",
  KAVA: "KAVA", KUSAMA: "KSM", NEAR: "NEAR", APT: "APT",
  ARB: "ARB", OP: "OP", SUI: "SUI", PEPE: "PEPE",
  SHIB: "SHIB", INJ: "INJ", TIA: "TIA", SEI: "SEI",
  EGLD: "EGLD", MINA: "MINA", ICP: "ICP", STX: "STX",
  IMX: "IMX", RNDR: "RNDR", WLD: "WLD", STRK: "STRK",
  JUP: "JUP", WIF: "WIF", BONK: "BONK", PYTH: "PYTH",
  JTO: "JTO", HNT: "HNT", CORE: "CORE", OM: "OM",
  NTRN: "NTRN", AKT: "AKT", OSMO: "OSMO", DYDX: "POOL",
  XMR: "XMR", ZRX: "ZRX", OXT: "OXT", STORJ: "STORJ",
  REN: "REN", NMR: "NMR", LPT: "LPT", UMA: "UMA",
  BAL: "BAL", YFI: "YFI", BNT: "BNT", RPL: "RPL",
  ENS: "ENS", BLUR: "BLUR", FXS: "FXS", LDO: "LDO",
};

export function krakenCanonicalSymbol(symbol: unknown): string {
  let s = String(symbol ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.length === 4 && (s.startsWith("Z") || s.startsWith("X")) && s[1] !== s[0]) {
    const core = s.slice(1);
    if (KRAKEN_SYMBOL_ALIASES[core]) return KRAKEN_SYMBOL_ALIASES[core];
    // Z-prefixed fiat codes (ZUSD, ZEUR, ZGBP...) map to the plain fiat ticker.
    if (s.startsWith("Z") && ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF"].includes(core)) return core;
  }
  s = KRAKEN_SYMBOL_ALIASES[s] ?? s;
  return s;
}

export function normalizeKrakenBuckets(buckets: KrakenBuckets): RawCexRow[] {
  const rows: RawCexRow[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(buckets.spot) ? buckets.spot : [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const rawSymbol = String(item[0] ?? "");
    const symbol = krakenCanonicalSymbol(rawSymbol);
    if (!symbol) continue;
    // Skip pure fiat currencies (Kraken prefixes: ZUSD, ZEUR, ZGBP, etc.)
    if (/^(ZEUR|ZUSD|ZGBP|ZCAD|ZAUD|ZJPY|CHF)$/.test(rawSymbol)) continue;
    const quote = buckets.prices?.[symbol];
    pushAggregated(rows, seen, { symbol, balance: parseCexAmount(item[1]), bucket: "spot", source: "kraken-spot", quoteEur: quote?.priceEur ?? null, quoteSource: quote?.source ?? null });
  }
  return rows;
}
