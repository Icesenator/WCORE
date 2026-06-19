import type { PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";

interface DexPair {
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string | number;
  priceNative?: string | number;
  liquidity?: { usd?: string | number };
}

const QUOTE_ALLOWLIST = new Set(["usdc", "usdt", "dai", "weth", "wbnb", "wbtc", "cbbtc", "usdce", "frax", "lusd", "busd", "tusd", "crvusd", "susd", "usdd", "mim", "fei"]);

function isAllowedQuote(symbol?: string): boolean {
  if (!symbol) return false;
  return QUOTE_ALLOWLIST.has(symbol.toLowerCase());
}
export class DexScreenerPriceSource implements TokenPriceSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    const slug = token.chain.CHAIN?.DEX_SLUG ?? (token.chain.vm === "SVM" ? "solana" : null);
    const contract = normalizePriceKey(token.contract ?? token.key);
    if (!slug || !contract) return null;
    const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(String(slug))}/${contract}`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as DexPair[] | { pairs?: DexPair[] };
    const pairs = Array.isArray(json) ? json : json.pairs ?? [];
    let best: SourcePriceLike = null;
    let bestLiquidity = -1;
    for (const pair of pairs) {
      const liq = Number(pair.liquidity?.usd ?? 0);
      if (!Number.isFinite(liq) || liq < 50 || liq <= bestLiquidity) continue;
      const base = normalizePriceKey(pair.baseToken?.address ?? "");
      const quote = normalizePriceKey(pair.quoteToken?.address ?? "");
      const baseUsd = Number(pair.priceUsd);
      if (!isPositiveFinite(baseUsd)) continue;
      if (base === contract) {
        if (!isAllowedQuote(pair.quoteToken?.symbol)) continue;
        best = { priceUsd: baseUsd, source: "dex", symbol: pair.baseToken?.symbol, name: pair.baseToken?.name };
        bestLiquidity = liq;
      } else if (quote === contract) {
        if (!isAllowedQuote(pair.baseToken?.symbol)) continue;
        const native = Number(pair.priceNative);
        if (!isPositiveFinite(native)) continue;
        best = { priceUsd: baseUsd / native, source: "dex", symbol: pair.quoteToken?.symbol, name: pair.quoteToken?.name };
        bestLiquidity = liq;
      }
    }
    return best;
  }
}
