import { getChain } from "../chains/index.js";
import { EvmRpc, RpcDispatcher, multicall, type MulticallCall } from "../rpc/index.js";
import { rpcHealth } from "../rpc/rpc-health.js";
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
  registryTokenDiscovery,
  getKnownTokensForChain,
} from "../tokens/index.js";
import { getCompoundV3Tokens } from "../defi/compound-v3.js";
import type { DiscoveredToken, TokenDiscovery } from "../tokens/index.js";
import {
  GeckoTerminalPriceSource,
  OnchainV3PriceSource,
  RealTPriceSource,
  type IntraScanCache,
  type PricingCache,
  type PricingSourceSet,
} from "../pricing/index.js";
import type { OnchainV3Rpc } from "../pricing/sources/onchain-v3.js";
import type { CacheStore } from "../cache/index.js";
import { DISCOVERY_CACHE_TTL_MS } from "../cache/index.js";
import type { BalanceDecision, BalanceSource } from "../balances/index.js";
import {
  DEFAULT_LOG_SCAN_BLOCKS,
  normalizeEvmAddress,
  normalizeChainKey,
  roundMoney,
  pushBalanceDecisionError,
  liveVote,
  cacheEntry,
  type WalletAssetPrice,
  type EvmWalletToken,
  type EvmWalletAssets,
} from "./evm-types.js";
import { getRecentLogRange, readNativeBalance, canServeEmptyCache, readErc20Balance } from "./evm-balances.js";
import { sharedPriceCache, defaultSources, priceNative, priceToken, priceCacheKey } from "./evm-pricing.js";
import { cacheKey } from "@wcore/shared";

export function normalizeBalanceSelectorExtraArgs(args: string[] | undefined): string[] | null | undefined {
  if (args === undefined) return undefined;
  if (!Array.isArray(args)) return null;
  const out: string[] = [];
  for (const arg of args) {
    const hex = String(arg || "").replace(/^0x/i, "");
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      out.push(`0x${hex.toLowerCase()}`);
      continue;
    }
    if (/^[0-9a-fA-F]{40}$/.test(hex)) {
      out.push(`0x${hex.toLowerCase().padStart(64, "0")}`);
      continue;
    }
    return null;
  }
  return out;
}

export function discoveredTokenVariantKey(token: Pick<DiscoveredToken, "contract" | "balanceSelector" | "balanceSelectorExtraArgs">): string {
  return `${token.contract.toLowerCase()}:${(token.balanceSelector || "").toLowerCase()}:${(token.balanceSelectorExtraArgs || []).join(",").toLowerCase()}`;
}

export function normalizeCachedDiscoveryTokens(tokens: unknown, errors: string[]): DiscoveredToken[] | undefined {
  if (!Array.isArray(tokens)) return undefined;
  const out: DiscoveredToken[] = [];
  for (const token of tokens as DiscoveredToken[]) {
    // Compound positions are rebuilt from Comet on every scan. Persisted V1
    // entries used the collateral asset as the call target and must not survive.
    if (token?.defi?.protocol === "compound-v3") continue;
    if (!token?.balanceSelector) {
      out.push(token);
      continue;
    }
    const extraArgs = normalizeBalanceSelectorExtraArgs(token.balanceSelectorExtraArgs);
    if (extraArgs === null) {
      errors.push(`[cache] invalid balance selector extra args skipped: ${token.symbol || token.contract}`);
      continue;
    }
    out.push({ ...token, ...(extraArgs !== undefined ? { balanceSelectorExtraArgs: extraArgs } : {}) });
  }
  return out;
}

export async function getEvmWalletAssets(
  address: string,
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
  } = {},
): Promise<EvmWalletAssets> {
  const normalizedAddress = normalizeEvmAddress(address);
  if (!normalizedAddress) throw new Error("invalid EVM address");

  const key = normalizeChainKey(chainKey);
  const chain = getChain(key);
  if (!chain || chain.vm !== "EVM") throw new Error(`unsupported EVM chain: ${chainKey}`);

  const endpoints = getRpcEndpoints(key);
  const priceCache = opts.sharedPriceCache ?? sharedPriceCache;
  if (!endpoints.length) throw new Error(`no RPC endpoints for ${key}`);

  // Filter endpoints using shared health cache
  const effectiveEndpoints = endpoints;

  const isDeepScan = opts.logBlockRange != null && opts.logBlockRange > 50_000;
  const rpcTimeout = isDeepScan ? 5000 : Number(chain.TIMEOUTS?.HTTP_MS ?? 2500);

  const dispatcher = opts.dispatcher ?? new RpcDispatcher(undefined, {
    minRpcs: Number(chain.RPC?.CONSENSUS_MIN_RPCS ?? 2),
    maxRpcs: Number(chain.RPC?.CONSENSUS_MAX_RPCS ?? 3),
    timeoutMs: rpcTimeout,
  });
  const rpc = opts.rpc ?? new EvmRpc(undefined, rpcTimeout);

  const onchainRpc: OnchainV3Rpc = {
    async batch(calls) {
      const ethCalls = calls.map((c) => ({ method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
      try {
        const results = await Promise.any(
          effectiveEndpoints.map(async (endpoint) => {
            const results = await rpc.batch(endpoint, ethCalls, { timeoutMs: 5000 });
            const mapped = results.map((r) => (r && "result" in r && typeof r.result === "string") ? r.result : null);
            rpcHealth.recordSuccess(key, endpoint);
            return mapped;
          }),
        );
        return results;
      } catch {
        for (const ep of effectiveEndpoints) rpcHealth.recordFailure(key, ep);
        return calls.map(() => null);
      }
    },
  };

  const cache = opts.cache;
  const sources = opts.sources ?? {
    ...defaultSources,
    geckoterminal: new GeckoTerminalPriceSource(priceCache),
    onchainV3: new OnchainV3PriceSource({ cache: priceCache, rpc: onchainRpc }),
    realt: new RealTPriceSource(cache),
  };
  const tokenDiscovery = opts.tokenDiscovery ?? registryTokenDiscovery;
  if (!opts.fxRate) throw new Error("FX rate required in opts (use getEurUsdRate from ./fx.js)");
  const fxRate: number = opts.fxRate;
  const logBlockWindow = opts.logBlockRange ?? DEFAULT_LOG_SCAN_BLOCKS;
  const errors: string[] = [];

  const startTime = Date.now();
  const disableNative = chain.FLAGS?.DISABLE_NATIVE_BALANCE === true;

  // Negative cache: empty wallet/chain results are cached for a short TTL so
  // repeated scans of inactive (wallet, chain) pairs skip the full RPC cascade.
  const hasCustomTokens = (opts.customTokens?.length ?? 0) > 0;
  const emptyCacheKey = cache && !hasCustomTokens && !opts.forceRefresh ? cacheKey("emptyWallet", { chainKey: key.toLowerCase(), address: normalizedAddress }) : undefined;
  if (cache && emptyCacheKey) {
    const cachedEmpty = await cache.get<{ chain: string; chainName: string; nativeSymbol: string; nativeLogo?: string }>(emptyCacheKey);
    if (cachedEmpty && await canServeEmptyCache(dispatcher, rpc, effectiveEndpoints, normalizedAddress, key, cache, disableNative)) {
      const scanMs = Date.now() - startTime;
      return {
        chain: cachedEmpty.chain,
        chainName: cachedEmpty.chainName,
        native: { symbol: cachedEmpty.nativeSymbol, balance: 0, priceEur: null, valueEur: null, logoUrl: cachedEmpty.nativeLogo },
        tokens: [],
        errors: ["[CACHED_EMPTY] wallet/chain has no assets within TTL"],
        totalValueEur: 0,
        scanMs,
        phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
        cacheStats: { hits: 1, misses: 0, stale: 0, skipped: 0 },
      };
    }
  }

  // Phase A (native) and Phase B (discovery) run in parallel — independent.
  const nativeStart = Date.now();
  const nativePromise: Promise<{ native: WalletAssetPrice; nativeMs: number; nativeRaw: bigint }> = (async () => {
    const nativeDecision = disableNative
      ? { raw: 0n, source: "none" as BalanceSource, confidence: 0, degraded: false, reason: "disabled", votes: [] }
      : await readNativeBalance(dispatcher, rpc, effectiveEndpoints, normalizedAddress, key, cache);
    const nativeBalance = nativeDecision.raw;
    pushBalanceDecisionError(errors, "native", nativeDecision);

    const native = await priceNative(chain, nativeBalance, fxRate, sources, priceCache, errors, opts.intraScanCache, opts.forceRefresh);
    return { native, nativeMs: Date.now() - nativeStart, nativeRaw: nativeBalance };
  })();

  // Read incremental discovery state. We merge cached tokens ourselves and
  // overwrite the cache atomically at the end of the scan, so we never delete
  // the cursor preemptively (a mid-scan failure would otherwise lose it).
  const discoveryKey = cache ? getDiscoveryCacheKey(normalizedAddress, key) : undefined;
  let cachedDiscoveryTokens: DiscoveredToken[] | undefined;
  let cachedLastBlock: number | undefined;
  if (cache && discoveryKey && !opts.tokenDiscovery) {
    try {
      const results = await cache.mget([discoveryKey, `${discoveryKey}:block`]);
      cachedDiscoveryTokens = normalizeCachedDiscoveryTokens(results[0], errors);
      cachedLastBlock = results[1] as number | undefined;
    } catch { /* cache miss */ }
  }
  const hasCachedDiscovery = Array.isArray(cachedDiscoveryTokens);

  // Always include the local registry tokens (covers non-ERC-20 contracts that
  // need a custom balanceSelector and would otherwise be skipped). New registry
  // entries appear on the next scan without needing to bust the 24h discovery
  // cache. Existing entries are deduplicated against the discovered set below.
  if (!opts.tokenDiscovery) {
    const registryTokens = await getKnownTokensForChain(key);
    const merged = Array.isArray(cachedDiscoveryTokens) ? [...cachedDiscoveryTokens] : [];
    const seen = new Set(merged.map((t) => discoveredTokenVariantKey(t)));
    for (const t of registryTokens) {
      const k = discoveredTokenVariantKey(t);
      if (seen.has(k)) continue;
      merged.push(t);
      seen.add(k);
    }

    // v0.3.x: Compound V3 on-chain discoverer — enumerates cToken addresses per
    // collateral (via Comet.numAssets + getAssetInfo) and adds the borrow
    // position. Each cToken is unique per collateral type, so the
    // Portefeuille Crypto Details SUMPRODUCT lookup no longer collides.
    // CToken addresses are constant per market — cached 7 days to avoid
    // repeated on-chain calls on every scan (saves ~17 RPC calls/scan).
    try {
      const comp3 = await getCompoundV3Tokens(key, normalizedAddress, rpc, effectiveEndpoints[0] ?? "https://mainnet.optimism.io", { cache });
      for (const t of comp3.tokens) {
        const k = discoveredTokenVariantKey(t);
        if (seen.has(k)) continue;
        merged.push(t);
        seen.add(k);
      }
      if (comp3.errors.length) errors.push(...comp3.errors.map((e) => `[compound-v3] ${e}`));
    } catch (e) {
      // Discoverer failure must not block the rest of the scan
      errors.push(`[compound-v3] discoverer failed: ${(e as Error).message}`);
    }

    cachedDiscoveryTokens = merged;
  }

  const discoveryStart = Date.now();
  const discoveryPromise: Promise<{ discovered: DiscoveredToken[]; discoveryMs: number; usedIncremental: boolean; currentBlock: number }> = (async () => {
    let discoveredTokens: DiscoveredToken[];
    let usedIncremental = false;
    let currentBlock = 0;
    if (opts.tokenDiscovery) {
      discoveredTokens = await tokenDiscovery.discoverTokensForWallet(normalizedAddress, key);
    } else {
      const chainMaxLogRange = typeof chain.RPC?.MAX_LOG_RANGE === "number" ? chain.RPC.MAX_LOG_RANGE : undefined;
      const logRange = await getRecentLogRange(dispatcher, rpc, effectiveEndpoints, logBlockWindow, errors, key, chainMaxLogRange);
      currentBlock = parseInt(logRange.toBlock, 16) || 0;

      // Narrow the log range to the unseen delta when a valid cursor exists.
      if (cachedLastBlock != null && hasCachedDiscovery && currentBlock > cachedLastBlock) {
        logRange.fromBlock = `0x${(cachedLastBlock + 1).toString(16)}`;
        usedIncremental = true;
      }

      discoveredTokens = await discoverTokensForWallet(normalizedAddress, key, {
        errors,
        // Bypass the discovery cache whenever we already hold cached tokens —
        // we merge them back below, regardless of whether the range is incremental.
        cache: hasCachedDiscovery ? undefined : cache,
        cacheKey: discoveryKey,
        logDiscovery: () => discoverTokensByTransferLogs({
          address: normalizedAddress,
          endpoints: effectiveEndpoints,
          dispatcher,
          rpc,
          fromBlock: logRange.fromBlock,
          toBlock: logRange.toBlock,
        }),
        explorerDiscovery: () => discoverTokensFromExplorer(normalizedAddress, key, undefined, cache),
        trustExplorerWhenClean: hasExplorerDiscovery(key),
        metadata: (contract) => getErc20Metadata({
          contract,
          endpoints,
          dispatcher,
          rpc,
          cache,
          chainKey: key,
          tokenDecimals: chain.RPC?.TOKEN_DECIMALS,
        }),
      });
    }
    return { discovered: discoveredTokens, discoveryMs: Date.now() - discoveryStart, usedIncremental, currentBlock };
  })();

  const [nativeResult, discoveryResult] = await Promise.all([nativePromise, discoveryPromise]);
  const native = nativeResult.native;
  const nativeMs = nativeResult.nativeMs;
  const nativeRaw = nativeResult.nativeRaw;
  const discoveryMs = discoveryResult.discoveryMs;
  const _usedIncremental = discoveryResult.usedIncremental;
  const currentBlock = discoveryResult.currentBlock;
  const discoveredTokens = discoveryResult.discovered;

  // Merge previously-cached tokens whenever any are present — independent of
  // whether the new fetch was incremental — so the union is always re-persisted.
  if (cachedDiscoveryTokens && cachedDiscoveryTokens.length > 0) {
    const seen = new Set(discoveredTokens.map((t) => discoveredTokenVariantKey(t)));
    for (const cached of cachedDiscoveryTokens) {
      if (!seen.has(discoveredTokenVariantKey(cached))) {
        // Skip stale UNKNOWN entries from before the metadata fix
        if (cached.symbol === "UNKNOWN" || cached.name === "Unknown Token") continue;
        discoveredTokens.push(cached);
        seen.add(discoveredTokenVariantKey(cached));
      }
    }
  }
  // Fire-and-forget cache + cursor refresh — the caller doesn't consume the
  // result. Reuses the toBlock already fetched by getRecentLogRange — no
  // extra blockNumber RPC. Awaiting these added ~4-8ms (2 × Redis RTT) on
  // every scan response for no benefit.
  if (cache && discoveryKey && !opts.tokenDiscovery) {
    cache.set(discoveryKey, discoveredTokens, DISCOVERY_CACHE_TTL_MS).catch(() => { /* discovery cache write failed */ });
    if (currentBlock > 0) {
      cache.set(`${discoveryKey}:block`, currentBlock, DISCOVERY_CACHE_TTL_MS).catch(() => { /* cursor write failed */ });
    }
  }

  const tokens: EvmWalletToken[] = [];
  const seenContracts = new Map<string, DiscoveredToken>();
  // Skip native precompile addresses that duplicate the native balance
  const SKIP_NATIVE_PRECOMPILES = new Set([
    "0x0000000000000000000000000000000000001010", // POL/MATIC precompile (Polygon)
    "0x471ece3750da237f93b8e339c536989b8978a438", // CELO native token (Celo)
  ]);
  const strictTokenSet = opts.strictTokens && opts.customTokens?.length
    ? new Set(opts.customTokens.map((ct) => ct.trim().toLowerCase()).filter((ct) => /^0x[0-9a-f]{40}$/.test(ct)))
    : null;
  const filteredTokens = discoveredTokens.filter(t => {
    const contract = t.contract.toLowerCase();
    if (SKIP_NATIVE_PRECOMPILES.has(contract)) return false;
    return !strictTokenSet || strictTokenSet.has(contract);
  });
  for (const t of filteredTokens) seenContracts.set(t.contract.toLowerCase(), t);

  // Add custom tokens (user-provided contract addresses)
  if (opts.customTokens) {
    for (const ct of opts.customTokens) {
      const addr = ct.trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr) || SKIP_NATIVE_PRECOMPILES.has(addr)) continue;
      const existing = seenContracts.get(addr);
      if (existing?.symbol && existing.name) continue;
      const customDecimals = chain.RPC?.TOKEN_DECIMALS?.[addr] != null ? chain.RPC.TOKEN_DECIMALS[addr] : 18;
      const meta = await getErc20Metadata({
        contract: addr,
        endpoints,
        dispatcher,
        rpc,
        cache,
        chainKey: key,
        tokenDecimals: chain.RPC?.TOKEN_DECIMALS,
      });
      if (meta.token) {
        if (existing) {
          Object.assign(existing, meta.token);
        } else {
          discoveredTokens.push(meta.token);
          filteredTokens.push(meta.token);
          seenContracts.set(addr, meta.token);
        }
      } else if (!existing) {
        const t: DiscoveredToken = { contract: addr, symbol: "CUSTOM", name: addr.slice(0, 10), decimals: customDecimals, source: "indexer" };
        discoveredTokens.push(t);
        filteredTokens.push(t);
        seenContracts.set(addr, t);
      }
    }
  }

  // Balance no-TX shortcut: if no tokens were discovered/added and we have a cached
  // balance from a previous scan, return the cached balances immediately without RPC calls.
  // The cache TTL (1h) acts as the "no activity" window — if the user had activity,
  // the next scan after TTL expiry will do a full scan.
  const BALANCE_CACHE_TTL_MS = 3600_000;
  const balanceCacheKey = `bal_cache:${key.toLowerCase()}:${normalizedAddress}`;
  const hasNoNewTokens = discoveredTokens.length === 0 && !hasCustomTokens;
  if (cache && hasNoNewTokens) {
    try {
      const cachedBal = await cache.get<{
        nativeBalance: string;
        nativePriceEur: number | null;
        tokens: Array<{ contract: string; symbol: string; name: string; balance: string; decimals: number; priceEur: number | null }>;
        block: number;
        ts: number;
      }>(balanceCacheKey);

      if (cachedBal && (Date.now() - cachedBal.ts) < BALANCE_CACHE_TTL_MS) {
        const scanMs = Date.now() - startTime;
        const nd = Number(chain.CHAIN?.NATIVE_DECIMALS ?? 18);
        const nb = Number(formatUnits(BigInt(cachedBal.nativeBalance), nd));
        const tokenResults: EvmWalletToken[] = cachedBal.tokens.map(t => ({
          contract: t.contract,
          symbol: t.symbol,
          name: t.name,
          balance: Number(t.balance),
          decimals: t.decimals,
          priceEur: t.priceEur,
          valueEur: t.priceEur != null ? roundMoney(Number(t.balance) * t.priceEur) : null,
        }));
        const totalValueEur = (cachedBal.nativePriceEur != null ? nb * cachedBal.nativePriceEur : 0)
          + tokenResults.reduce((s, t) => s + (t.valueEur ?? 0), 0);
        return {
          chain: key.toLowerCase(),
          chainName: String(chain.CHAIN?.NAME ?? key),
          native: { symbol: native.symbol, logoUrl: native.logoUrl, balance: nb, priceEur: cachedBal.nativePriceEur, valueEur: cachedBal.nativePriceEur != null ? roundMoney(nb * cachedBal.nativePriceEur) : null },
          tokens: tokenResults,
          errors: ["[BAL_CACHE] No activity since last scan"],
          totalValueEur: roundMoney(totalValueEur),
          scanMs,
          phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
          cacheStats: { hits: 1, misses: 0, stale: 0, skipped: 0 },
        };
      }
    } catch { /* balance cache miss or error — proceed with full scan */ }
  }

  // Phase 1: Batch all balanceOf calls via Multicall3 (1 RPC instead of N).
  // Tokens with a custom balanceSelector (non-standard ERC-20) are read
  // per-token after the multicall phase.
  const balancesStart = Date.now();
  const standardTokens = filteredTokens.filter((t) => !t.balanceSelector);
  const customSelectorTokens = filteredTokens.filter((t) => !!t.balanceSelector);
  const balanceCalls: MulticallCall[] = standardTokens.map((t) => ({
    target: t.contract,
    callData: encodeBalanceOf(normalizedAddress),
  }));
  const balanceResults = balanceCalls.length > 0
    ? await multicall(rpc, dispatcher, effectiveEndpoints, balanceCalls)
    : [];

  // Phase 1.5: Re-batch Multicall3 misses once before falling back to per-token
  // consensus reads. The fallback path is ~3 RPC calls per missed token, so on
  // chains where Multicall3 returns partial failures (RPC throttle, transient
  // revert) a single retry-batch saves up to N*3 RPCs.
  if (balanceResults.length > 0) {
    const missIndices: number[] = [];
    for (let i = 0; i < balanceResults.length; i++) {
      const r = balanceResults[i];
      if (!r || !r.success || !r.returnData || r.returnData === "0x") missIndices.push(i);
    }
    if (missIndices.length > 0 && missIndices.length < balanceResults.length) {
      const retryCalls = missIndices.map((idx) => balanceCalls[idx]!);
      try {
        const retry = await multicall(rpc, dispatcher, effectiveEndpoints, retryCalls);
        for (let i = 0; i < missIndices.length; i++) {
          const r = retry[i];
          if (r?.success && r.returnData && r.returnData !== "0x") {
            balanceResults[missIndices[i]!] = r;
          }
        }
      } catch { /* retry failed → originals stay, per-token fallback handles them */ }
    }
  }

  // Phase 2: Decode + filter > 0, with per-token fallback if multicall result failed.
  // Standard tokens use multicall + indexed balanceResults; custom-selector
  // tokens are read per-token with their custom selector.
  const withBalances: Array<{ known: DiscoveredToken; balance: number }> = [];
  const BALANCE_FALLBACK_CONCURRENCY = 10;
  for (let i = 0; i < standardTokens.length; i += BALANCE_FALLBACK_CONCURRENCY) {
    const group = standardTokens.slice(i, i + BALANCE_FALLBACK_CONCURRENCY);
    const resolved = await Promise.all(group.map(async (known, offset) => {
      const result = balanceResults[i + offset];
      let raw: bigint;
      if (result?.success && result.returnData && result.returnData !== "0x") {
        try {
          raw = decodeUint256(result.returnData);
          if (cache) {
            const decision: BalanceDecision = {
              raw,
              source: "multicall",
              confidence: 0.9,
              degraded: false,
              reason: "live_consensus",
              votes: [liveVote("multicall", raw, true, 0.9)],
            };
            const tcKey = `token:${key.toLowerCase()}:${known.contract.toLowerCase()}:${normalizedAddress}`;
            cache.set(tcKey, cacheEntry(decision), 3600_000).catch(() => {});
          }
        } catch {
          const ercDecision = await readErc20Balance(dispatcher, rpc, effectiveEndpoints, known.contract, normalizedAddress, key, cache);
          if (ercDecision.skipped) return null;
          raw = ercDecision.decision.raw;
          pushBalanceDecisionError(errors, known.symbol, ercDecision.decision);
        }
      } else {
        const ercDecision = await readErc20Balance(dispatcher, rpc, effectiveEndpoints, known.contract, normalizedAddress, key, cache);
        if (ercDecision.skipped) return null;
        raw = ercDecision.decision.raw;
        pushBalanceDecisionError(errors, known.symbol, ercDecision.decision);
      }
      const explicitDecimals = chain.RPC?.TOKEN_DECIMALS?.[known.contract.toLowerCase()];
      const effectiveDecimals = explicitDecimals != null ? explicitDecimals : known.decimals;
      const balance = formatUnits(raw, effectiveDecimals);
      return balance > 0 ? { known, balance } : null;
    }));
    for (const item of resolved) {
      if (item) withBalances.push(item);
    }
  }

  // Custom-selector tokens: per-token balance read with their own selector
  for (let i = 0; i < customSelectorTokens.length; i += BALANCE_FALLBACK_CONCURRENCY) {
    const group = customSelectorTokens.slice(i, i + BALANCE_FALLBACK_CONCURRENCY);
    const resolved = await Promise.all(group.map(async (known) => {
      const ercDecision = await readErc20Balance(
        dispatcher, rpc, effectiveEndpoints, known.contract, normalizedAddress, key, cache, known.balanceSelector,
        known.balanceSelectorExtraArgs,
      );
      if (ercDecision.skipped) return null;
      const raw = ercDecision.decision.raw;
      pushBalanceDecisionError(errors, known.symbol, ercDecision.decision);
      const explicitDecimals = chain.RPC?.TOKEN_DECIMALS?.[known.contract.toLowerCase()];
      const effectiveDecimals = explicitDecimals != null ? explicitDecimals : known.decimals;
      const balance = formatUnits(raw, effectiveDecimals);
      return balance > 0 ? { known, balance } : null;
    }));
    for (const item of resolved) {
      if (item) withBalances.push(item);
    }
  }

  const balancesMs = Date.now() - balancesStart;

  // Phase 3: Price tokens (GT bulk pre-fetch + per-token cascade in groups)
  const pricingStart = Date.now();

  // Bulk pre-fetch DefiLlama prices (1 HTTP for N tokens). Hits before GT/dex per-token,
  // so a cache hit on llama-batch short-circuits the entire cascade for that token.
  const livePrefetchedPriceContracts = new Set<string>();
  const skipBulkLlama = chain.CHAIN?.SKIP_LLAMA_BATCH === true || chain.key === "GNOSIS";
  if (!skipBulkLlama && withBalances.length > 0 && typeof sources.defillama.batchTokenPrices === "function") {
    const llamaSlug = String(chain.CHAIN?.LLAMA_CHAIN_SLUG ?? chain.CHAIN?.DEX_SLUG ?? "");
    if (llamaSlug) {
      const contracts = withBalances.map((item) => item.known.contract);
      try {
        const batchPrices = await sources.defillama.batchTokenPrices(llamaSlug, contracts);
        if (batchPrices.size > 0) {
          const nowMs = Date.now();
          for (const [contract, priceUsd] of batchPrices) {
            const priceEur = roundPrice(priceUsd * fxRate);
            if (priceEur > 0) {
              const cacheKey = priceCacheKey(chain, String(contract));
              priceCache.setPrice(cacheKey, { priceEur, ts: nowMs, source: "llama-batch" });
              livePrefetchedPriceContracts.add(String(contract).toLowerCase());
            }
          }
        }
      } catch {
        // degrade to per-token cascade on batch failure
      }
    }
  }

  // Bulk pre-fetch GT prices for all tokens on this chain (1 HTTP instead of N)
  // Skip Gnosis — RealT tokens need the dedicated realtoken.community API
  const skipBulkGt = chain.key === "GNOSIS";
  if (!skipBulkGt && withBalances.length > 0 && typeof sources.geckoterminal.batchTokenPrices === "function") {
    const gtNetwork = String(chain.CHAIN?.GT_NETWORK ?? chain.CHAIN?.DEX_SLUG ?? chain.key);
    const contracts = withBalances.map((item) => item.known.contract);
    try {
      const batchPrices = await sources.geckoterminal.batchTokenPrices(gtNetwork, contracts);
      if (batchPrices instanceof Map && batchPrices.size > 0) {
        const nowMs = Date.now();
        for (const [contract, priceUsd] of batchPrices) {
          const priceEur = roundPrice(priceUsd * fxRate);
          if (priceEur > 0) {
            const cacheKey = priceCacheKey(chain, String(contract));
            priceCache.setPrice(cacheKey, {
              priceEur,
              ts: nowMs,
              source: "gt-batch",
            });
            livePrefetchedPriceContracts.add(String(contract).toLowerCase());
          }
        }
      }
    } catch {
      // degrade to per-token GT on batch failure
    }
  }

  const PRICE_CONCURRENCY = 10;
  for (let i = 0; i < withBalances.length; i += PRICE_CONCURRENCY) {
    const group = withBalances.slice(i, i + PRICE_CONCURRENCY);
    const priced = await Promise.all(group.map(({ known, balance }) =>
      priceToken(chain, known, balance, fxRate, sources, priceCache, cache, errors, opts.intraScanCache, opts.forceRefresh && !livePrefetchedPriceContracts.has(known.contract.toLowerCase())),
    ));
    tokens.push(...priced);
  }
  const pricingMs = Date.now() - pricingStart;

  const totalValueEur = roundMoney(
    (native.valueEur ?? 0) + tokens.reduce((sum, token) => sum + (token.valueEur ?? 0), 0),
  );

  const scanMs = Date.now() - startTime;

  // Persist negative cache only when scan was completely clean (no errors at all)
  // and wallet truly has nothing on this chain. Any error — degraded, consensus,
  // discovery, RPC failure — means the scan may be incomplete and the wallet might
  // not actually be empty.
  if (cache && emptyCacheKey && native.balance === 0 && tokens.length === 0 && errors.length === 0) {
    const EMPTY_TTL_MS = 10 * 60 * 1000;
    await cache.set(emptyCacheKey, {
      chain: chain.key.toLowerCase(),
      chainName: String(chain.CHAIN?.NAME ?? chain.key),
      nativeSymbol: native.symbol,
      nativeLogo: native.logoUrl,
    }, EMPTY_TTL_MS);
  }

  // Fire-and-forget: cache balances for no-TX shortcut on next scan
  if (cache && !hasCustomTokens) {
    cache.set(balanceCacheKey, {
      nativeBalance: String(nativeRaw),
      nativePriceEur: native.priceEur,
      tokens: tokens.map(t => ({ contract: t.contract, symbol: t.symbol, name: t.name, balance: String(t.balance), decimals: t.decimals, priceEur: t.priceEur })),
      block: currentBlock || 0,
      ts: Date.now(),
    }, BALANCE_CACHE_TTL_MS).catch(() => {});
  }

  return {
    chain: chain.key.toLowerCase(),
    chainName: String(chain.CHAIN?.NAME ?? chain.key),
    native,
    tokens,
    errors,
    totalValueEur,
    scanMs,
    phases: { nativeMs, discoveryMs, balancesMs, pricingMs },
    cacheStats: { hits: 0, misses: 0, stale: 0, skipped: 0 },
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
