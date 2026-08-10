import { getChain } from "../chains/index.js";
import { cacheKey } from "@wcore/shared";
import { linkAbortSignal } from "../abort.js";
import type { ChainConfig } from "../types.js";
import {
  CoinGeckoPriceSource,
  DefiLlamaPriceSource,
  DexScreenerPriceSource,
  GeckoTerminalPriceSource,
  JupiterPriceSource,
  MemoryPricingCache,
  OnchainV3PriceSource,
  priceTokenCascade,
  type IntraScanCache,
  type PricingCache,
  type PricingSourceSet,
  type PricingToken,
} from "../pricing/index.js";
import type { WalletAssetsCommon, WalletAssetProvenance, ScanPhases } from "./types.js";
import type { WalletAssetPrice } from "./evm.js";

export interface CosmosWalletToken extends WalletAssetPrice, WalletAssetProvenance {
  [key: string]: unknown;
  denom: string;
  name: string;
  decimals: number;
}

export type CosmosScanPhases = ScanPhases;

export type CosmosWalletAssets = WalletAssetsCommon<CosmosWalletToken>;

const sharedPriceCache = new MemoryPricingCache();
const defaultSources: PricingSourceSet = {
  defillama: new DefiLlamaPriceSource(),
  dexscreener: new DexScreenerPriceSource(),
  geckoterminal: new GeckoTerminalPriceSource(sharedPriceCache),
  coingecko: new CoinGeckoPriceSource(),
  jupiter: new JupiterPriceSource(),
  onchainV3: new OnchainV3PriceSource(sharedPriceCache),
};

interface BankBalance {
  denom: string;
  amount: string;
}

interface StakingDelegation {
  validator: string;
  amount: string;
  denom?: string;
}

export async function getCosmosWalletAssets(
  address: string,
  chainKey: string,
  opts: {
    sources?: PricingSourceSet;
    sharedPriceCache?: PricingCache;
    fxRate?: number;
    fetchImpl?: typeof fetch;
    cache?: import("../cache/index.js").CacheStore;
    deepScan?: boolean;
    intraScanCache?: IntraScanCache;
    forceRefresh?: boolean;
    /** Cancels the scan's outbound work; the caller's timeout stopped here before. */
    signal?: AbortSignal;
  } = {},
): Promise<CosmosWalletAssets> {
  const key = normalizeChainKey(chainKey);
  const chain = getChain(key);
  if (!chain || chain.vm !== "COSMOS") throw new Error(`unsupported Cosmos chain: ${chainKey}`);
  const cosmosChain = chain; // narrow for closures

  // REST failover: support REST_URLS array (or fall back to the single
  // REST_URL/LCD_URL). Cosmos LCDs throttle aggressively and have no consensus,
  // so a single endpoint is a single point of failure. fetchFn tries the
  // primary, then transparently retries against alternates by swapping the
  // base prefix on failure (non-ok or throw).
  const restUrls: string[] = (() => {
    const arr = (chain.API as { REST_URLS?: unknown })?.REST_URLS;
    if (Array.isArray(arr)) {
      const list = arr.map((u) => String(u)).filter(Boolean);
      if (list.length > 0) return list;
    }
    const single = String(chain.API?.REST_URL ?? chain.API?.LCD_URL ?? "");
    return single ? [single] : [];
  })();
  if (restUrls.length === 0) throw new Error(`no REST URL for ${key}`);
  const restUrl = restUrls[0]!;

  const priceCache = opts.sharedPriceCache ?? sharedPriceCache;

    const rawFetch = opts.fetchImpl ?? fetch;
    const fetchFn: typeof fetch = async (url, init) => {
      const urlStr = String(url);
      // Build candidate URLs by swapping the primary base prefix for each
      // alternate. Only the path portion (after the base) is preserved.
      const candidates = urlStr.startsWith(restUrl)
        ? restUrls.map((base) => base + urlStr.slice(restUrl.length))
        : [urlStr];
      let lastErr: unknown;
      for (let i = 0; i < candidates.length; i++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        // The caller's timeout reaches the REST failover too: without this, a scan that
        // had already given up still walked its whole endpoint list.
        const unlink = linkAbortSignal(opts.signal, ctrl);
        try {
          const res = await rawFetch(candidates[i]!, { ...init, signal: ctrl.signal });
          // On a server error from a non-last endpoint, try the next one.
          if (!res.ok && res.status >= 500 && i < candidates.length - 1) { continue; }
          return res;
        } catch (e) {
          lastErr = e;
          if (opts.signal?.aborted) throw e; // stop the failover, the caller is gone
          if (i < candidates.length - 1) continue;
        } finally { clearTimeout(t); unlink(); }
      }
      throw lastErr ?? new Error("all REST endpoints failed");
    };
  const sources = opts.sources ?? (opts.sharedPriceCache
    ? { ...defaultSources, geckoterminal: new GeckoTerminalPriceSource(priceCache), onchainV3: new OnchainV3PriceSource(priceCache) }
    : defaultSources);
  if (!opts.fxRate) throw new Error("FX rate required in opts (use getEurUsdRate from ./fx.js)");
  const fxRate: number = opts.fxRate;
  const errors: string[] = [];
  const startTime = Date.now();
  const cache = opts.cache;

  // Negative cache: empty wallet/chain results memoized for short TTL.
  // v2: Liveness check — a single fast REST call (~1-2s) verifies the
  // wallet is still empty before serving the cached result. This prevents
  // stale cache from blocking real assets indefinitely (no more prefix bumps).
  const emptyCacheKey = cache && !opts.forceRefresh
    ? cacheKey("emptyWalletV2", { chainKey: key.toLowerCase(), address })
    : undefined;
  if (cache && emptyCacheKey) {
    const cachedEmpty = await cache.get<{ chain: string; chainName: string; nativeSymbol: string }>(emptyCacheKey);
    if (cachedEmpty) {
      const alive = await quickCosmosLivenessCheck(rawFetch, restUrl, address);
      if (!alive) {
        return {
          chain: cachedEmpty.chain,
          chainName: cachedEmpty.chainName,
          native: { symbol: cachedEmpty.nativeSymbol, balance: 0, priceEur: null, valueEur: null },
          tokens: [],
          errors: ["[CACHED_EMPTY] wallet/chain has no assets (liveness verified)"],
          totalValueEur: 0,
          scanMs: Date.now() - startTime,
          phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
        };
      }
      // Wallet has activity — invalidate stale cache, do full scan
      cache.delete(emptyCacheKey).catch(() => {});
    }
  }

  const balancesStart = Date.now();
  const balResult = await fetchCosmosBalances(fetchFn, restUrl, address, errors);
  let balances = balResult.items;
  const balFailed = balResult.failed;

  // Cache bank balances for fallback on future REST failures.
  const balCacheKey = cache ? `bal:${key.toLowerCase()}:${address}` : undefined;
  let emptyBankResponseCorroborated: boolean | undefined;
  if (cache && balCacheKey) {
    const cachedBal = await cache.get<BankBalance[]>(balCacheKey);
    const cachedPositive = cachedBal?.some((balance) => rawAmountToBigInt(balance.amount) > 0n) === true;
    const livePositive = balances.some((balance) => rawAmountToBigInt(balance.amount) > 0n);
    if (!balFailed && (!cachedPositive || livePositive)) {
      cache.set(balCacheKey, balances, 86400_000).catch(() => {});
    } else if (!balFailed && cachedPositive) {
      emptyBankResponseCorroborated = await corroborateCosmosEmptyBalances(rawFetch, restUrls.slice(1), address, opts.signal);
      if (emptyBankResponseCorroborated) {
        cache.set(balCacheKey, balances, 86400_000).catch(() => {});
      } else {
        balances = cachedBal!;
        errors.push("[DEGRADED] bank balances: preserving positive cache (empty live response uncorroborated)");
      }
    } else if (cachedPositive) {
      balances = cachedBal!;
      errors.push("[DEGRADED] bank balances: using cached fallback (REST failed)");
    }
  }

  const nativeDenom = String(chain.CHAIN?.NATIVE_DENOM ?? "");
  const nativeDecimals = Number(chain.CHAIN?.NATIVE_DECIMALS ?? 6);
  const denomSymbols = (chain.DENOM_SYMBOLS ?? {}) as Record<string, string>;

  let stakedRawAmount = 0n;
  if (chain.CHAIN?.INCLUDE_STAKED_NATIVE) {
    // Delegations, unbonding and rewards are three independent REST reads. They were
    // awaited one after another, so a chain whose endpoint is slow paid that latency
    // three times over; the failover alone allows 10 s per call.
    const [delegations, unbonding, rewards] = await Promise.all([
      readStakingWithFallback("delegations", cache ? `del:${key.toLowerCase()}:${address}` : undefined, () => fetchCosmosDelegations(fetchFn, restUrl, address, errors), cache, errors),
      readStakingWithFallback("unbonding", cache ? `unb:${key.toLowerCase()}:${address}` : undefined, () => fetchCosmosUnbonding(fetchFn, restUrl, address, errors), cache, errors),
      readStakingWithFallback("rewards", cache ? `rew:${key.toLowerCase()}:${address}` : undefined, () => fetchCosmosRewards(fetchFn, restUrl, address, errors), cache, errors),
    ]);

    stakedRawAmount = delegations.reduce((sum, d) => sum + rawAmountToBigInt(d.amount), 0n);
    stakedRawAmount += unbonding.reduce((sum, d) => sum + rawAmountToBigInt(d.amount), 0n);
    stakedRawAmount += rewards.filter((d) => !d.denom || d.denom === nativeDenom).reduce((sum, d) => sum + rawAmountToBigInt(d.amount), 0n);
  }

  const balancesMs = Date.now() - balancesStart;

  const pricingStart = Date.now();
  const nativeRawAmount = (rawAmountToBigInt(balances.find((b) => b.denom === nativeDenom)?.amount ?? "0") + stakedRawAmount).toString();
  let nativeBalance = rawAmountToNumber(nativeRawAmount, nativeDecimals);

  // Cache native balance for fallback on future REST failures.
  // Only use cached fallback when the REST call actually failed (balFailed),
  // never when it returned a genuine zero.
  const nativeCacheKey = cache ? `native:${key.toLowerCase()}:${address}` : undefined;
  if (cache && nativeCacheKey) {
    const cachedNative = await cache.get<{ balance: string }>(nativeCacheKey);
    const cachedBalance = cachedNative ? rawAmountToNumber(cachedNative.balance, nativeDecimals) : 0;
    if (nativeBalance > 0) {
      cache.set(nativeCacheKey, { balance: nativeRawAmount }, 86400_000).catch(() => {});
    } else if (cachedBalance > 0 && balFailed) {
      nativeBalance = cachedBalance;
      errors.push("[DEGRADED] native balance: using cached fallback");
    } else if (cachedBalance > 0) {
      emptyBankResponseCorroborated ??= await corroborateCosmosEmptyBalances(rawFetch, restUrls.slice(1), address, opts.signal);
      if (emptyBankResponseCorroborated) {
        cache.set(nativeCacheKey, { balance: nativeRawAmount }, 86400_000).catch(() => {});
      } else {
        nativeBalance = cachedBalance;
        errors.push("[DEGRADED] native balance: preserving positive cache (empty live response uncorroborated)");
      }
    } else {
      cache.set(nativeCacheKey, { balance: nativeRawAmount }, 86400_000).catch(() => {});
    }
  }

  const native = await priceCosmosNative(chain, nativeBalance, fxRate, sources, priceCache, errors, opts.intraScanCache);

  const tokens: CosmosWalletToken[] = [];

  // Parallel pricing with bounded concurrency
  const PRICING_CONCURRENCY = 10;
  const tokenQueue = balances.filter(b => b.denom !== nativeDenom && rawAmountToBigInt(b.amount) > 0n);
  const pricedTokens: CosmosWalletToken[] = new Array(tokenQueue.length);
  let nextIndex = 0;

  async function priceWorker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= tokenQueue.length) return;
      const bal = tokenQueue[idx]!;
      const denom = bal.denom;
      if (!denom) continue;
      const symbol = denomSymbols[denom] ?? denom;
      const decimals = await resolveCosmosTokenDecimals(fetchFn, restUrl, cosmosChain, denom, errors, cache, key);
      if (decimals == null) continue;
      const balance = rawAmountToNumber(bal.amount, decimals);
      pricedTokens[idx] = await priceCosmosToken(cosmosChain, denom, symbol, decimals, balance, fxRate, sources, priceCache, errors, opts.intraScanCache);

      if (cache && rawAmountToBigInt(bal.amount) > 0n) {
        const tokenCacheKey = `token:${key.toLowerCase()}:${denom}:${address}`;
        cache.set(tokenCacheKey, { balance: bal.amount, decimals, symbol }, 86400_000).catch(() => {});
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PRICING_CONCURRENCY, tokenQueue.length) }, () => priceWorker()));
  tokens.push(...pricedTokens.filter(Boolean));
  const pricingMs = Date.now() - pricingStart;

  const totalValueEur = roundMoney(
    (native.valueEur ?? 0) + tokens.reduce((sum, token) => sum + (token.valueEur ?? 0), 0),
  );
  const scanMs = Date.now() - startTime;

  // Persist negative cache only when scan was clean and wallet truly empty.
  if (cache && emptyCacheKey && native.balance === 0 && tokens.length === 0 &&
      !errors.some((e) => e.includes("[DEGRADED]") || e.includes("failed") || e.includes("aborted") || e.includes("fetch") || e.includes("HTTP") || e.includes("no data"))) {
    const EMPTY_TTL_MS = 2 * 60 * 1000;
    await cache.set(emptyCacheKey, {
      chain: chain.key.toLowerCase(),
      chainName: String(chain.CHAIN?.NAME ?? chain.key),
      nativeSymbol: native.symbol,
    }, EMPTY_TTL_MS);
  }

  return {
    chain: chain.key.toLowerCase(),
    chainName: String(chain.CHAIN?.NAME ?? chain.key),
    native,
    tokens,
    errors,
    totalValueEur,
    scanMs,
    phases: { nativeMs: 0, discoveryMs: 0, balancesMs, pricingMs },
  };
}

async function fetchCosmosBalances(
  fetchFn: typeof fetch,
  restUrl: string,
  address: string,
  errors: string[],
): Promise<{ items: BankBalance[]; failed: boolean }> {
  try {
    const url = `${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      errors.push(`balances HTTP ${res.status}`);
      return { items: [], failed: true };
    }
    const json = (await res.json()) as { balances?: Array<{ denom?: string; amount?: string }> };
    return {
      items: (json.balances ?? []).map((b) => ({
        denom: String(b.denom ?? ""),
        amount: String(b.amount ?? "0"),
      })),
      failed: false
    };
  } catch (error) {
    errors.push(`balances fetch: ${error instanceof Error ? error.message : String(error)}`);
    return { items: [], failed: true };
  }
}

async function corroborateCosmosEmptyBalances(
  fetchImpl: typeof fetch,
  alternateRestUrls: string[],
  address: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const restUrl = alternateRestUrls[0];
  if (!restUrl) return false;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  const unlink = linkAbortSignal(signal, ctrl);
  try {
    const res = await fetchImpl(`${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const json = await res.json() as { balances?: BankBalance[] };
    return Array.isArray(json.balances) && !json.balances.some((balance) => rawAmountToBigInt(balance.amount) > 0n);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

async function fetchCosmosDelegations(
  fetchFn: typeof fetch,
  restUrl: string,
  address: string,
  errors: string[],
): Promise<{ items: StakingDelegation[]; failed: boolean }> {
  try {
    const url = `${restUrl}/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      errors.push(`delegations HTTP ${res.status}`);
      return { items: [], failed: true };
    }
    const json = (await res.json()) as {
      delegation_responses?: Array<{ delegation?: { validator_address?: string; shares?: string }; balance?: { amount?: string } }>;
    };
    return {
      items: (json.delegation_responses ?? []).map((d) => ({
        validator: String(d.delegation?.validator_address ?? ""),
        amount: String(d.balance?.amount ?? "0"),
      })),
      failed: false
    };
  } catch (error) {
    errors.push(`delegations fetch: ${error instanceof Error ? error.message : String(error)}`);
    return { items: [], failed: true };
  }
}

async function fetchCosmosUnbonding(
  fetchFn: typeof fetch,
  restUrl: string,
  address: string,
  errors: string[],
): Promise<{ items: StakingDelegation[]; failed: boolean }> {
  try {
    const url = `${restUrl}/cosmos/staking/v1beta1/delegators/${encodeURIComponent(address)}/unbonding_delegations`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      errors.push(`unbonding HTTP ${res.status}`);
      return { items: [], failed: true };
    }
    const json = (await res.json()) as {
      unbonding_responses?: Array<{ entries?: Array<{ balance?: string }> }>;
    };
    const results: StakingDelegation[] = [];
    for (const d of json.unbonding_responses ?? []) {
      for (const entry of d.entries ?? []) {
        results.push({ validator: "", amount: String(entry.balance ?? "0") });
      }
    }
    return { items: results, failed: false };
  } catch (error) {
    errors.push(`unbonding fetch: ${error instanceof Error ? error.message : String(error)}`);
    return { items: [], failed: true };
  }
}

async function fetchCosmosRewards(
  fetchFn: typeof fetch,
  restUrl: string,
  address: string,
  errors: string[],
): Promise<{ items: StakingDelegation[]; failed: boolean }> {
  try {
    const url = `${restUrl}/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(address)}/rewards`;
    const res = await fetchFn(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      errors.push(`rewards HTTP ${res.status}`);
      return { items: [], failed: true };
    }
    const json = (await res.json()) as {
      total?: Array<{ denom?: string; amount?: string }>;
      rewards?: Array<{ reward?: Array<{ denom?: string; amount?: string }> }>;
    };
    // Use total if available, otherwise sum rewards
    if (json.total) {
      return {
        items: json.total.map((r) => ({ validator: "", amount: String(r.amount ?? "0"), denom: r.denom })),
        failed: false
      };
    }
    const results: StakingDelegation[] = [];
    for (const r of json.rewards ?? []) {
      for (const coin of r.reward ?? []) {
        results.push({ validator: "", amount: String(coin.amount ?? "0"), denom: coin.denom });
      }
    }
    return { items: results, failed: false };
  } catch (error) {
    errors.push(`rewards fetch: ${error instanceof Error ? error.message : String(error)}`);
    return { items: [], failed: true };
  }
}

async function priceCosmosNative(
  chain: ChainConfig,
  balance: number,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  errors: string[],
  intraScanCache?: IntraScanCache,
): Promise<WalletAssetPrice> {
  const token: PricingToken = {
    key: `native@${chain.key.toLowerCase()}`,
    contract: "native",
    symbol: String(chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE"),
    name: String(chain.CHAIN?.NATIVE_NAME ?? chain.CHAIN?.NATIVE_SYMBOL ?? "Native"),
    chain,
    isNative: true,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, intraScanCache });
  if (priced.reason) errors.push(`native price: ${priced.reason}`);
  const valueEur = priced.priceEur == null ? null : roundMoney(balance * priced.priceEur);
  return {
    symbol: token.symbol ?? "NATIVE",
    balance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur,
  };
}

async function priceCosmosToken(
  chain: ChainConfig,
  denom: string,
  symbol: string,
  decimals: number,
  balance: number,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  errors: string[],
  intraScanCache?: IntraScanCache,
): Promise<CosmosWalletToken> {
  const token: PricingToken = {
    key: `${chain.key.toLowerCase()}:${denom}`,
    contract: denom,
    symbol,
    name: symbol,
    chain,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, allowCoinGeckoTokenFallback: true, intraScanCache });
  if (priced.reason) errors.push(`${symbol} price: ${priced.reason}`);
  return {
    denom,
    symbol,
    name: symbol,
    decimals,
    balance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur: priced.priceEur == null ? null : roundMoney(balance * priced.priceEur),
  };
}

/** An IBC hash maps to one denomination for good; only a chain rename would alter it. */
const IBC_DENOM_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reads one staking list, falling back to its cached copy when the REST call fails.
 *
 * A genuinely empty list is never replaced by the cache: only a failed read is, which
 * keeps a transient endpoint outage from erasing a delegation that is still there.
 */
async function readStakingWithFallback(
  label: string,
  cacheKey: string | undefined,
  read: () => Promise<{ items: StakingDelegation[]; failed: boolean }>,
  cache: import("../cache/index.js").CacheStore | undefined,
  errors: string[],
): Promise<StakingDelegation[]> {
  const result = await read();
  if (!cache || !cacheKey) return result.items;

  const cached = await cache.get<StakingDelegation[]>(cacheKey);

  if (!result.failed) {
    if (result.items.length === 0 && cached?.some((item) => rawAmountToBigInt(item.amount) > 0n)) {
      errors.push(`[DEGRADED] ${label}: preserving positive cache (empty live response uncorroborated)`);
      return cached;
    }
    cache.set(cacheKey, result.items, 86400_000).catch(() => {});
    return result.items;
  }

  if (cached && cached.length > 0) {
    errors.push(`[DEGRADED] ${label}: using cached fallback`);
    return cached;
  }
  return result.items;
}

async function resolveCosmosTokenDecimals(
  fetchFn: typeof fetch,
  restUrl: string,
  chain: ChainConfig,
  denom: string,
  errors: string[],
  cache?: import("../cache/index.js").CacheStore,
  chainKey?: string,
): Promise<number | null> {
  const denomDecimals = (chain.DENOM_DECIMALS ?? {}) as Record<string, number>;
  if (denomDecimals[denom] != null) return denomDecimals[denom];
  if (!denom.startsWith("ibc/")) {
    // Standard Cosmos micro-denom convention: u-prefix (uatom, uosmo) = 6.
    // Only default to 6 for simple lowercase denoms; non-standard denoms
    // (factory/, erc20/, cw20:, gamm/pool/, alloyed/, etc.) have unknown
    // decimals — skip rather than mis-value by assuming 6 (could be 10^12 off).
    if (/^u[a-z]+$/.test(denom)) return 6;
    errors.push(`${denom.slice(0, 16)}: decimals_unknown (non-standard denom)`);
    return null;
  }

  const hash = denom.slice(4);
  const resolved = await resolveIbcBaseDenom(fetchFn, restUrl, hash, cache, chainKey);
  if (!resolved.baseDenom) {
    errors.push(`${denom.slice(0, 12)}: decimals_unknown (${resolved.reason})`);
    return null;
  }

  const baseDenom = resolved.baseDenom;
  if (denomDecimals[baseDenom] != null) return denomDecimals[baseDenom];
  const convention = microDenomDecimals(baseDenom);
  if (convention != null) return convention;
  errors.push(`${denom.slice(0, 12)}: decimals_unknown (${baseDenom})`);
  return null;
}

/**
 * Decimals implied by the Cosmos denomination naming convention, or null when the name
 * carries no reliable scale.
 *
 * Only the micro prefix is trusted. A liquid-staking derivative embeds the denomination
 * it wraps and shares its scale, so stuatom is uatom is 6 - but staevmos wraps aevmos,
 * which is 18. Reading every st denomination as 6 would therefore be twelve orders of
 * magnitude off on the Evmos family, so anything that does not reduce to a simple
 * u-prefixed denomination is left unknown rather than guessed.
 */
function microDenomDecimals(denom: string): number | null {
  if (/^u[a-z]+$/.test(denom)) return 6;
  if (/^stu[a-z]+$/.test(denom)) return 6;
  return null;
}

/**
 * Resolves an IBC hash to its base denom.
 *
 * IBC-Go v10 retired `denom_traces` in favour of `denoms`, and the chains we scan run
 * both generations: Cosmos Hub answers 501 on the old route while Injective and Terra
 * answer 501 on the new one. Querying only one of them left every IBC token on half the
 * chains unpriced, so both are tried.
 */
async function resolveIbcBaseDenom(
  fetchFn: typeof fetch,
  restUrl: string,
  hash: string,
  cache?: import("../cache/index.js").CacheStore,
  chainKey?: string,
): Promise<{ baseDenom: string | null; reason: string }> {
  // An IBC hash is the digest of its trace, so the denomination it maps to never
  // changes. Re-resolving it on every scan cost one REST call per token and made the
  // whole wallet depend on that endpoint answering right then.
  const cacheKey = cache && chainKey ? `ibcdenom:${chainKey.toLowerCase()}:${hash}` : undefined;
  if (cacheKey && cache) {
    const cached = await cache.get<string>(cacheKey).catch(() => undefined);
    if (cached) return { baseDenom: cached, reason: "" };
  }

  const routes: Array<{ path: string; pick: (json: unknown) => string | undefined }> = [
    {
      path: `ibc/apps/transfer/v1/denoms/${encodeURIComponent(hash)}`,
      pick: (json) => (json as { denom?: { base?: string } })?.denom?.base,
    },
    {
      path: `ibc/apps/transfer/v1/denom_traces/${encodeURIComponent(hash)}`,
      pick: (json) => (json as { denom_trace?: { base_denom?: string } })?.denom_trace?.base_denom,
    },
  ];

  let reason = "no base denom";
  for (const route of routes) {
    try {
      const res = await fetchFn(`${restUrl}/${route.path}`, { headers: { accept: "application/json" } });
      if (!res.ok) { reason = `denom lookup HTTP ${res.status}`; continue; }
      const base = route.pick(await res.json());
      if (base) {
        if (cacheKey && cache) cache.set(cacheKey, base, IBC_DENOM_CACHE_TTL_MS).catch(() => {});
        return { baseDenom: base, reason: "" };
      }
      reason = "no base denom";
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  return { baseDenom: null, reason };
}

/** Quick liveness check: single REST call to verify wallet is still empty. */
async function quickCosmosLivenessCheck(
  fetchImpl: typeof fetch,
  restUrl: string,
  address: string,
): Promise<boolean> {
  // Returns true if wallet has activity (should do full scan).
  // Returns false if wallet appears empty (negative cache can be served).
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    try {
      const url = `${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
      const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
      if (!res.ok) return true; // REST failed — assume alive (safe)
      const json = await res.json() as { balances?: Array<{ amount?: string }> };
      if (!Array.isArray(json.balances)) return true; // Malformed response — assume alive (safe)
      return json.balances.some(b => rawAmountToBigInt(b.amount ?? "0") > 0n);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return true; // Error — assume wallet might have assets (safe: do full scan)
  }
}

function normalizeChainKey(chainKey: string): string {
  const key = String(chainKey || "").trim().toUpperCase();
  if (key === "COSMOS" || key === "COSMOS_HUB" || key === "COSMOHUB") return "COSMOS_HUB";
  return key;
}

function rawAmountToBigInt(raw: string | number | bigint): bigint {
  try {
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number") return BigInt(Math.trunc(raw));
    return BigInt(String(raw || "0").split(".")[0] || "0");
  } catch {
    return 0n;
  }
}

function rawAmountToNumber(raw: string | number | bigint, decimals: number): number {
  const rawText = String(raw || "0");
  if (rawText.includes(".")) return Number(rawText) / 10 ** Math.max(0, Math.trunc(decimals));
  const value = rawAmountToBigInt(rawText);
  const safeDecimals = Math.max(0, Math.trunc(decimals));
  if (safeDecimals === 0) return Number(value.toString());
  const divisor = 10n ** BigInt(safeDecimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return Number(whole.toString());
  const fractionText = fraction.toString().padStart(safeDecimals, "0").replace(/0+$/, "");
  return Number(`${whole.toString()}.${fractionText}`);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
