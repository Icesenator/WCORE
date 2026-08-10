import type { PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";

interface DexPair {
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string | number;
  priceNative?: string | number;
  liquidity?: { usd?: string | number };
}

// The allowlist keeps a pair from being priced off an arbitrary counter asset.
// It was written for EVM and omitted SOL, the dominant quote on Solana, so the
// deepest pairs of major mints were discarded and those tokens showed no price.
const QUOTE_ALLOWLIST = new Set(["usdc", "usdt", "dai", "weth", "wbnb", "wbtc", "cbbtc", "usdce", "frax", "lusd", "busd", "tusd", "crvusd", "susd", "usdd", "mim", "fei"]);
const WSOL_MINT = normalizePriceKey("So11111111111111111111111111111111111111112");

function isAllowedQuote(symbol: string | undefined, address: string | undefined, vm: string): boolean {
  if (!symbol) return false;
  const normalizedSymbol = symbol.toLowerCase();
  if (normalizedSymbol === "sol" || normalizedSymbol === "wsol") {
    return vm === "SVM" && normalizePriceKey(address ?? "") === WSOL_MINT;
  }
  return QUOTE_ALLOWLIST.has(normalizedSymbol);
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
        if (!isAllowedQuote(pair.quoteToken?.symbol, pair.quoteToken?.address, token.chain.vm)) continue;
        best = { priceUsd: baseUsd, source: "dex", symbol: pair.baseToken?.symbol, name: pair.baseToken?.name };
        bestLiquidity = liq;
      } else if (quote === contract) {
        if (!isAllowedQuote(pair.baseToken?.symbol, pair.baseToken?.address, token.chain.vm)) continue;
        const native = Number(pair.priceNative);
        if (!isPositiveFinite(native)) continue;
        best = { priceUsd: baseUsd / native, source: "dex", symbol: pair.quoteToken?.symbol, name: pair.quoteToken?.name };
        bestLiquidity = liq;
      }
    }
    return best;
  }
}
