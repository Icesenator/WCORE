import type { PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite } from "../types.js";

export class JupiterPriceSource implements TokenPriceSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    if (token.chain.vm !== "SVM") return null;
    const mint = String(token.contract ?? token.key).trim();
    if (!mint || mint.length < 32 || mint.length > 44) return null;
    // v2 was retired and now answers 404. Because a failed response is swallowed
    // as "no price", the whole source went silently dead for every SVM token
    // instead of failing loudly. v3 returns a flat map keyed by mint and exposes
    // `usdPrice`; `lite-api` is the host published for use without an API key.
    const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json", "User-Agent": "WCORE-Web/0.1" } });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { usdPrice?: number } | null> | null;
    const price = Number(json?.[mint]?.usdPrice);
    if (!isPositiveFinite(price)) return null;
    return { priceUsd: price, source: "jupiter" };
  }
}
