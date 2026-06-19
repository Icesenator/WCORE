import { getChain } from "../chains/index.js";
import { EvmRpc, RpcDispatcher, multicall, type MulticallCall, type MulticallResult } from "../rpc/index.js";
import { getRpcEndpoints } from "../rpc/endpoints.js";
import {
  decodeUint256,
  discoverTokensByTransferLogs,
  discoverTokensForWallet,
  discoverTokensFromExplorer,
  encodeBalanceOf,
  formatUnits,
  getErc20Metadata,
  getDiscoveryCacheKey,
  hasExplorerDiscovery,
} from "../tokens/index.js";
import type { DiscoveredToken, TokenDiscovery } from "../tokens/index.js";
import { prefetchTokenLogo, resolveTokenLogoCachedOrFallback } from "../tokens/index.js";
import {
  priceTokenCascade,
  type IntraScanCache,
  type PricingCache,
  type PricingSourceSet,
  type PricingToken,
} from "../pricing/index.js";
import type { CacheStore } from "../cache/index.js";
import { DISCOVERY_CACHE_TTL_MS } from "../cache/index.js";
import type { BalanceDecision, BalanceSource } from "../balances/index.js";
import type { CacheStats } from "./types.js";
import {
  DEFAULT_LOG_SCAN_BLOCKS,
  normalizeEvmAddress,
  normalizeChainKey,
  roundMoney,
  getNativeLogo,
  liveVote,
  cacheEntry,
  type EvmWalletToken,
  type EvmWalletAssets,
} from "./evm-types.js";
import { getRecentLogRange, readNativeBalance, canServeEmptyCache, readErc20Balance } from "./evm-balances.js";
import { sharedPriceCache, buildSources, priceNative, priceCacheKey } from "./evm-pricing.js";
import { cacheKey } from "@wcore/shared";

// ─── Multi-Wallet Batch Scan ────────────────────────────────────────────────

// Some EVM chains expose their native balance through precompile-like ERC-20
// addresses. They duplicate the native row and must not be shown as tokens.
const SKIP_NATIVE_PRECOMPILES = new Set([
  "0x0000000000000000000000000000000000001010", // POL/MATIC precompile (Polygon)
  "0x471ece3750da237f93b8e339c536989b8978a438", // CELO native token (Celo)
]);

export interface EvmWalletsAssetsResult {
  wallets: Array<{ address: string; assets: EvmWalletAssets }>;
  cacheStats: CacheStats;
}

/**
 * Scan multiple wallets on the same chain in a single pass.
 * Key optimization: ONE Multicall3 call for ALL wallets × ALL tokens
 * instead of N separate multicall batches.
 */
export async function getEvmWalletsAssets(
  addresses: string[],
  chainKey: string,
  opts: {
    dispatcher?: RpcDispatcher;
    rpc?: EvmRpc;
    sources?: PricingSourceSet;
    sharedPriceCache?: PricingCache;
    tokenDiscovery?: TokenDiscovery;
    fxRate?: number;
    cache?: CacheStore;
    logBlockRange?: number;
    customTokens?: string[];
    strictTokens?: boolean;
    intraScanCache?: IntraScanCache;
    forceRefresh?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<EvmWalletsAssetsResult> {
  const key = normalizeChainKey(chainKey);
  const chain = getChain(key);
  if (!chain || chain.vm !== "EVM") throw new Error(`unsupported EVM chain: ${chainKey}`);

  const endpoints = getRpcEndpoints(key);
  const priceCache = opts.sharedPriceCache ?? sharedPriceCache;
  if (!endpoints.length) throw new Error(`no RPC endpoints for ${key}`);

  const effectiveEndpoints = endpoints;
  const isDeepScan = opts.logBlockRange != null && opts.logBlockRange > 50_000;
  const rpcTimeout = isDeepScan ? 5000 : Number(chain.TIMEOUTS?.HTTP_MS ?? 2500);

  const dispatcher = opts.dispatcher ?? new RpcDispatcher(undefined, {
    minRpcs: Number(chain.RPC?.CONSENSUS_MIN_RPCS ?? 2),
    maxRpcs: Number(chain.RPC?.CONSENSUS_MAX_RPCS ?? 3),
    timeoutMs: rpcTimeout,
  });
  const rpc = opts.rpc ?? new EvmRpc(undefined, rpcTimeout);

  const normalizedAddresses = addresses.map(a => normalizeEvmAddress(a)).filter(Boolean) as string[];
  if (!normalizedAddresses.length) throw new Error("no valid EVM addresses");

  const t0 = Date.now();
  const cacheStats: CacheStats = { hits: 0, misses: 0, stale: 0, skipped: 0 };
  const disableNative = chain.FLAGS?.DISABLE_NATIVE_BALANCE === true;

  // Compute log range respecting chain's MAX_LOG_RANGE (e.g. BASE=2000 blocks).
  // Called once per chain — the block number is cached for 30s across wallets.
  const logBlockWindow = opts.logBlockRange ?? DEFAULT_LOG_SCAN_BLOCKS;
  const chainMaxLogRange = typeof chain.RPC?.MAX_LOG_RANGE === "number" ? chain.RPC.MAX_LOG_RANGE : undefined;
  const logRange = await getRecentLogRange(dispatcher, rpc, effectiveEndpoints, logBlockWindow, [], key, chainMaxLogRange);
  const currentBlock = parseInt(logRange.toBlock, 16) || 0;
  const pricingErrors: string[] = [];
  const walletErrors: Map<string, string[]> = new Map();

  // Step 1: Parallel discovery for all wallets.
  // Uses per-wallet discovery cache + incremental cursor + negative cache
  // to avoid re-scanning the full block history on every batch call.
  const discoveryResults = await Promise.all(
    normalizedAddresses.map(async (addr) => {
      const wErrors: string[] = [];

      // Negative cache: skip RPC entirely for known-empty (wallet, chain) pairs
      const hasCustomTokens = (opts.customTokens?.length ?? 0) > 0;
      const emptyCacheKey = opts.cache && !hasCustomTokens && !opts.forceRefresh ? cacheKey("emptyWallet", { chainKey: key.toLowerCase(), address: addr }) : undefined;
      if (opts.cache && emptyCacheKey) {
        try {
          const cachedEmpty = await opts.cache.get<unknown>(emptyCacheKey);
          if (cachedEmpty && await canServeEmptyCache(dispatcher, rpc, effectiveEndpoints, addr, key, opts.cache, disableNative)) {
            cacheStats.hits++;
            walletErrors.set(addr, ["[CACHED_EMPTY] wallet/chain has no assets within TTL"]);
            return { address: addr, tokens: [] as DiscoveredToken[], nativeSymbol: chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE", nativeLogo: getNativeLogo(chain), isEmpty: true, _empty: true };
          }
        } catch { /* cache miss — proceed with discovery */ }
      }

      // Read discovery cache (tokens + block cursor) for incremental scanning.
      // Skip when tokenDiscovery is provided (tests, custom providers) — same guard as single-wallet path.
      const discoveryCacheKey = opts.cache && !opts.tokenDiscovery ? getDiscoveryCacheKey(addr, key) : undefined;
      let cachedTokens: DiscoveredToken[] | undefined;
      let cachedBlock: number | undefined;
      if (opts.cache && discoveryCacheKey) {
        try {
          const results = await opts.cache.mget([discoveryCacheKey, `${discoveryCacheKey}:block`]);
          cachedTokens = (results[0] ?? undefined) as DiscoveredToken[] | undefined;
          cachedBlock = (results[1] ?? undefined) as number | undefined;
        } catch { /* cache miss */ }
      }
      const hasCachedDiscovery = Array.isArray(cachedTokens);

      // Narrow log range to the unseen delta when a valid cursor exists
      let fromBlock = logRange.fromBlock;
      if (cachedBlock != null && hasCachedDiscovery && currentBlock > cachedBlock) {
        fromBlock = `0x${(cachedBlock + 1).toString(16)}`;
      }

      // Fire-and-forget: write discovery cache + cursor in background.
      // Only when NOT using tokenDiscovery (aligned with single-wallet path guard).
      const writeDiscoveryCache = (finalTokens: DiscoveredToken[]) => {
        if (opts.cache && discoveryCacheKey && !opts.tokenDiscovery) {
          opts.cache.set(discoveryCacheKey, finalTokens, DISCOVERY_CACHE_TTL_MS).catch(() => {});
          if (currentBlock > 0) {
            opts.cache.set(`${discoveryCacheKey}:block`, currentBlock, DISCOVERY_CACHE_TTL_MS).catch(() => {});
          }
        }
      };

      try {
        const tokens = opts.tokenDiscovery
          ? await opts.tokenDiscovery.discoverTokensForWallet(addr, key)
          : await discoverTokensForWallet(addr, key, {
              cache: hasCachedDiscovery ? undefined : opts.cache,
              cacheKey: discoveryCacheKey,
              errors: wErrors,
              logDiscovery: () => discoverTokensByTransferLogs({
                address: addr,
                endpoints: effectiveEndpoints,
                dispatcher,
                rpc,
                fromBlock,
                toBlock: logRange.toBlock,
              }),
              explorerDiscovery: () => discoverTokensFromExplorer(addr, key, undefined, opts.cache),
              trustExplorerWhenClean: hasExplorerDiscovery(key),
              metadata: (contract) => getErc20Metadata({
                contract,
                endpoints,
                dispatcher,
                rpc,
                cache: opts.cache,
                chainKey: key,
                tokenDecimals: chain.RPC?.TOKEN_DECIMALS,
              }),
            });

        // Merge previously-cached tokens — same pattern as single-wallet.
        // The union is re-persisted so cached tokens survive even if the
        // new fetch is empty or partial.
        const merged = [...tokens];
        if (cachedTokens && cachedTokens.length > 0) {
          const seen = new Set(merged.map((t) => t.contract.toLowerCase()));
          for (const cached of cachedTokens) {
            if (!seen.has(cached.contract.toLowerCase())) {
              if (cached.symbol === "UNKNOWN" || cached.name === "Unknown Token") continue;
              merged.push(cached);
              seen.add(cached.contract.toLowerCase());
            }
          }
        }

        writeDiscoveryCache(merged);
        walletErrors.set(addr, wErrors);
        return { address: addr, tokens: merged, nativeSymbol: chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE", nativeLogo: getNativeLogo(chain), isEmpty: false, _empty: false };
      } catch {
        // On discovery failure, preserve cached tokens and write them back.
        // This prevents data loss when RPCs are temporarily unhealthy.
        const fallback = cachedTokens ?? [];
        if (fallback.length > 0) writeDiscoveryCache(fallback);
        wErrors.push("discovery failed; using cached tokens");
        walletErrors.set(addr, wErrors);
        return { address: addr, tokens: fallback, nativeSymbol: chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE", nativeLogo: getNativeLogo(chain), isEmpty: false, _empty: false };
      }
    }),
  );

  // Step 2: Separate discovery results into cache-hit vs active wallets.
  // Cache-hit = negative cache OR bal_cache shortcut (no tokens, cached balances).
  // Active = wallets that need fresh Multicall3 reads.
  const BALANCE_CACHE_TTL_MS = 3600_000;
  const hasCustomTokens = (opts.customTokens?.length ?? 0) > 0;
  const completedResults = new Map<string, EvmWalletAssets>();
  const activeAddresses: string[] = [];
  const activeTokenMap = new Map<string, DiscoveredToken>();

  for (const res of discoveryResults) {
    const addr = res.address;
    if (res._empty) {
      // Negative cache hit — wallet is empty on this chain
      completedResults.set(addr, {
        chain: key,
        chainName: chain.CHAIN?.NAME ?? key,
        native: { symbol: res.nativeSymbol, balance: 0, priceEur: null, valueEur: null, logoUrl: res.nativeLogo },
        tokens: [],
        errors: walletErrors.get(addr) ?? [],
        totalValueEur: 0,
        scanMs: Date.now() - t0,
        phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
        cacheStats: { hits: 1, misses: 0, stale: 0, skipped: 0 },
      });
      continue;
    }

      const tokenSet = opts.strictTokens && opts.customTokens?.length
        ? new Set(opts.customTokens.map((ct) => ct.trim().toLowerCase()).filter((ct) => /^0x[0-9a-f]{40}$/.test(ct)))
        : null;
      if (tokenSet) res.tokens = res.tokens.filter((t) => tokenSet.has(t.contract.toLowerCase()));
      const hasTokens = res.tokens.length > 0;
    if (!hasTokens && !hasCustomTokens && opts.cache) {
      // No tokens discovered — try balance cache shortcut
      const balCacheKey = `bal_cache:${key.toLowerCase()}:${addr}`;
      try {
        const cachedBal = await opts.cache.get<{
          nativeBalance: string;
          nativePriceEur: number | null;
          tokens: Array<{ contract: string; symbol: string; name: string; balance: string; decimals: number; priceEur: number | null }>;
          block: number;
          ts: number;
        }>(balCacheKey);
        if (cachedBal && (Date.now() - cachedBal.ts) < BALANCE_CACHE_TTL_MS) {
          cacheStats.hits++;
          const nd = Number(chain.CHAIN?.NATIVE_DECIMALS ?? 18);
          const nb = Number(formatUnits(BigInt(cachedBal.nativeBalance), nd));
          const tokenResults: EvmWalletToken[] = cachedBal.tokens.map(t => ({
            contract: t.contract, symbol: t.symbol, name: t.name,
            balance: Number(t.balance), decimals: t.decimals, priceEur: t.priceEur,
            valueEur: t.priceEur != null ? roundMoney(Number(t.balance) * t.priceEur) : null,
          }));
          const nve = cachedBal.nativePriceEur != null ? roundMoney(nb * cachedBal.nativePriceEur) : null;
          completedResults.set(addr, {
            chain: key, chainName: chain.CHAIN?.NAME ?? key,
            native: { symbol: res.nativeSymbol, balance: nb, priceEur: cachedBal.nativePriceEur, valueEur: nve, logoUrl: res.nativeLogo },
            tokens: tokenResults,
            errors: ["[BAL_CACHE] No activity since last scan"],
            totalValueEur: roundMoney((nve ?? 0) + tokenResults.reduce((s, t) => s + (t.valueEur ?? 0), 0)),
            scanMs: Date.now() - t0,
            phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
            cacheStats: { hits: 1, misses: 0, stale: 0, skipped: 0 },
          });
          continue;
        }
      } catch { /* cache miss — proceed with full scan */ }
      cacheStats.misses++;
    }

    // Active wallet — needs fresh balances
    activeAddresses.push(addr);
    for (const t of res.tokens) {
      const c = t.contract.toLowerCase();
      if (SKIP_NATIVE_PRECOMPILES.has(c)) continue;
      if (!activeTokenMap.has(c)) activeTokenMap.set(c, t);
    }
  }

  // Add registry tokens to active token pool
  const tokenRegistry = chain.TOKEN_REGISTRY;
  const registryEntries = tokenRegistry && typeof tokenRegistry === "object" ? Object.entries(tokenRegistry) : [];
  for (const [contract, info] of registryEntries) {
    const c = contract.toLowerCase();
    if (SKIP_NATIVE_PRECOMPILES.has(c)) continue;
    if (!activeTokenMap.has(c) && info && typeof info === "object") {
      const meta = info as { symbol?: string; name?: string; decimals?: number };
      activeTokenMap.set(c, { contract: c, symbol: meta.symbol || "", name: meta.name || "", decimals: meta.decimals ?? 18 });
    }
  }
  if (opts.customTokens?.length) {
    for (const c of opts.customTokens) {
      const contract = c.toLowerCase();
      if (SKIP_NATIVE_PRECOMPILES.has(contract)) continue;
      if (!activeTokenMap.has(contract)) {
        activeTokenMap.set(contract, { contract, symbol: "", name: "", decimals: 18 });
      }
    }
  }

  const allTokens = Array.from(activeTokenMap.values());
  const allActive = activeAddresses.length > 0;

  // If no active wallets, merge completed + empty results and return
  if (!allActive) {
    const allWallets: Array<{ address: string; assets: EvmWalletAssets }> = [];
    for (const addr of normalizedAddresses) {
      const done = completedResults.get(addr);
      if (done) { allWallets.push({ address: addr, assets: done }); continue; }
      const wErrs = walletErrors.get(addr) ?? [];
      allWallets.push({ address: addr, assets: {
        chain: key, chainName: chain.CHAIN?.NAME ?? key,
        native: { symbol: chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE", balance: 0, priceEur: null, valueEur: null },
        tokens: [], errors: wErrs, totalValueEur: 0, scanMs: Date.now() - t0,
        phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
        cacheStats: { hits: 0, misses: 0, stale: 0, skipped: 0 },
      }});
    }
    return { wallets: allWallets, cacheStats };
  }

  // Step 3: Batch balance reads for active wallets into ONE Multicall3 call
  // Calls: [wallet0-token0, wallet0-token1, ..., wallet1-token0, wallet1-token1, ...]
  const balanceCalls: MulticallCall[] = [];
  for (const addr of activeAddresses) {
    for (const t of allTokens) {
      balanceCalls.push({ target: t.contract, callData: encodeBalanceOf(addr) });
    }
  }

  const balancesStart = Date.now();
  const balanceResults: MulticallResult[] = [];
  if (balanceCalls.length > 0) {
    const MULTICALL_CHUNK_SIZE = 500;
    for (let i = 0; i < balanceCalls.length; i += MULTICALL_CHUNK_SIZE) {
      const chunk = balanceCalls.slice(i, i + MULTICALL_CHUNK_SIZE);
      const res = await multicall(rpc, dispatcher, effectiveEndpoints, chunk);
      balanceResults.push(...res);
    }
  }

  // Retry multicall misses once
  const missIndices: number[] = [];
  for (let i = 0; i < balanceResults.length; i++) {
    const r = balanceResults[i];
    if (!r || !r.success || !r.returnData || r.returnData === "0x") missIndices.push(i);
  }
  if (missIndices.length > 0 && missIndices.length < balanceResults.length) {
    const retryCalls = missIndices.map((idx) => balanceCalls[idx]!);
    try {
      const retryResults: MulticallResult[] = [];
      const MULTICALL_CHUNK_SIZE = 500;
      for (let i = 0; i < retryCalls.length; i += MULTICALL_CHUNK_SIZE) {
        const chunk = retryCalls.slice(i, i + MULTICALL_CHUNK_SIZE);
        const res = await multicall(rpc, dispatcher, effectiveEndpoints, chunk);
        retryResults.push(...res);
      }
      for (let i = 0; i < missIndices.length; i++) {
        const r = retryResults[i];
        if (r?.success && r.returnData && r.returnData !== "0x") {
          balanceResults[missIndices[i]!] = r;
        }
      }
    } catch { /* retry failed — per-token fallback handles them */ }
  }
  const balancesMs = Date.now() - balancesStart;

  // Step 4: Decode results per active wallet + fire-and-forget per-token cache writes.
  // Uses per-token fallback (readErc20Balance) when Multicall3 returns empty/missed
  // data, matching the single-wallet path behavior. Grouped by BALANCE_FALLBACK_CONCURRENCY
  // to avoid serial RPC noise on per-token consensus reads (~3 RPCs each).
  const tokenCount = allTokens.length;
  const walletBalances: Map<string, Array<{ token: DiscoveredToken; balance: number }>> = new Map();
  const PER_TOKEN_FALLBACK_CONCURRENCY = 10;

  for (let wi = 0; wi < activeAddresses.length; wi++) {
    const addr = activeAddresses[wi]!;
    const balances: Array<{ token: DiscoveredToken; balance: number }> = [];
    const baseIdx = wi * tokenCount;

    for (let batchStart = 0; batchStart < allTokens.length; batchStart += PER_TOKEN_FALLBACK_CONCURRENCY) {
      const batch = allTokens.slice(batchStart, batchStart + PER_TOKEN_FALLBACK_CONCURRENCY);
      const resolved = await Promise.all(batch.map(async (token, offset) => {
        const idx = baseIdx + batchStart + offset;
        const result = balanceResults[idx];

        let raw: bigint | null = null;
        if (result?.success && result.returnData && result.returnData !== "0x") {
          try { raw = decodeUint256(result.returnData); } catch { /* decode failed — fall through */ }
        }

        // Per-token fallback: Multicall3 missed (or returned "0x") → consensus eth_call.
        // This mirrors the single-wallet behavior where tokens whose Multicall3 result
        // is empty get a full per-token RPC consensus read.
        if (raw === null) {
          try {
            const ercDecision = await readErc20Balance(dispatcher, rpc, effectiveEndpoints, token.contract, addr, key, opts.cache);
            if (ercDecision.skipped) return null;
            raw = ercDecision.decision.raw;
            // P1-7: Propagate [DEGRADED] balance errors into per-wallet errors,
            // matching the single-wallet path behavior.
            if (ercDecision.decision.degraded && ercDecision.decision.source !== "none") {
              const wErrs = walletErrors.get(addr) ?? [];
              wErrs.push(`[DEGRADED] ${token.symbol || token.contract.slice(0, 8)} balance: ${ercDecision.decision.reason}, using ${ercDecision.decision.source} fallback`);
              walletErrors.set(addr, wErrs);
            }
          } catch {
            return null; // readErc20Balance threw — skip this token
          }
        }

        // P1-6: Write zero to cache when Multicall confirms balance is zero,
        // preventing stale positive cache from resurrection on future RPC failures.
        if (raw === 0n && opts.cache && result?.success && result.returnData && result.returnData !== "0x") {
          const zeroDecision: BalanceDecision = {
            raw: 0n, source: "multicall", confidence: 0.9, degraded: false, reason: "live_consensus",
            votes: [liveVote("multicall", 0n, true, 0.9)],
          };
          opts.cache.set(`token:${key.toLowerCase()}:${token.contract.toLowerCase()}:${addr}`, cacheEntry(zeroDecision), 3600_000).catch(() => {});
        }

        if (raw === 0n) return null;

        // Fire-and-forget per-token balance cache
        if (opts.cache) {
          const decision: BalanceDecision = {
            raw, source: "multicall", confidence: 0.9, degraded: false, reason: "live_consensus",
            votes: [liveVote("multicall", raw, true, 0.9)],
          };
          opts.cache.set(`token:${key.toLowerCase()}:${token.contract.toLowerCase()}:${addr}`, cacheEntry(decision), 3600_000).catch(() => {});
        }
        const explicitDecimals = chain.RPC?.TOKEN_DECIMALS?.[token.contract.toLowerCase()];
        const effectiveDecimals = explicitDecimals != null ? explicitDecimals : token.decimals;
        const balance = Number(formatUnits(raw, effectiveDecimals));
        return balance > 0 ? { token, balance } : null;
      }));

      for (const item of resolved) {
        if (item) balances.push(item);
      }
    }

    walletBalances.set(addr, balances);
  }

  // Step 5: Native balance for active wallets (parallel)
  // readNativeBalance handles its own native:{chain}:{addr} cache read/write
  const nativeDecisions = await Promise.all(
    activeAddresses.map(async (addr) => {
      try {
        const decision = disableNative
          ? { raw: 0n, source: "none" as BalanceSource, confidence: 0, degraded: false, reason: "disabled", votes: [] }
          : await readNativeBalance(dispatcher, rpc, effectiveEndpoints, addr, key, opts.cache);
        return { address: addr, decision };
      } catch {
        return { address: addr, decision: { raw: 0n, source: "none" as BalanceSource, confidence: 0, degraded: false, reason: "error", votes: [] } };
      }
    }),
  );

  // P1-7: Propagate native balance [DEGRADED] errors into per-wallet errors,
  // matching the single-wallet path behavior.
  for (const { address: addr, decision } of nativeDecisions) {
    if (decision.degraded && decision.source !== "none") {
      const wErrs = walletErrors.get(addr) ?? [];
      wErrs.push(`[DEGRADED] native balance: ${decision.reason}, using ${decision.source} fallback`);
      walletErrors.set(addr, wErrs);
    }
  }

  // Step 6: Price all unique tokens (shared across wallets)
  const pricingStart = Date.now();
  if (!opts.fxRate) throw new Error("FX rate required in opts (use getEurUsdRate from ./fx.js)");
  const fxRate: number = opts.fxRate;
  const sources = opts.sources ?? buildSources(priceCache, chain, opts.cache);
  const priceMap = new Map<string, { priceEur: number | null; symbol: string; name: string; logoUrl?: string }>();

  // Collect tokens that have a balance in at least one active wallet
  const tokensToPrice = new Map<string, DiscoveredToken>();
  for (const addr of activeAddresses) {
    const balances = walletBalances.get(addr) ?? [];
    for (const { token } of balances) {
      const c = token.contract.toLowerCase();
      if (!tokensToPrice.has(c)) tokensToPrice.set(c, token);
    }
  }

  const tokensToPriceArray = Array.from(tokensToPrice.values());
  const pricedTokens: Array<{ contract: string; priceEur: number | null; symbol: string; name: string; logoUrl?: string }> = [];

  const livePrefetchedPriceContracts = new Set<string>();
  const skipBulkLlama = chain.CHAIN?.SKIP_LLAMA_BATCH === true || chain.key === "GNOSIS";
  if (!skipBulkLlama && tokensToPriceArray.length > 0 && typeof sources.defillama.batchTokenPrices === "function") {
    const llamaSlug = String(chain.CHAIN?.LLAMA_CHAIN_SLUG ?? chain.CHAIN?.DEX_SLUG ?? "");
    if (llamaSlug) {
      const contracts = tokensToPriceArray.map((token) => token.contract);
      try {
        const batchPrices = await sources.defillama.batchTokenPrices(llamaSlug, contracts);
        if (batchPrices.size > 0) {
          const nowMs = Date.now();
          await Promise.all(Array.from(batchPrices).map(async ([contract, priceUsd]) => {
            const priceEur = priceUsd * fxRate;
            if (priceEur > 0) {
              await priceCache.setPrice(priceCacheKey(chain, String(contract)), { priceEur, ts: nowMs, source: "llama-batch" });
              livePrefetchedPriceContracts.add(String(contract).toLowerCase());
            }
          }));
        }
      } catch {
        // degrade to per-token cascade on batch failure
      }
    }
  }

  const skipBulkGt = chain.key === "GNOSIS";
  if (!skipBulkGt && tokensToPriceArray.length > 0 && typeof sources.geckoterminal.batchTokenPrices === "function") {
    const gtNetwork = String(chain.CHAIN?.GT_NETWORK ?? chain.CHAIN?.DEX_SLUG ?? chain.key);
    const contracts = tokensToPriceArray.map((token) => token.contract);
    try {
      const batchPrices = await sources.geckoterminal.batchTokenPrices(gtNetwork, contracts);
      if (batchPrices instanceof Map && batchPrices.size > 0) {
        const nowMs = Date.now();
        await Promise.all(Array.from(batchPrices).map(async ([contract, priceUsd]) => {
          const priceEur = priceUsd * fxRate;
          if (priceEur > 0) {
            await priceCache.setPrice(priceCacheKey(chain, String(contract)), { priceEur, ts: nowMs, source: "gt-batch" });
            livePrefetchedPriceContracts.add(String(contract).toLowerCase());
          }
        }));
      }
    } catch {
      // degrade to per-token GT on batch failure
    }
  }

  const PRICE_CONCURRENCY = 10;
  for (let i = 0; i < tokensToPriceArray.length; i += PRICE_CONCURRENCY) {
    const group = tokensToPriceArray.slice(i, i + PRICE_CONCURRENCY);
    const resolvedGroup = await Promise.all(
      group.map(async (token) => {
        const pricingToken: PricingToken = {
          key: priceCacheKey(chain, token.contract),
          contract: token.contract,
          symbol: token.symbol,
          name: token.name,
          chain,
          isStable: token.source === "registry" && ["USDC", "USDT", "DAI", "USDC.e", "USDT.e", "FRAX", "LUSD", "sDAI"].includes(token.symbol),
          peg: "USD",
        };
        const priced = await priceTokenCascade({
          token: pricingToken,
          fxRate,
          cache: priceCache,
          sources,
          allowCoinGeckoTokenFallback: true,
          skipCache: (opts.forceRefresh && !livePrefetchedPriceContracts.has(token.contract.toLowerCase())) || chain.key === "GNOSIS",
          intraScanCache: opts.intraScanCache,
        });
        if (priced.reason) pricingErrors.push(`${token.symbol} price: ${priced.reason}`);
        // Resolve a logo for tokens discovered without one (e.g. via log scanning),
        // mirroring the single-wallet path (evm-pricing.ts). Without this, the batch
        // engine — used by the multi-wallet scan table — returned logoUrl=undefined
        // for well-known tokens, leaving a blank colored circle in the UI.
        let logoUrl = token.logoUrl;
        if (!logoUrl) {
          const logoParams = { symbol: token.symbol, chainKey: chain.key, contract: token.contract, cache: opts.cache };
          logoUrl = await resolveTokenLogoCachedOrFallback(logoParams);
          // Single-flight background HTTP resolution so the next scan upgrades to the
          // high-quality logo (Blockscout/DexScreener) without blocking this scan.
          prefetchTokenLogo(logoParams);
        }
        return { contract: token.contract.toLowerCase(), priceEur: priced.priceEur, symbol: token.symbol || "", name: token.name || "", logoUrl };
      }),
    );
    pricedTokens.push(...resolvedGroup);
  }

  for (const p of pricedTokens) {
    priceMap.set(p.contract, p);
  }

  const pricingMs = Date.now() - pricingStart;

  // Step 7: Build wallet assets — merge completed (cache-hit) + active results.
  // Per-wallet errors = walletErrors[addr] (discovery) + pricing errors.
  // Write negative cache for truly empty wallets + balance cache for active wallets.
  const wallets: Array<{ address: string; assets: EvmWalletAssets }> = [];
  // Buffer cache writes and flush in a single Redis pipeline at the end of the
  // batch (PERF-3). With 20 wallets this turns up to 40 individual round-trips
  // into one. Falls back to per-write set() when pipeline is unavailable.
  const cacheWrites: Array<{ key: string; value: unknown; ttlMs: number }> = [];

  for (const addr of normalizedAddresses) {
    // Return completed (cache-hit) results directly
    const done = completedResults.get(addr);
    if (done) { wallets.push({ address: addr, assets: done }); continue; }

    const balances = walletBalances.get(addr) ?? [];
    const nativeDecision = nativeDecisions.find(n => n.address === addr)?.decision;
    const nativeRaw = nativeDecision?.raw ?? 0n;

    // Price native token
    const nativePrice = await priceNative(chain, nativeRaw, fxRate, sources, priceCache, [], opts.intraScanCache, opts.forceRefresh);

    const tokens: EvmWalletToken[] = [];
    let totalValueEur = nativePrice.valueEur ?? 0;

    for (const { token, balance } of balances) {
      const priceInfo = priceMap.get(token.contract.toLowerCase());
      if (!priceInfo) continue;

      const priceEur = priceInfo.priceEur;
      const valueEur = priceEur != null ? roundMoney(balance * priceEur) : null;
      if (valueEur != null) totalValueEur += valueEur;

      tokens.push({
        contract: token.contract,
        symbol: priceInfo.symbol || token.symbol || "",
        name: priceInfo.name || token.name || "",
        balance,
        decimals: token.decimals,
        priceEur,
        valueEur,
        logoUrl: priceInfo.logoUrl,
      });
    }

    // Merge per-wallet discovery errors + shared pricing errors
    const wErrs = walletErrors.get(addr) ?? [];
    const allErrs = [...wErrs, ...pricingErrors];

    // Write negative cache for wallets that truly have nothing after scan.
    // Only when scan is completely clean (no errors at all). Any error means
    // the scan may be incomplete and the wallet might not actually be empty.
    const emptyCacheKey = opts.cache && !hasCustomTokens ? cacheKey("emptyWallet", { chainKey: key.toLowerCase(), address: addr }) : undefined;
    if (opts.cache && emptyCacheKey && nativePrice.balance === 0 && tokens.length === 0 && allErrs.length === 0) {
        const EMPTY_TTL_MS = 60 * 60 * 1000; // 1h — avoid re-scanning truly empty wallets every 10min
        cacheWrites.push({ key: emptyCacheKey, value: {
          chain: key.toLowerCase(),
          chainName: String(chain.CHAIN?.NAME ?? key),
          nativeSymbol: nativePrice.symbol,
          nativeLogo: nativePrice.logoUrl,
        }, ttlMs: EMPTY_TTL_MS });
      }

    // Buffer balances for no-TX shortcut on next scan (flushed via pipeline below)
    if (opts.cache && !hasCustomTokens) {
      const balCacheKey = `bal_cache:${key.toLowerCase()}:${addr}`;
      cacheWrites.push({ key: balCacheKey, value: {
        nativeBalance: String(nativeRaw),
        nativePriceEur: nativePrice.priceEur,
        tokens: tokens.map(t => ({ contract: t.contract, symbol: t.symbol, name: t.name, balance: String(t.balance), decimals: t.decimals, priceEur: t.priceEur })),
        block: currentBlock || 0,
        ts: Date.now(),
      }, ttlMs: BALANCE_CACHE_TTL_MS });
    }

    wallets.push({
      address: addr,
      assets: {
        chain: key,
        chainName: chain.CHAIN?.NAME ?? key,
        native: nativePrice,
        tokens,
        errors: allErrs,
        totalValueEur: roundMoney(totalValueEur),
        scanMs: Date.now() - t0,
        phases: { nativeMs: 0, discoveryMs: 0, balancesMs, pricingMs },
        cacheStats: { ...cacheStats },
      },
    });
  }

  // Flush all buffered cache writes in a single pipeline (fire-and-forget).
  // Fall back to individual set() calls when pipeline is unavailable (test mocks).
  if (opts.cache && cacheWrites.length > 0) {
    if (typeof opts.cache.pipeline === "function") {
      opts.cache.pipeline(cacheWrites).catch(() => {});
    } else {
      for (const w of cacheWrites) opts.cache.set(w.key, w.value, w.ttlMs).catch(() => {});
    }
  }

  return { wallets, cacheStats };
}
