import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import pLimit from "p-limit";
import type { PrismaClient } from "@wcore/db";
import type { CacheStore, CircuitBreaker, WalletAssets, CacheStats, IntraScanCache } from "@wcore/core";
import { metrics } from "@wcore/core";
import { AnyAddress } from "@wcore/shared";
import type { ChainScan, ScanResult } from "@wcore/shared";
import { ScanJobParamsSchema, ScanRequestBodySchema, BatchScanRequestBodySchema } from "../schemas.js";
import { getScanResultCacheKey, getEngineCacheForScan, hasCachedValue, isRetriableNonEvmResult, shouldCacheAssets, calcCleanChainValue, runWithTimeout, chainCircuitOutcome, applyChainCircuitOutcome } from "./scan-utils.js";
import { scanJobs, startJobCleanup, admitScanJob, jobPrincipal } from "./scan-job.js";
import { classifyScanError, consumeScanBudget, scanRequestCost } from "../server-helpers.js";
import { apiConfig } from "../config.js";
import { applyDeFiPositionMirrorsToWalletAssets, precomputeWCTStakeLockStatus } from "./gsheet.js";

const SCAN_CONCURRENCY = apiConfig.scan.scanConcurrency;
const NON_EVM_SCAN_CONCURRENCY = apiConfig.scan.nonEvmScanConcurrency;
const SCAN_RESULT_CACHE_TTL_MS = apiConfig.scan.scanResultCacheTtlMs;
const CHAIN_TIMEOUT_MS = apiConfig.scan.chainTimeoutMs;
const BATCH_CHAIN_TIMEOUT_MS = apiConfig.scan.batchChainTimeoutMs;

async function finalizeDeFiAssets(chain: string, address: string, assets: WalletAssets): Promise<WalletAssets> {
  await precomputeWCTStakeLockStatus(chain.toUpperCase(), address);
  return applyDeFiPositionMirrorsToWalletAssets(chain, address, assets);
}

function hasUnfinalizedDeFiAssets(chain: string, assets: WalletAssets): boolean {
  if (chain.toUpperCase() !== "OPTIMISM") return false;
  return ((assets.tokens ?? []) as Array<Record<string, unknown>>).some((token) => {
    const symbol = String(token.symbol ?? "");
    const isDeFiPosition = /^(WCT (Stake|Claimable)|Comp )/.test(symbol);
    const hasLiquiditySuffix = /\[(Flex|Lock)\]$/.test(String(token.name ?? ""));
    return isDeFiPosition && (token.priceEur == null || !hasLiquiditySuffix);
  });
}

async function fetchFxRate(cache?: CacheStore): Promise<number | { code: 503; body: { error: string; message: string } }> {
  try {
    const { getEurUsdRate } = await import("@wcore/core");
    // Without the shared store the cascade only memoises in process memory, so its four
    // HTTP calls ran again after every restart and were never shared across instances.
    return await getEurUsdRate({ cache });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[scan] FX rate unavailable:", msg);
    return { code: 503, body: { error: "fx_unavailable", message: `FX rate unavailable: ${msg}` } };
  }
}

export interface ScanPluginDeps {
  prisma: PrismaClient;
  sharedCache: CacheStore;
  getCircuitBreaker: (chain: string) => CircuitBreaker;
  validateChains: (input: unknown) => { ok: true; chains: string[]; skipped?: string[] } | { ok: false; error: string };
  resolveCustomTokens: (userId: string | undefined, requestTokens: unknown) => Promise<string[]>;
  buildChainScan: (chainKey: string, assets: WalletAssets, fxRate?: number) => ChainScan;
  getScanLimit: (userId: string) => Promise<number>;
  MAX_CHAINS_PER_SCAN: number;
  ANONYMOUS_MAX_CHAINS_PER_SCAN: number;
}

export async function resolveScanChainLimit(
  userId: string | undefined,
  getAuthenticatedLimit: (userId: string) => Promise<number>,
  _maxChainsPerScan: number,
  anonymousMaxChainsPerScan: number,
): Promise<number> {
  if (!userId) return anonymousMaxChainsPerScan;
  return getAuthenticatedLimit(userId);
}

export async function scanPlugin(app: FastifyInstance, deps: ScanPluginDeps) {
  const { prisma, sharedCache, getCircuitBreaker, validateChains, resolveCustomTokens, buildChainScan, getScanLimit, MAX_CHAINS_PER_SCAN, ANONYMOUS_MAX_CHAINS_PER_SCAN } = deps;

  startJobCleanup();

  /**
   * Charge a scan against the per-minute chain-check budget.
   *
   * The request-count rate limit runs in onRequest, before the body exists, so it
   * cannot see how much work a request actually asks for. This runs where the chain
   * and wallet counts are known and is the only control that bounds outbound RPC.
   */
  async function chargeScanBudget(
    req: { user?: { id: string } | null; ip: string },
    chainCount: number,
    walletCount = 1,
  ): Promise<boolean> {
    const authenticated = Boolean(req.user);
    const limit = authenticated
      ? apiConfig.limits.rateLimitScanChainChecks
      : apiConfig.limits.rateLimitScanChainChecksAnon;
    const identity = req.user?.id ?? req.ip;
    const key = `rate_limit:scan_chain_checks:${identity}`;
    return consumeScanBudget(sharedCache, key, scanRequestCost(chainCount, walletCount), limit);
  }

  const budgetExceeded = { error: "rate_limited", message: "Scan budget exhausted. Wait 1 minute." } as const;

  // --- Sync Scan ---

  app.post("/api/scan", async (req, reply) => {
    const bodyParsed = ScanRequestBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) { reply.code(400); return { error: "invalid_body", message: bodyParsed.error.issues[0]?.message ?? "invalid body" }; }
    const body = bodyParsed.data;
    const parsedAddress = AnyAddress.safeParse(body.address);
    if (!parsedAddress.success) { reply.code(400); return { error: "invalid_address", message: parsedAddress.error.issues[0]?.message ?? "invalid address" }; }

    const chainValidation = validateChains(body.chains);
    if (!chainValidation.ok) { reply.code(400); return { error: "invalid_chains", message: chainValidation.error }; }

    const maxChains = await resolveScanChainLimit(req.user?.id, getScanLimit, MAX_CHAINS_PER_SCAN, ANONYMOUS_MAX_CHAINS_PER_SCAN);
    if (chainValidation.chains.length > maxChains) { reply.code(400); return { error: "too_many_chains", message: `Max ${maxChains} chains per scan.` }; }

    if (!await chargeScanBudget(req, chainValidation.chains.length)) { reply.code(429); return budgetExceeded; }

    const deepScan = typeof body.deepScan === "boolean" ? body.deepScan : false;
    const forceRefresh = typeof body.forceRefresh === "boolean" ? body.forceRefresh : false;
    const strictTokens = typeof body.strictTokens === "boolean" ? body.strictTokens : false;
    const logBlockRange = deepScan ? 200_000 : 5_000;
    const requestedChains = chainValidation.chains;
    const customTokens = await resolveCustomTokens(req.user?.id, body.customTokens);

    const fxResult = await fetchFxRate(sharedCache);
    if (typeof fxResult !== "number") { reply.code(fxResult.code); return fxResult.body; }
    const fxRate = fxResult;

    const openCircuits = requestedChains.filter((chain) => !getCircuitBreaker(chain).allowRequest());
    const activeChains = requestedChains.filter((chain) => getCircuitBreaker(chain).allowRequest());
    if (activeChains.length === 0) {
      const { metrics } = await import("@wcore/core");
      for (let i = 0; i < openCircuits.length; i++) metrics.recordCircuitBreakerTrip();
      reply.code(503);
      return { error: "circuit_open", message: `All ${openCircuits.length} requested chain(s) have open circuit breakers.` };
    }

    const { getWalletAssets, metrics, detectScam, RedisPricingCache, getChain } = await import("@wcore/core");
    const pricingCache = new RedisPricingCache(sharedCache);
    const intraScanPriceCache = new Map() as IntraScanCache;

    const rawChains: WalletAssets[] = [];
    for (const chain of openCircuits) {
      rawChains.push({ chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [`circuit_open: Circuit breaker open for ${chain}.`], totalValueEur: 0, scanMs: 0 } as WalletAssets);
    }

    // Check scan result cache for already-scanned chains (skip when forceRefresh).
    // Single mget round-trip instead of N sequential Redis gets.
    const cachedChains: WalletAssets[] = [];
    const uncachedChains: string[] = [];
    if (!forceRefresh) {
      let cachedEntries: ((WalletAssets & { ts: number }) | undefined)[] = [];
      try {
        cachedEntries = await sharedCache.mget<WalletAssets & { ts: number }>(
          activeChains.map((chain) => getScanResultCacheKey(parsedAddress.data, chain)),
        );
      } catch { cachedEntries = []; }
      activeChains.forEach((chain, i) => {
        const cached = cachedEntries[i];
        if (cached && Date.now() - cached.ts < SCAN_RESULT_CACHE_TTL_MS) {
          const { ts: _ts, ...result } = cached;
          const assets = result as WalletAssets;
          if (hasCachedValue(assets) && !hasUnfinalizedDeFiAssets(chain, assets)) {
            cachedChains.push(assets);
            return;
          }
          // Cached result has no value (empty or errored) ��� skip and re-scan
        }
        uncachedChains.push(chain);
      });
    } else {
      uncachedChains.push(...activeChains);
    }

    const scanPool = pLimit(SCAN_CONCURRENCY);
    const rawResults = await Promise.all(uncachedChains.map((chain) => scanPool(async () => {
      const timeoutMsg = `chain_timeout: ${chain} exceeded ${CHAIN_TIMEOUT_MS}ms`;
      let chainPromise: Promise<WalletAssets> | undefined;
      try {
        const engineCache = getEngineCacheForScan(forceRefresh, getChain(chain)?.vm, sharedCache);
        const handle = runWithTimeout<WalletAssets>((signal) => {
          const p = getWalletAssets(parsedAddress.data, chain, { cache: engineCache, sharedPriceCache: pricingCache, logBlockRange, customTokens, strictTokens, intraScanCache: intraScanPriceCache, forceRefresh, fxRate, signal });
          chainPromise = p;
          return p;
        }, CHAIN_TIMEOUT_MS);
        return await handle.promise;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("chain_timeout")) {
          // The AbortController was fired: chainPromise continues but the
          // engine observed signal.aborted === true and short-circuited its
          // internal fetches. We still cache the result if the engine
          // eventually produces usable data (fire-and-forget).
          if (chainPromise) {
            chainPromise.then(async (assets) => {
              const finalized = await finalizeDeFiAssets(chain, parsedAddress.data, assets);
              if (shouldCacheAssets(finalized)) {
                const scanCacheKey = getScanResultCacheKey(parsedAddress.data, chain);
                sharedCache.set(scanCacheKey, { ...finalized, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
              }
            }).catch(() => {});
          }
          metrics.recordChainTimeout(chain);
          // The breaker is charged once, below, where every result is accounted for.
          // Charging it here too made a timeout count twice.
          return { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [timeoutMsg], totalValueEur: 0, scanMs: 0 } as WalletAssets;
        }
        metrics.recordOtherError(chain, msg);
        return { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [msg], totalValueEur: 0, scanMs: 0 } as WalletAssets;
      }
    })));

    const finalizedRawResults = await Promise.all(rawResults.map((result) => finalizeDeFiAssets(result.chain, parsedAddress.data, result)));

    // Cache successful scan results
    for (const result of finalizedRawResults) {
      if (shouldCacheAssets(result)) {
        const scanCacheKey = getScanResultCacheKey(parsedAddress.data, result.chain);
        sharedCache.set(scanCacheKey, { ...result, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
      }
    }

    rawChains.push(...cachedChains, ...finalizedRawResults);

    for (const c of rawChains) {
      applyChainCircuitOutcome(getCircuitBreaker(c.chain), c);
    }

    const chains: ChainScan[] = rawChains.map((chain) => buildChainScan(chain.chain, chain, fxRate));

    // Apply scam filtering per-chain and compute clean totals
    for (const c of chains) {
      c.totals.valueEur = calcCleanChainValue(c, detectScam);
    }
    const cleanTotalEur = Math.round(chains.reduce((sum, c) => sum + c.totals.valueEur, 0) * 100) / 100;

    // Aggregate cacheStats from chain results
    const totalCacheStats: CacheStats = { hits: 0, misses: 0, stale: 0, skipped: 0 };
    for (const c of rawChains) {
      const cs = (c as { cacheStats?: CacheStats }).cacheStats;
      if (cs) {
        totalCacheStats.hits += cs.hits ?? 0;
        totalCacheStats.misses += cs.misses ?? 0;
        totalCacheStats.stale += cs.stale ?? 0;
        totalCacheStats.skipped += cs.skipped ?? 0;
      }
    }
    const totalCacheOps = totalCacheStats.hits + totalCacheStats.misses;
    const cacheHitRate = totalCacheOps > 0 ? (totalCacheStats.hits / totalCacheOps).toFixed(2) : "N/A";

    const scanMetrics = { totalMs: chains.reduce((sum, c) => sum + c.scanMs, 0), chainsScanned: chains.length, chainsWithErrors: chains.filter((c) => c.errors.length > 0).length, totalTokens: chains.reduce((sum, c) => sum + c.totals.tokenCount, 0), pricedTokens: chains.reduce((sum, c) => sum + c.totals.pricedCount, 0), cacheStats: totalCacheStats, cacheHitRate };

    for (const c of chains) {
      // Une seule classification, partagee par le comptage et l'enregistrement.
      // Les deux divergeaient, et les categories se chevauchaient au point de
      // rendre le compteur "other" negatif (cf. classifyScanError).
      const kinds = c.errors.map((e) => classifyScanError(e.message));
      const rpcErrs = kinds.filter((k) => k === "rpc").length;
      const priceErrs = kinds.filter((k) => k === "pricing").length;
      const otherErrs = kinds.filter((k) => k === "other").length;
      metrics.recordScan(c.chainKey, c.scanMs || 0, c.totals.tokenCount, c.totals.pricedCount, rpcErrs, priceErrs, otherErrs);
      c.errors.forEach((e, i) => {
        switch (kinds[i]) {
          case "balCache": return;
          case "rpc": return metrics.recordRpcError(c.chainKey, e.message);
          case "pricing": return metrics.recordPricingError(c.chainKey, e.message);
          case "timeout": return metrics.recordChainTimeout(c.chainKey);
          default: return metrics.recordOtherError(c.chainKey, e.message);
        }
      });
    }

    const result: ScanResult = { address: parsedAddress.data, requestedChains, chains, totals: { valueEur: cleanTotalEur, tokenCount: chains.reduce((sum, c) => sum + c.totals.tokenCount, 0), pricedCount: chains.reduce((sum, c) => sum + c.totals.pricedCount, 0), chainsWithErrors: chains.filter((c) => c.errors.length > 0).length }, generatedAt: new Date().toISOString(), metrics: scanMetrics };

    if (req.user) {
      // Fire-and-forget: history persistence must not add latency to the response path.
      prisma.walletScan.create({ data: { userId: req.user.id, address: parsedAddress.data, chains: requestedChains, totalEur: cleanTotalEur, tokenCount: chains.reduce((sum, c) => sum + c.totals.tokenCount, 0), result: result as never } })
        .catch((err) => { console.error("walletScan.create failed:", (err as Error).message); });
    }

    return result;
  });

  // --- Batch Scan (multi-wallet) ---

  app.post("/api/scan/batch", async (req, reply) => {
    const bodyParsed = BatchScanRequestBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) { reply.code(400); return { error: "invalid_body", message: bodyParsed.error.issues[0]?.message ?? "invalid body" }; }
    const body = bodyParsed.data;

    // Validate every address up-front: a bad address must be a 400, not an
    // unhandled throw (previously a raw Error inside .map() ��� 500).
    const addresses: string[] = [];
    for (const a of body.addresses as string[]) {
      const parsed = AnyAddress.safeParse(a);
      if (!parsed.success) { reply.code(400); return { error: "invalid_address", message: `invalid address: ${a}` }; }
      addresses.push(parsed.data);
    }

    const chainValidation = validateChains(body.chains);
    if (!chainValidation.ok) { reply.code(400); return { error: "invalid_chains", message: chainValidation.error }; }

    const maxChains = await resolveScanChainLimit(req.user?.id, getScanLimit, MAX_CHAINS_PER_SCAN, ANONYMOUS_MAX_CHAINS_PER_SCAN);
    if (chainValidation.chains.length > maxChains) { reply.code(400); return { error: "too_many_chains", message: `Max ${maxChains} chains per scan.` }; }

    // Batch multiplies the work by the number of wallets, so the cost must too.
    if (!await chargeScanBudget(req, chainValidation.chains.length, addresses.length)) { reply.code(429); return budgetExceeded; }

    const deepScan = typeof body.deepScan === "boolean" ? body.deepScan : false;
    const forceRefresh = typeof body.forceRefresh === "boolean" ? body.forceRefresh : false;
    const strictTokens = typeof body.strictTokens === "boolean" ? body.strictTokens : false;
    const logBlockRange = deepScan ? 200_000 : 5_000;
    const requestedChains = chainValidation.chains;
    const customTokens = await resolveCustomTokens(req.user?.id, body.customTokens);

    const fxResult = await fetchFxRate(sharedCache);
    if (typeof fxResult !== "number") { reply.code(fxResult.code); return fxResult.body; }
    const fxRate = fxResult;

    const openCircuits = requestedChains.filter((chain) => !getCircuitBreaker(chain).allowRequest());
    const activeChains = requestedChains.filter((chain) => getCircuitBreaker(chain).allowRequest());
    if (activeChains.length === 0) {
      const { metrics } = await import("@wcore/core");
      for (let i = 0; i < openCircuits.length; i++) metrics.recordCircuitBreakerTrip();
      reply.code(503);
      return { error: "circuit_open", message: `All ${openCircuits.length} requested chain(s) have open circuit breakers.` };
    }

    const { getEvmWalletsAssets, getWalletAssets, metrics, detectScam, RedisPricingCache, getChain } = await import("@wcore/core");
    const pricingCache = new RedisPricingCache(sharedCache);
    const intraScanPriceCache = new Map<string, Promise<any>>();

    // Group chains by VM type for batching. Previously used require() which
    // throws "require is not defined" under ESM ��� evmChains stayed empty and
    // every chain fell through to the non-EVM individual-scan path (no
    // Multicall3 batching, BASE timing out on multi-wallet scans).
    const evmChains = activeChains.filter(c => getChain(c)?.vm === "EVM");
    const nonEvmChains = activeChains.filter(c => !evmChains.includes(c));

    // For EVM chains, use batched multi-wallet scan
    const walletChainResults: Map<string, Map<string, WalletAssets>> = new Map();
    for (const addr of addresses) {
      walletChainResults.set(addr, new Map());
    }

    // Check scan result cache before calling RPCs (skip when forceRefresh).
    // For each (address, chain) pair, check if we have a fresh cached result.
    // Only uncached pairs trigger RPC calls via getEvmWalletsAssets.
    const cachedEvmByAddr = new Map<string, Map<string, WalletAssets>>();
    const uncachedEvmPairs: Array<{ chain: string; uncachedAddrs: string[] }> = [];
    if (!forceRefresh) {
      // Single mget round-trip for all (chain, address) pairs instead of N+�M gets.
      const pairs: Array<{ chain: string; addr: string }> = [];
      for (const chain of evmChains) for (const addr of addresses) pairs.push({ chain, addr });
      let cachedEntries: ((WalletAssets & { ts: number }) | undefined)[] = [];
      try {
        cachedEntries = await sharedCache.mget<WalletAssets & { ts: number }>(
          pairs.map(({ chain, addr }) => getScanResultCacheKey(addr, chain)),
        );
      } catch { cachedEntries = []; }
      const uncachedByChain = new Map<string, string[]>();
      pairs.forEach(({ chain, addr }, i) => {
        const cached = cachedEntries[i];
        if (cached && Date.now() - cached.ts < SCAN_RESULT_CACHE_TTL_MS) {
          const { ts: _ts, ...result } = cached;
          const assets = result as WalletAssets;
          if (hasCachedValue(assets) && !hasUnfinalizedDeFiAssets(chain, assets)) {
            if (!cachedEvmByAddr.has(addr)) cachedEvmByAddr.set(addr, new Map());
            cachedEvmByAddr.get(addr)!.set(chain, assets);
            return;
          }
          // Cached result has no value ��� skip and re-scan
        }
        if (!uncachedByChain.has(chain)) uncachedByChain.set(chain, []);
        uncachedByChain.get(chain)!.push(addr);
      });
      for (const chain of evmChains) {
        const uncachedAddrs = uncachedByChain.get(chain);
        if (uncachedAddrs && uncachedAddrs.length > 0) uncachedEvmPairs.push({ chain, uncachedAddrs });
      }
    } else {
      for (const chain of evmChains) {
        uncachedEvmPairs.push({ chain, uncachedAddrs: addresses.slice() });
      }
    }

    // Merge cached results into walletChainResults (skip RPC for these)
    for (const [addr, chainMap] of cachedEvmByAddr) {
      for (const [chain, assets] of chainMap) {
        walletChainResults.get(addr)?.set(chain, assets);
      }
    }

    // EVM batch scan with per-chain timeout ��� only for uncached pairs
    const evmScanPool = pLimit(SCAN_CONCURRENCY);
    const evmResults = await Promise.all(uncachedEvmPairs.map(({ chain, uncachedAddrs }) => evmScanPool(async () => {
      const timeoutMsg = `chain_timeout: ${chain} exceeded ${BATCH_CHAIN_TIMEOUT_MS}ms`;
      const engineCache = getEngineCacheForScan(forceRefresh, "EVM", sharedCache);
      let chainPromise: Promise<{ wallets: Array<{ address: string; assets: WalletAssets }> }> | undefined;
      try {
        const handle = runWithTimeout<{ wallets: Array<{ address: string; assets: WalletAssets }> }>((signal) => {
          const p = getEvmWalletsAssets(uncachedAddrs, chain, { cache: engineCache, sharedPriceCache: pricingCache, logBlockRange, customTokens, strictTokens, intraScanCache: intraScanPriceCache, forceRefresh, fxRate, signal });
          chainPromise = p;
          return p;
        }, BATCH_CHAIN_TIMEOUT_MS);
        const result = await handle.promise;
        const wallets = await Promise.all(result.wallets.map(async ({ address, assets }) => ({
          address,
          assets: await finalizeDeFiAssets(chain, address, assets),
        })));
        return { chain, wallets };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("chain_timeout")) {
          // chainPromise continues but the engine observed signal.aborted and
          // short-circuited its internal fetches. Cache the partial data if it
          // eventually lands.
          if (chainPromise) {
            chainPromise.then(async (batchResult) => {
              for (const { address, assets } of batchResult.wallets) {
                const finalized = await finalizeDeFiAssets(chain, address, assets);
                if (shouldCacheAssets(finalized)) {
                  const scanCacheKey = getScanResultCacheKey(address, chain);
                  sharedCache.set(scanCacheKey, { ...finalized, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
                }
              }
            }).catch(() => {});
          }
          metrics.recordChainTimeout(chain);
          getCircuitBreaker(chain).onFailure();
          return { chain, wallets: uncachedAddrs.map(addr => ({ address: addr, assets: { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [timeoutMsg], totalValueEur: 0, scanMs: 0 } })) };
        }
        metrics.recordOtherError(chain, msg);
        getCircuitBreaker(chain).onFailure();
        return { chain, wallets: uncachedAddrs.map(addr => ({ address: addr, assets: { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [msg], totalValueEur: 0, scanMs: 0 } })) };
      }
    })));

    for (const { chain, wallets } of evmResults) {
      for (const { address, assets } of wallets) {
        walletChainResults.get(address)?.set(chain, assets);
        // Write scan result cache so the next batch scan can skip this RPC call
        if (shouldCacheAssets(assets)) {
          const scanCacheKey = getScanResultCacheKey(address, chain);
          sharedCache.set(scanCacheKey, { ...assets, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
        }
      }
    }

    // Non-EVM chains (SVM, Cosmos): scan individually per (addr, chain).
    // Reads scan-result cache before hitting RPC, races against
    // BATCH_CHAIN_TIMEOUT_MS, and writes successful results back to cache.
    // Without this, every SVM/Cosmos scan re-hit flaky RPCs, producing
    // inconsistent results between retries (no consensus on SVM/Cosmos).
    if (nonEvmChains.length > 0) {
      const nonEvmScanPool = pLimit(NON_EVM_SCAN_CONCURRENCY);
      const NON_EVM_MAX_ATTEMPTS = apiConfig.scan.nonEvmMaxAttempts;

      // One mget round-trip for every (address, chain) pair, like the EVM path above.
      // Reading them one by one cost addresses x chains round-trips to Redis before a
      // single RPC call had been made.
      const servedFromCache = new Set<string>();
      if (!forceRefresh) {
        const pairs: Array<{ chain: string; addr: string }> = [];
        for (const addr of addresses) for (const chain of nonEvmChains) pairs.push({ chain, addr });
        let cachedEntries: ((WalletAssets & { ts: number }) | undefined)[] = [];
        try {
          cachedEntries = await sharedCache.mget<WalletAssets & { ts: number }>(
            pairs.map(({ chain, addr }) => getScanResultCacheKey(addr, chain)),
          );
        } catch { cachedEntries = []; }
        pairs.forEach(({ chain, addr }, i) => {
          const cached = cachedEntries[i];
          if (!cached || Date.now() - cached.ts >= SCAN_RESULT_CACHE_TTL_MS) return;
          const { ts: _ts, ...result } = cached;
          const assets = result as WalletAssets;
          // A cached result carrying no value is skipped and rescanned.
          if (!hasCachedValue(assets)) return;
          walletChainResults.get(addr)?.set(chain, assets);
          servedFromCache.add(`${addr}:${chain}`);
        });
      }

      await Promise.all(addresses.flatMap(addr =>
        nonEvmChains.map((chain) => nonEvmScanPool(async () => {
          if (servedFromCache.has(`${addr}:${chain}`)) return;


          // Scan with retry-on-degradation. SVM/Cosmos RPCs throttle and have
          // no consensus, so a single flaky call yields a false 0. Retry up to
          // NON_EVM_MAX_ATTEMPTS with backoff, keeping the best result seen.
          let best: WalletAssets | undefined;
          for (let attempt = 0; attempt < NON_EVM_MAX_ATTEMPTS; attempt++) {
            let assets: WalletAssets;
            try {
              const chainVm = getChain(chain)?.vm;
              const engineCache = getEngineCacheForScan(forceRefresh, chainVm, sharedCache);
              const handle = runWithTimeout<WalletAssets>((signal) => getWalletAssets(addr, chain, { cache: engineCache, sharedPriceCache: pricingCache, logBlockRange, customTokens, strictTokens, intraScanCache: intraScanPriceCache, forceRefresh, fxRate, signal }), BATCH_CHAIN_TIMEOUT_MS);
              assets = await handle.promise;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              assets = { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [msg], totalValueEur: 0, scanMs: 0 } as WalletAssets;
            }

            // Keep the result with value; otherwise remember the last attempt.
            if (hasCachedValue(assets)) { best = assets; break; }
            best = assets;
            // Retry only if the failure looks transient (RPC/throttle/timeout).
            if (attempt < NON_EVM_MAX_ATTEMPTS - 1 && isRetriableNonEvmResult(assets)) {
              await new Promise(r => setTimeout(r, 1500 + attempt * 1500));
              continue;
            }
            break;
          }

          const assets = best ?? ({ chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: ["scan_failed"], totalValueEur: 0, scanMs: 0 } as WalletAssets);
          walletChainResults.get(addr)?.set(chain, assets);
          // Write scan result cache so future scans can skip this (addr, chain) pair
          if (shouldCacheAssets(assets)) {
            const scanCacheKey = getScanResultCacheKey(addr, chain);
            sharedCache.set(scanCacheKey, { ...assets, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
          }
        }))
      ));
    }

    // Build results per wallet
    const walletResults: Array<{ address: string; chains: ChainScan[]; totals: { valueEur: number; tokenCount: number; pricedCount: number; chainsWithErrors: number } }> = [];

    for (const addr of addresses) {
      const chainResults = walletChainResults.get(addr) ?? new Map();
      const chains: ChainScan[] = [];
      let totalValueEur = 0;
      let totalTokens = 0;
      let totalPriced = 0;
      let chainsWithErrors = 0;

      for (const chain of requestedChains) {
        const assets = chainResults.get(chain);
        if (assets) {
          const chainScan = buildChainScan(chain, assets, fxRate);
          chainScan.totals.valueEur = calcCleanChainValue(chainScan, detectScam);
          chains.push(chainScan);
          totalValueEur += chainScan.totals.valueEur;
          totalTokens += chainScan.totals.tokenCount;
          totalPriced += chainScan.totals.pricedCount;
          if (chainScan.errors.length > 0) chainsWithErrors++;
        } else {
          chains.push({ chainKey: chain, chainName: chain, vm: "EVM", native: null, tokens: [], errors: [{ stage: "init", message: "circuit_open" }], degraded: true, fxRate, scanMs: 0, totals: { valueEur: 0, tokenCount: 0, pricedCount: 0 }, cachedAt: null, scriptVersion: "" });
        }
      }

      walletResults.push({
        address: addr,
        chains,
        totals: {
          valueEur: Math.round(totalValueEur * 100) / 100,
          tokenCount: totalTokens,
          pricedCount: totalPriced,
          chainsWithErrors,
        },
      });
    }

    return { wallets: walletResults, generatedAt: new Date().toISOString() };
  });

  // --- Async Scan ---

  app.post("/api/scan/async", async (req, reply) => {
    const bodyParsed = ScanRequestBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) { reply.code(400); return { error: "invalid_body", message: bodyParsed.error.issues[0]?.message ?? "invalid body" }; }
    const body = bodyParsed.data;
    const parsedAddress = AnyAddress.safeParse(body.address);
    if (!parsedAddress.success) { reply.code(400); return { error: "invalid_address", message: parsedAddress.error.issues[0]?.message ?? "invalid address" }; }

    const chainValidation = validateChains(body.chains);
    if (!chainValidation.ok) { reply.code(400); return { error: "invalid_chains", message: chainValidation.error }; }

    const asyncMaxChains = await resolveScanChainLimit(req.user?.id, getScanLimit, MAX_CHAINS_PER_SCAN, ANONYMOUS_MAX_CHAINS_PER_SCAN);
    if (chainValidation.chains.length > asyncMaxChains) { reply.code(400); return { error: "too_many_chains", message: `Max ${asyncMaxChains} chains` }; }

    if (!await chargeScanBudget(req, chainValidation.chains.length)) { reply.code(429); return budgetExceeded; }

    const requestedChains = chainValidation.chains;
    const openCircuits = requestedChains.filter((chain) => !getCircuitBreaker(chain).allowRequest());
    const activeChains = requestedChains.filter((chain) => getCircuitBreaker(chain).allowRequest());
    if (activeChains.length === 0) {
      const { metrics } = await import("@wcore/core");
      for (let i = 0; i < openCircuits.length; i++) metrics.recordCircuitBreakerTrip();
      reply.code(503);
      return { error: "circuit_open", message: `All ${openCircuits.length} requested chain(s) have open circuit breakers.` };
    }

    const principal = jobPrincipal({ userId: req.user?.id, ip: req.ip });
    const admission = admitScanJob(principal);
    if (!admission.ok) {
      reply.code(429);
      return admission.reason === "global"
        ? { error: "server_busy", message: "Too many scans in progress. Retry shortly." }
        : { error: "too_many_jobs", message: `Max ${admission.limit} concurrent scans. Wait for one to finish.` };
    }

    const jobId = randomBytes(16).toString("hex");
    const forceRefresh = typeof body.forceRefresh === "boolean" ? body.forceRefresh : false;
    const strictTokens = typeof body.strictTokens === "boolean" ? body.strictTokens : false;
    const logBlockRange = typeof body.deepScan === "boolean" && body.deepScan ? 200_000 : 5_000;
    const customTokens = await resolveCustomTokens(req.user?.id, body.customTokens);

    const fxResult = await fetchFxRate(sharedCache);
    if (typeof fxResult !== "number") { reply.code(fxResult.code); return fxResult.body; }
    const fxRate = fxResult;

    scanJobs.set(jobId, { jobId, address: parsedAddress.data, userId: req.user?.id, ip: req.ip, status: "running", chains: [...openCircuits.map(c => ({ chainKey: c, chainName: c, status: "error" as const, result: { chainKey: c, chainName: c, vm: "EVM" as const, native: null, tokens: [], errors: [{ stage: "init" as const, message: `circuit_open: Circuit breaker open for ${c}.` }], degraded: true, fxRate, scanMs: 0, totals: { valueEur: 0, tokenCount: 0, pricedCount: 0 }, cachedAt: null, scriptVersion: "" } })), ...activeChains.map(c => ({ chainKey: c, chainName: c, status: "pending" as const }))], totalEur: 0, tokenCount: 0, errors: [], createdAt: Date.now(), controller: new AbortController() });

    const { getWalletAssets, RedisPricingCache, detectScam, getChain } = await import("@wcore/core");
    const pricingCache = new RedisPricingCache(sharedCache);
    const asyncIntraScanCache = new Map<string, Promise<any>>();

    (async () => {
      const job = scanJobs.get(jobId);
      if (!job) return;

      // Promise pool with per-chain timeout to prevent BASE-like 720s+ hangs.
      // Each chain gets CHAIN_TIMEOUT_MS (default 90s). Timeouts are recorded
      // but the chain entry stays "error" so the job can still complete.
      const scanPool = pLimit(SCAN_CONCURRENCY);
      await Promise.all(activeChains.map((chain) => scanPool(async () => {
        const entry = job.chains.find(ch => ch.chainKey === chain);
        if (entry) entry.status = "scanning";
        let chainPromise: Promise<WalletAssets> | undefined;
        try {
          const engineCache = getEngineCacheForScan(forceRefresh, getChain(chain)?.vm, sharedCache);
          const handle = runWithTimeout<WalletAssets>((signal) => {
            const p = getWalletAssets(parsedAddress.data, chain, { cache: engineCache, sharedPriceCache: pricingCache, logBlockRange, customTokens, strictTokens, intraScanCache: asyncIntraScanCache, forceRefresh, fxRate, signal });
            chainPromise = p;
            return p;
          }, CHAIN_TIMEOUT_MS, job.controller.signal);
          const assets = await finalizeDeFiAssets(chain, parsedAddress.data, await handle.promise);
          const chainScan = buildChainScan(chain, assets, fxRate);
          const cleanValue = calcCleanChainValue(chainScan, detectScam);
          const scanErrors = chainScan.errors.map((e) => e.message);
          const tokens = chainScan.tokens;
          // Phase instrumentation for diagnosing slow chains (e.g. BASE 720s+)
          const phases = (assets as { phases?: { discoveryMs: number; balancesMs: number; pricingMs: number } }).phases;
          const pricedCount = chainScan.totals.pricedCount;
          if (phases) {
            console.log(`[scan] ${chain}: ${tokens.length}/${pricedCount} tokens (with balance/priced), clean=${cleanValue.toFixed(2)}EUR, discovery=${phases.discoveryMs}ms, balances=${phases.balancesMs}ms, pricing=${phases.pricingMs}ms, scan=${(assets as { scanMs?: number }).scanMs ?? 0}ms`);
          }
          if (entry) {
            entry.status = (scanErrors.length > 0 && tokens.length === 0) ? "error" : "done";
            entry.result = chainScan;
          }
          job.totalEur += cleanValue;
          job.tokenCount += chainScan.totals.tokenCount;
          for (const e of scanErrors) job.errors.push(`${chain}: ${e}`);

          // Write partial scan result cache so data survives even if the job
          // expires before all chains finish.
          if (shouldCacheAssets(assets)) {
            const scanCacheKey = getScanResultCacheKey(parsedAddress.data, chain);
            sharedCache.set(scanCacheKey, { ...assets, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
          }

          const outcome = chainCircuitOutcome({ errors: scanErrors, totalValueEur: assets.totalValueEur, tokens });
          applyChainCircuitOutcome(getCircuitBreaker(chain), { errors: scanErrors, totalValueEur: assets.totalValueEur, tokens });
          if (outcome === "failure") console.log(`[scan] ${chain}: failed (errors: ${scanErrors.slice(0, 2).join('; ')})`);
        } catch (e) {
          if (entry) entry.status = "error";
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("chain_timeout")) {
            metrics.recordChainTimeout(chain);
            const timeoutMsg = `chain_timeout: ${chain} exceeded ${CHAIN_TIMEOUT_MS}ms`;
            // chainPromise continues but the engine observed signal.aborted and
            // short-circuited its internal fetches. Cache the partial data if
            // it eventually lands.
            if (chainPromise) {
              chainPromise.then(async (assets) => {
                const finalized = await finalizeDeFiAssets(chain, parsedAddress.data, assets);
                if (shouldCacheAssets(finalized)) {
                  const scanCacheKey = getScanResultCacheKey(parsedAddress.data, chain);
                  sharedCache.set(scanCacheKey, { ...finalized, ts: Date.now() }, SCAN_RESULT_CACHE_TTL_MS).catch(() => {});
                }
              }).catch(() => {});
            }
            // Build a degraded ChainScan so the chain appears in polling results
            // instead of silently disappearing.
            if (entry) {
              const timeoutAssets: WalletAssets = { chain, chainName: chain, native: { symbol: "NATIVE", balance: 0, priceEur: null, valueEur: null }, tokens: [], errors: [timeoutMsg], totalValueEur: 0, scanMs: 0 };
              entry.result = buildChainScan(chain, timeoutAssets, fxRate);
            }
            job.errors.push(`${chain}: ${timeoutMsg}`);
            console.log(`[scan] ${chain}: exception - ${timeoutMsg}`);
          } else {
            job.errors.push(`${chain}: ${msg}`);
            console.log(`[scan] ${chain}: exception - ${msg}`);
          }
          getCircuitBreaker(chain).onFailure();
        }
      })));

      const currentJob = scanJobs.get(jobId);
      if (currentJob) {
        const completed = currentJob.chains.filter(ch => ch.status === "done").length;
        const errored = currentJob.chains.filter(ch => ch.status === "error").length;
        console.log(`[scan] Job ${jobId}: ${completed} done, ${errored} error, ${currentJob.chains.length} total`);
        currentJob.status = completed > 0 ? "done" : "error";
      }
      // Every chain has settled: release the signal so nothing stays linked to it.
      job.controller.abort();
    })().catch(err => { const currentJob = scanJobs.get(jobId); if (currentJob) { currentJob.status = "error"; currentJob.errors.push(String(err)); currentJob.controller.abort(); } });

    return { jobId, chains: requestedChains.length };
  });

  app.get("/api/scan/async/:jobId", async (req, reply) => {
    const { jobId } = ScanJobParamsSchema.parse(req.params);
    const job = scanJobs.get(jobId);
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    // Auth check: authenticated jobs require matching userId; anonymous jobs
    // require matching IP to prevent other users from reading their results.
    if (job.userId) {
      if (job.userId !== req.user?.id) return reply.code(404).send({ error: "job_not_found" });
    } else if (job.ip && job.ip !== req.ip) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    const done = job.chains.filter(c => c.status === "done" || c.status === "error").length;
    return { jobId: job.jobId, status: job.status, address: job.address, progress: { done, total: job.chains.length }, chains: job.chains.filter(c => c.result).map(c => c.result!), totalEur: Math.round(job.totalEur * 100) / 100, tokenCount: job.tokenCount, errors: job.errors.slice(0, 20) };
  });
}
