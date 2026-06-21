import type { FastifyInstance } from "fastify";
import type { CircuitBreaker, CacheStore } from "@wcore/core";
import { NativePriceQuerySchema } from "../schemas.js";
import { isAdminAuthorized } from "../admin-auth.js";

export interface ChainsPluginDeps {
  circuitBreakers: Map<string, CircuitBreaker>;
  cache: CacheStore;
}

export async function chainsPlugin(app: FastifyInstance, deps: ChainsPluginDeps) {
  const { circuitBreakers, cache } = deps;
  const { chainList, getChain, getChainlistEntry, getExplorerUrl, metrics, getEurUsdRate, isChainDisabled } = await import("@wcore/core");
  const requireAdmin = (req: { headers: Record<string, string | string[] | undefined> }, reply: { code: (statusCode: number) => unknown }) => {
    if (isAdminAuthorized(req)) return true;
    reply.code(401);
    return false;
  };

  // --- Chains List ---

  app.get("/api/chains", async (_req, reply) => {
    // Chain config is near-static — safe to cache at the edge/browser.
    reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return {
    count: chainList.length,
    byVm: chainList.reduce<Record<string, number>>((acc, c) => {
      acc[c.vm] = (acc[c.vm] ?? 0) + 1;
      return acc;
    }, {}),
    chains: chainList.map((c) => {
      const entry = c.CHAIN?.CHAIN_ID ? getChainlistEntry(Number(c.CHAIN.CHAIN_ID)) : undefined;
      const chainId = c.CHAIN?.CHAIN_ID;
      return {
        key: c.key,
        vm: c.vm,
        name: c.CHAIN?.NAME ?? c.key,
        chainId,
        disabled: isChainDisabled(c.key),
        nativeSymbol: c.CHAIN?.NATIVE_SYMBOL,
        rpcCount: Array.isArray(c.RPC?.ENDPOINTS) ? c.RPC.ENDPOINTS.length : 0,
        explorerUrl: chainId ? getExplorerUrl(Number(chainId)) : null,
        iconUrl: entry?.icon && chainId ? `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json` : null,
      };
    }),
    };
  });

  // --- Stats ---

  app.get("/api/stats", async (req, reply) => {
    if (!requireAdmin(req, reply)) return { error: "unauthorized" };
    return {
      ...metrics.snapshot(),
      chainCount: chainList.length,
      circuits: Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()])),
    };
  });

  // --- Single Chain ---

  app.get<{ Params: { key: string } }>("/api/chains/:key", async (req, reply) => {
    const chain = getChain(req.params.key.toUpperCase());
    if (!chain) { reply.code(404); return { error: "chain_not_found", key: req.params.key }; }
    reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return chain;
  });

  // --- Circuit Breakers ---

  app.get("/api/circuit", async (req, reply) => {
    if (!requireAdmin(req, reply)) return { error: "unauthorized" };
    return {
      circuits: Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()])),
    };
  });

  // --- Pricing: ETH ---

  app.get("/api/price/eth", async (_req, reply) => {
    // Native price changes slowly enough that a short shared cache cuts
    // upstream CoinGecko/DefiLlama hits without showing stale numbers.
    reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    const sources = [
      async () => {
        const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h");
        const data = await res.json() as { coins?: Record<string, { price: number }> };
        return data.coins?.["coingecko:ethereum"]?.price;
      },
      async () => {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        const data = await res.json() as { ethereum?: { usd: number } };
        return data.ethereum?.usd;
      },
    ];
    for (const source of sources) {
      try {
        const price = await source();
        if (price && price > 0) return { price, source: "pricing-oracle", timestamp: Date.now() };
      } catch { /* continue */ }
    }
    return { price: null, source: "unavailable", timestamp: Date.now(), error: "All price sources failed" };
  });

  // --- Pricing: Native ---

  app.get("/api/price/native", async (req, reply) => {
    reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    const chainKey = (NativePriceQuerySchema.parse(req.query).chain || "ethereum").toLowerCase();
    const cfg = getChain(chainKey.toUpperCase());
    const llamaId = cfg?.CHAIN?.NATIVE_LLAMA_ID;
    const geckoId = cfg?.CHAIN?.NATIVE_GECKO_ID || chainKey;

    const cacheKey = `native_price:${chainKey}`;
    const persist = (price: number, source: string) => {
      // 24h TTL: long enough to survive prolonged upstream outages, the GM tip
      // only needs an approximate native price.
      cache.set(cacheKey, { price, source }, 24 * 60 * 60 * 1000).catch(() => { /* best-effort */ });
      return { price, source };
    };

    // Both sources can hiccup transiently. Use explicit timeouts so a hung
    // request fails fast and the next source is tried, instead of returning a
    // null price that hard-breaks the GM tip flow ("Native price zero for X").
    if (llamaId) {
      try {
        const res = await fetch(`https://coins.llama.fi/prices/current/${llamaId}?searchWidth=4h`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json() as { coins?: Record<string, { price: number }> };
        if (data.coins?.[llamaId]?.price) return persist(data.coins[llamaId].price, "defillama");
      } catch (e) { console.error("native price defillama error:", (e as Error).message); }
    }
    try {
      const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
      const cgData = await cgRes.json() as Record<string, { usd?: number }>;
      const price = cgData[geckoId]?.usd;
      if (price) return persist(price, "coingecko");
    } catch (e) { console.error("native price coingecko error:", (e as Error).message); }

    // Both upstreams failed (or returned no price). Serve the last-known-good
    // price so a transient outage doesn't break the GM tip flow.
    const cached = await cache.get<{ price: number; source: string }>(cacheKey).catch(() => undefined);
    if (cached?.price) return { price: cached.price, source: `${cached.source}-cached` };
    return { price: null };
  });

  // --- Pricing: EUR/USD rate ---

  app.get("/api/price/fx", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    const rate = await getEurUsdRate();
    // Self-telemetry: publish the web runtime's current rate to the cross-runtime
    // drift cache so /api/diag/fx-parity can compare against gsheet's report.
    // Fire-and-forget — never let telemetry failure break the public endpoint.
    cache
      .set(
        "fx_telemetry:web",
        { rate, ts: Date.now(), sources: [], runtime: "web" },
        2 * 60 * 60 * 1000,
      )
      .catch((e: unknown) => app.log.warn({ err: String(e) }, "fx self-telemetry failed"));
    return { eurUsd: rate, timestamp: Date.now() };
  });
}
