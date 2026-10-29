import { GT_OK, MARKER_TTL_MS, NEED_TRY3 } from "../markers.js";
import type { PricingCache, PricingToken, SourcePrice, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";
import { gtConfirmMarkerKey, gtMarkerKey, gtNetwork } from "../markers.js";

// Defaults: 120 calls / 60s. The web runtime has no 30s execution cap like GSheet,
// so we can afford a much higher budget per scan. Keep the shared throttle to
// prevent 429 storms when SCAN_CONCURRENCY > 1. GT free tier is ~30/min; 120/min
// with short delays between calls stays under their radar. Override via
// GT_THROTTLE_MAX_CALLS (integer) and GT_THROTTLE_WINDOW_MS (ms) in Railway env.
function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}
const DEFAULT_MAX_CALLS = envInt("GT_THROTTLE_MAX_CALLS", 300);
const DEFAULT_WINDOW_MS = envInt("GT_THROTTLE_WINDOW_MS", 60_000);
const GT_BATCH_SIZE = envInt("GT_BATCH_SIZE", 30);
// Minimum pool reserve ($) before GeckoTerminal pool pricing is trusted.
const GT_MIN_POOL_RESERVE_USD = envInt("GT_MIN_POOL_RESERVE_USD", 50);
// Small inter-call delay to avoid burst 429s (esp. when multiple concurrent scans
// happen to fire calls at the same instant).
const GT_CALL_DELAY_MS = envInt("GT_CALL_DELAY_MS", 10);

// Process-level shared throttle: every GeckoTerminalPriceSource instance must
// pass through this single gate. Without this, each engine (EVM/SVM/Cosmos)
// instantiates its own source and SCAN_CONCURRENCY > 1 multiplies the budget
// — guaranteed 429 storm. Tests can opt out by passing a per-instance opts
// override; production paths always share.
class GtThrottle {
  private callCount = 0;
  private windowStart = Date.now();
  constructor(private readonly maxCalls: number, private readonly windowMs: number) {}
  tryAcquire(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.callCount = 0;
      this.windowStart = now;
    }
    if (this.callCount >= this.maxCalls) return false;
    this.callCount++;
    return true;
  }
}

const sharedGtThrottle = new GtThrottle(DEFAULT_MAX_CALLS, DEFAULT_WINDOW_MS);

// Two GeckoTerminal prices for the same token further apart than this ratio disagree.
const GT_MAX_DIVERGENCE = 3;

export function gtPricesAgree(a: number, b: number): boolean {
  return isPositiveFinite(a) && isPositiveFinite(b) && Math.max(a, b) / Math.min(a, b) <= GT_MAX_DIVERGENCE;
}

/**
 * Bulk GT simple prices are served as fresh cache hits without any other check, so a
 * price fabricated by a drained pool would stick. Keep a bulk GT price only when
 * DefiLlama agrees with it, or when the per-token path recently confirmed it against
 * /tokens price_usd (GT_OK marker). Everything else goes through the per-token cascade.
 */
export async function confirmGtBatchPrices(
  network: string,
  gtBatch: Map<string, number> | null | undefined,
  llamaBatch: Map<string, number> | null | undefined,
  cache: Pick<PricingCache, "getMarker">,
): Promise<Map<string, number>> {
  const confirmed = new Map<string, number>();
  if (!(gtBatch instanceof Map)) return confirmed;
  for (const [contract, priceUsd] of gtBatch) {
    const llamaUsd = llamaBatch instanceof Map ? llamaBatch.get(contract) : undefined;
    if (llamaUsd != null) {
      if (gtPricesAgree(priceUsd, llamaUsd)) confirmed.set(contract, priceUsd);
      continue;
    }
    let marker: string | null = null;
    try { marker = await cache.getMarker(gtConfirmMarkerKey(network, contract)); } catch { /* unconfirmed */ }
    if (marker === GT_OK) confirmed.set(contract, priceUsd);
  }
  return confirmed;
}

export class GeckoTerminalPriceSource implements TokenPriceSource {
  private readonly throttle: GtThrottle;
  private static lastCallMs = 0;

  constructor(
    private readonly cache?: PricingCache,
    private readonly fetchImpl: typeof fetch = fetch,
    opts?: { maxCallsPerWindow?: number; windowMs?: number },
  ) {
    // Per-instance throttle only when test/caller overrides limits; otherwise
    // share the process-wide gate so concurrent scans don't multiply budget.
    this.throttle = opts
      ? new GtThrottle(opts.maxCallsPerWindow ?? DEFAULT_MAX_CALLS, opts.windowMs ?? DEFAULT_WINDOW_MS)
      : sharedGtThrottle;
  }

  private checkThrottle(): boolean {
    return this.throttle.tryAcquire();
  }

  /** Spread calls to avoid burst 429s from concurrent scans. */
  private static async paceCall(): Promise<void> {
    const now = Date.now();
    const elapsed = now - GeckoTerminalPriceSource.lastCallMs;
    if (elapsed < GT_CALL_DELAY_MS) {
      await new Promise((r) => setTimeout(r, GT_CALL_DELAY_MS - elapsed));
    }
    GeckoTerminalPriceSource.lastCallMs = Date.now();
  }

  async batchTokenPrices(network: string, contracts: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (!contracts.length) return prices;
    const normalized = [...new Set(contracts.map((c) => c.toLowerCase()))];
    for (let i = 0; i < normalized.length; i += GT_BATCH_SIZE) {
      if (!this.checkThrottle()) return prices;
      await GeckoTerminalPriceSource.paceCall();
      const joined = normalized.slice(i, i + GT_BATCH_SIZE).join(",");
      const url = `https://api.geckoterminal.com/api/v2/simple/networks/${encodeURIComponent(network)}/token_price/${joined}`;
      try {
        const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const json = (await res.json()) as { data?: { attributes?: { token_prices?: Record<string, string | number | null> } } };
        const tokenPrices = json.data?.attributes?.token_prices;
        if (!tokenPrices) continue;
        for (const [address, raw] of Object.entries(tokenPrices)) {
          const p = Number(raw);
          if (isPositiveFinite(p)) prices.set(address.toLowerCase(), p);
        }
      } catch {
        // keep other chunks usable on network/timeout errors
      }
    }
    return prices;
  }

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    const net = gtNetwork(token.chain);
    const contract = normalizePriceKey(token.contract ?? token.key);
    if (!net || !contract) return null;

    const marker = this.cache ? await this.cache.getMarker(gtMarkerKey(token)) : null;
    const skipTry2 = marker === NEED_TRY3;
    if (!skipTry2) {
      const try1 = this.checkThrottle() ? await this.tryTokenPrice(net, contract) : null;
      const try2 = this.checkThrottle() ? await this.tryToken(token, contract) : null;
      const try2Price = try2 && isPositiveFinite(try2.priceUsd) ? try2.priceUsd : null;
      const identity = { ...(try2?.symbol ? { symbol: try2.symbol } : {}), ...(try2?.name ? { name: try2.name } : {}) };
      if (isPositiveFinite(try1)) {
        if (try2Price != null && gtPricesAgree(try1, try2Price)) {
          await this.cache?.setMarker(gtConfirmMarkerKey(net, contract), GT_OK, MARKER_TTL_MS);
          return { priceUsd: try1, source: "gt-batch", ...identity };
        }
        // The simple price can come from a drained pool (IJN: $0.000214 simple vs
        // $0.0000046 on its only real pool): unconfirmed, only the deepest pool above
        // the liquidity floor may price the token, otherwise it stays unpriced.
        const pooled = this.checkThrottle() ? await this.tryPools(net, contract) : null;
        if (isPositiveFinite(pooled)) return { priceUsd: pooled, source: "gt", ...identity };
        return { priceUsd: null, source: "gt", reason: "gt_simple_unconfirmed" };
      }
      if (try2 && try2Price != null) return try2;
      if (try2?.marker === NEED_TRY3) {
        await this.cache?.setMarker(gtMarkerKey(token), NEED_TRY3);
      }
    }

    if (this.checkThrottle()) {
      const try3 = await this.tryPools(net, contract);
      if (isPositiveFinite(try3)) return { priceUsd: try3, source: "gt" };
    }
    return { priceUsd: null, source: "gt", marker: NEED_TRY3, reason: "try3_no_price" };
  }

  private async tryTokenPrice(net: string, contract: string): Promise<number | null> {
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/${encodeURIComponent(net)}/token_price/${contract}`;
    await GeckoTerminalPriceSource.paceCall();
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { attributes?: { token_prices?: Record<string, string | number | null> } } };
    const price = Number(json.data?.attributes?.token_prices?.[contract]);
    return isPositiveFinite(price) ? price : null;
  }

  private async tryToken(token: PricingToken, contract: string): Promise<SourcePrice | null> {
    const net = gtNetwork(token.chain);
    const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(net)}/tokens/${contract}`;
    await GeckoTerminalPriceSource.paceCall();
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { attributes?: { price_usd?: string | number | null; token_price_usd?: string | number | null; symbol?: string; name?: string } };
    };
    const attr = json.data?.attributes;
    const price = Number(attr?.price_usd ?? attr?.token_price_usd);
    if (isPositiveFinite(price)) return { priceUsd: price, source: "gt", symbol: attr?.symbol, name: attr?.name };
    return { priceUsd: null, source: "gt", marker: NEED_TRY3, reason: "try2_no_price" };
  }

  private async tryPools(net: string, contract: string): Promise<number | null> {
    const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(net)}/tokens/${contract}/pools?page=1`;
    await GeckoTerminalPriceSource.paceCall();
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        attributes?: {
          base_token_price_usd?: string | number | null;
          quote_token_price_usd?: string | number | null;
          token_price_usd?: string | number | null;
          reserve_in_usd?: string | number | null;
        };
        relationships?: {
          base_token?: { data?: { id?: string } };
          quote_token?: { data?: { id?: string } };
        };
      }>;
    };
    let bestPrice: number | null = null;
    let bestReserve = -1;
    for (const pool of json.data ?? []) {
      const attr = pool.attributes;
      if (!attr) continue;
      const baseId = String(pool.relationships?.base_token?.data?.id ?? "").toLowerCase();
      const quoteId = String(pool.relationships?.quote_token?.data?.id ?? "").toLowerCase();
      const isBase = baseId.includes(contract);
      const isQuote = quoteId.includes(contract);
      if (!isBase && !isQuote) continue;
      const price = isBase ? Number(attr.base_token_price_usd) : Number(attr.quote_token_price_usd);
      if (!isPositiveFinite(price)) continue;
      const reserve = Number(attr.reserve_in_usd ?? 0);
      const safeReserve = Number.isFinite(reserve) && reserve >= 0 ? reserve : 0;
      // Liquidity floor aligned with DexScreener (liq >= $50): pools holding
      // dust reserves ($0.0001-1) report fabricated prices (e.g. sbFUSE on
      // Fuse ~$0.31 from a $0.00016 pool) and must be ignored.
      if (safeReserve < GT_MIN_POOL_RESERVE_USD) continue;
      if (safeReserve > bestReserve) {
        bestPrice = price;
        bestReserve = safeReserve;
      }
    }
    return bestPrice;
  }
}
