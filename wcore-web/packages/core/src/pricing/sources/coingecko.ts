import type { CoinGeckoSource, PricingToken, SourcePriceLike } from "../types.js";
import { isPositiveFinite } from "../types.js";

export class CoinGeckoPriceSource implements CoinGeckoSource {
  private callCount = 0;
  private windowStart = Date.now();
  private readonly maxCallsPerWindow = 30;
  private readonly windowMs = 60_000;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.callCount = 0;
      this.windowStart = now;
    }
    if (this.callCount >= this.maxCallsPerWindow) return false;
    this.callCount++;
    return true;
  }

  async getNativePriceUsd(_token: PricingToken, geckoId?: string): Promise<SourcePriceLike> {
    return this.fetchId(geckoId);
  }

  async getTokenPriceUsd(_token: PricingToken, geckoId?: string): Promise<SourcePriceLike> {
    return this.fetchId(geckoId);
  }

  private async fetchId(geckoId?: string): Promise<SourcePriceLike> {
    if (!geckoId) return null;
    if (!this.checkRateLimit()) return null;
    const id = String(geckoId).toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const price = json[id]?.usd;
    return isPositiveFinite(price) ? { priceUsd: price, source: "coingecko" } : null;
  }
}
