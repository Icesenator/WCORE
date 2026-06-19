import type { DefiLlamaSource, PricingToken, SourcePriceLike } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";

export class DefiLlamaPriceSource implements DefiLlamaSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getNativePriceUsd(_token: PricingToken, llamaId?: string): Promise<SourcePriceLike> {
    return this.fetchLlamaId(llamaId, "llama-native");
  }

  async getTokenPriceUsd(token: PricingToken, llamaId?: string): Promise<SourcePriceLike> {
    if (llamaId) return this.fetchLlamaId(llamaId, "llama-map");
    const slug = token.chain.CHAIN?.LLAMA_CHAIN_SLUG ?? token.chain.CHAIN?.DEX_SLUG;
    const contract = normalizePriceKey(token.contract ?? token.key);
    if (!slug || !/^0x[0-9a-f]{40}$/.test(contract)) return null;
    const key = `${String(slug).toLowerCase()}:${contract}`;
    const price = await this.fetchCoinsKey(key);
    return price == null ? null : { priceUsd: price, source: "llama-coins" };
  }

  private async fetchLlamaId(llamaId?: string, source = "llama-map"): Promise<SourcePriceLike> {
    if (!llamaId) return null;
    const price = await this.fetchCoinsKey(String(llamaId));
    return price == null ? null : { priceUsd: price, source };
  }

  private async fetchCoinsKey(key: string): Promise<number | null> {
    const url = `https://coins.llama.fi/prices/current/${encodeURIComponent(key)}`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { coins?: Record<string, { price?: number; confidence?: number }> };
    const rec = json.coins?.[key];
    if (!rec || !isPositiveFinite(rec.price)) return null;
    if (rec.confidence != null && rec.confidence < 0.6) return null;
    return rec.price;
  }

  async batchTokenPrices(chainSlug: string, contracts: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const slug = String(chainSlug || "").toLowerCase();
    if (!slug) return out;
    const keys: string[] = [];
    const keyToContract = new Map<string, string>();
    for (const c of contracts) {
      const lower = normalizePriceKey(c);
      if (!/^0x[0-9a-f]{40}$/.test(lower)) continue;
      const k = `${slug}:${lower}`;
      keys.push(k);
      keyToContract.set(k, lower);
    }
    if (keys.length === 0) return out;
    // DefiLlama accepts up to ~100 keys per request comfortably. Chunk to be safe.
    const CHUNK = 80;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const chunk = keys.slice(i, i + CHUNK);
      const url = `https://coins.llama.fi/prices/current/${chunk.map(encodeURIComponent).join(",")}`;
      try {
        const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
        if (!res.ok) continue;
        const json = (await res.json()) as { coins?: Record<string, { price?: number; confidence?: number }> };
        const coins = json.coins ?? {};
        for (const k of chunk) {
          const rec = coins[k];
          if (!rec || !isPositiveFinite(rec.price)) continue;
          if (rec.confidence != null && rec.confidence < 0.6) continue;
          const contract = keyToContract.get(k);
          if (contract) out.set(contract, rec.price);
        }
      } catch {
        // chunk failure → fall back to per-token cascade for unseen tokens
      }
    }
    return out;
  }
}
