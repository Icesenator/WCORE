import type { PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite } from "../types.js";

export class JupiterPriceSource implements TokenPriceSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    if (token.chain.vm !== "SVM") return null;
    const mint = String(token.contract ?? token.key).trim();
    if (!mint || mint.length < 32 || mint.length > 44) return null;
    const url = `https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json", "User-Agent": "WCORE-Web/0.1" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, { price?: string | number; mintSymbol?: string }> };
    const rec = json.data?.[mint];
    const price = Number(rec?.price);
    if (!isPositiveFinite(price)) return null;
    return { priceUsd: price, source: "jupiter", symbol: rec?.mintSymbol };
  }
}
