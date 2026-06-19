const BITPANDA_YAHOO_SYMBOLS: Record<string, string[]> = {
  "AMD-US": ["AMD"],
  "JPM-US": ["JPM"],
  "LLYC-US": ["LLY"],
  "WMT-US": ["WMT"],
  BRKB: ["BRK-B"],
  "BRK.B": ["BRK-B"],
  "BRK-B": ["BRK-B"],
  FB: ["META"],
  MRKUS: ["MRK"],
  RDSA: ["SHEL"],
  TSFA: ["TSLA"],
  ADS: ["ADS.DE"],
  AIR: ["AIR.PA"],
  ALV: ["ALV.DE"],
  BAS: ["BAS.DE"],
  BAYN: ["BAYN.DE"],
  BMW: ["BMW.DE"],
  CBK: ["CBK.DE"],
  DBK: ["DBK.DE"],
  DTE: ["DTE.DE"],
  ENR: ["ENR.DE"],
  HEN3: ["HEN3.DE"],
  IFX: ["IFX.DE"],
  RHM: ["RHM.DE"],
  SAP: ["SAP.DE", "SAP"],
  SIE: ["SIE.DE"],
  VOW3: ["VOW3.DE"],
  ASML: ["ASML.AS", "ASML"],
  MC: ["MC.PA"],
  OR: ["OR.PA"],
  RMS: ["RMS.PA"],
  SAN: ["SAN.MC", "SAN"],
  TTE: ["TTE.PA", "TTE"],
  IBE: ["IBE.MC"],
  NESN: ["NESN.SW"],
  NOVN: ["NOVN.SW"],
  ROG: ["ROG.SW"],
  SHEL: ["SHEL.L", "SHEL"],
  EUNL: ["EUNL.DE"],
  IS3N: ["IS3N.DE"],
  QDVE: ["QDVE.DE"],
  SXR8: ["SXR8.DE"],
  VUSA: ["VUSA.DE", "VUSA.L"],
  VWCE: ["VWCE.DE"],
  VWRL: ["VWRL.AS", "VWRL.L"],
};

type YahooChartResponse = {
  chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }> };
};

type CachedStockPrice = { priceEur: number; source: string };

export interface StockPriceCache {
  get(key: string): Promise<CachedStockPrice | null>;
  set(key: string, value: CachedStockPrice, ttlMs?: number): Promise<void>;
}

export interface YahooStockPricingDeps {
  fetchImpl?: typeof fetch;
  getEurUsdRate: () => Promise<number>;
  cache?: StockPriceCache;
}

// Yahoo's chart API aggressively rate-limits (HTTP 429) when a sync fires dozens
// of requests at once. Keep the candidate list MINIMAL: a plain US ticker must
// resolve in a single call. Only symbols with curated mappings get extra tries.
const STOCK_PRICE_TTL_MS = 6 * 60 * 60 * 1000;

export function yahooStockSymbolCandidates(symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s) return [];
  const explicit = BITPANDA_YAHOO_SYMBOLS[s];
  if (explicit && explicit.length > 0) {
    // Curated mapping wins. Include the raw symbol as a cheap last resort, but
    // never the speculative EU suffix sweep.
    return [...new Set([...explicit, s])];
  }
  const withoutUsSuffix = s.endsWith("-US") ? s.slice(0, -3) : "";
  const normalized = s.includes(".") ? s.replace(/\./g, "-") : "";
  return [...new Set([s, withoutUsSuffix, normalized].filter(Boolean))];
}

export async function priceYahooStockSymbolEur(symbol: string, deps: YahooStockPricingDeps): Promise<{ priceEur: number | null; source: string | null }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cacheKey = `stockprice:${symbol.trim().toUpperCase()}`;
  if (deps.cache) {
    try {
      const cached = await deps.cache.get(cacheKey);
      if (cached && cached.priceEur > 0) return { priceEur: cached.priceEur, source: cached.source };
    } catch (e) {
      console.error("cex stock price cache read error:", (e as Error).message);
    }
  }
  for (const candidate of yahooStockSymbolCandidates(symbol)) {
    try {
      const res = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?range=1d&interval=1d`, {
        headers: { "User-Agent": "WCORE/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json() as YahooChartResponse;
      const meta = data.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (!price || price <= 0) continue;
      const currency = String(meta?.currency ?? "USD").toUpperCase();
      let result: { priceEur: number; source: string } | null = null;
      if (currency === "EUR") result = { priceEur: price, source: `yahoo:eur:${candidate}` };
      else if (currency === "USD") {
        const eurUsd = await deps.getEurUsdRate();
        result = { priceEur: price / eurUsd, source: `yahoo:usd:${candidate}` };
      }
      if (result) {
        if (deps.cache) {
          try { await deps.cache.set(cacheKey, result, STOCK_PRICE_TTL_MS); } catch (e) { console.error("cex stock price cache write error:", (e as Error).message); }
        }
        return result;
      }
    } catch (e) {
      console.error("cex stock price yahoo error:", (e as Error).message);
    }
  }
  return { priceEur: null, source: null };
}
