// Stock prices are fetched through the cex-relay (Railway IP). Yahoo Finance
// refuses connections from the WCORE API datacenter IP (`fetch failed`), exactly
// like Binance HTTP 451. The relay reaches Yahoo, prices Bitpanda stock/ETF
// symbols, converts to EUR, and returns a {SYMBOL:{priceEur,source}} map.

export type StockPriceMap = Record<string, { priceEur: number; source: string }>;

export interface StockRelayDeps {
  fetchImpl?: typeof fetch;
  relayUrl: string;
  relayToken: string;
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
