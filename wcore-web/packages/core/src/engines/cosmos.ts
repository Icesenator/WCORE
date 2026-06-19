import { getChain } from "../chains/index.js";
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
import type { WalletAssetsCommon, ScanPhases } from "./types.js";
import type { WalletAssetPrice } from "./evm.js";

export interface CosmosWalletToken extends WalletAssetPrice {
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
        try {
          const res = await rawFetch(candidates[i]!, { ...init, signal: ctrl.signal });
          // On a server error from a non-last endpoint, try the next one.
          if (!res.ok && res.status >= 500 && i < candidates.length - 1) { continue; }
          return res;
        } catch (e) {
          lastErr = e;
          if (i < candidates.length - 1) continue;
        } finally { clearTimeout(t); }
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
  const emptyCacheKey = cache && !opts.forceRefresh ? `empty:v2:${key.toLowerCase()}:${address}` : undefined;
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
  if (cache && balCacheKey) {
    if (!balFailed) {
      cache.set(balCacheKey, balances, 86400_000).catch(() => {});
    } else {
      const cachedBal = await cache.get<BankBalance[]>(balCacheKey);
      if (cachedBal && cachedBal.length > 0) {
        balances = cachedBal;
        errors.push("[DEGRADED] bank balances: using cached fallback (REST failed)");
      }
    }
  }

  const nativeDenom = String(chain.CHAIN?.NATIVE_DENOM ?? "");
  const nativeDecimals = Number(chain.CHAIN?.NATIVE_DECIMALS ?? 6);
  const denomSymbols = (chain.DENOM_SYMBOLS ?? {}) as Record<string, string>;

  let stakedRawAmount = 0n;
  if (chain.CHAIN?.INCLUDE_STAKED_NATIVE) {
    // Fetch delegations, with fallback to cached data on REST failure.
    const delCacheKey = cache ? `del:${key.toLowerCase()}:${address}` : undefined;
    const delResult = await fetchCosmosDelegations(fetchFn, restUrl, address, errors);
    let delegations = delResult.items;
    const delFailed = delResult.failed;
    if (cache && delCacheKey) {
      if (!delFailed) {
        cache.set(delCacheKey, delegations, 86400_000).catch(() => {});
      } else {
        const cachedDel = await cache.get<StakingDelegation[]>(delCacheKey);
        if (cachedDel && cachedDel.length > 0) {
          delegations = cachedDel;
          errors.push("[DEGRADED] delegations: using cached fallback");
        }
      }
    }
    stakedRawAmount = delegations.reduce((sum, d) => sum + rawAmountToBigInt(d.amount), 0n);

    // Fetch unbonding, with fallback to cached data on REST failure.
    const unbCacheKey = cache ? `unb:${key.toLowerCase()}:${address}` : undefined;
    const unbResult = await fetchCosmosUnbonding(fetchFn, restUrl, address, errors);
    let unbonding = unbResult.items;
    const unbFailed = unbResult.failed;
    if (cache && unbCacheKey) {
      if (!unbFailed) {
        cache.set(unbCacheKey, unbonding, 86400_000).catch(() => {});
      } else {
        const cachedUnb = await cache.get<StakingDelegation[]>(unbCacheKey);
        if (cachedUnb && cachedUnb.length > 0) {
          unbonding = cachedUnb;
          errors.push("[DEGRADED] unbonding: using cached fallback");
        }
      }
    }
    stakedRawAmount += unbonding.reduce((sum, d) => sum + rawAmountToBigInt(d.amount), 0n);

    // Fetch rewards, with fallback to cached data on REST failure.
    const rewCacheKey = cache ? `rew:${key.toLowerCase()}:${address}` : undefined;
    const rewResult = await fetchCosmosRewards(fetchFn, restUrl, address, errors);
    let rewards = rewResult.items;
    const rewFailed = rewResult.failed;
    if (cache && rewCacheKey) {
      if (!rewFailed) {
        cache.set(rewCacheKey, rewards, 86400_000).catch(() => {});
      } else {
        const cachedRew = await cache.get<StakingDelegation[]>(rewCacheKey);
        if (cachedRew && cachedRew.length > 0) {
          rewards = cachedRew;
          errors.push("[DEGRADED] rewards: using cached fallback");
        }
      }
    }
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
    if (nativeBalance > 0 || !balFailed) {
      cache.set(nativeCacheKey, { balance: nativeRawAmount }, 86400_000).catch(() => {});
    } else {
      const cachedNative = await cache.get<{ balance: string }>(nativeCacheKey);
      if (cachedNative) {
        const cachedBalance = rawAmountToNumber(cachedNative.balance, nativeDecimals);
        if (cachedBalance > 0) {
          nativeBalance = cachedBalance;
          errors.push("[DEGRADED] native balance: using cached fallback");
        }
      }
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
      const decimals = await resolveCosmosTokenDecimals(fetchFn, restUrl, cosmosChain, denom, errors);
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

async function resolveCosmosTokenDecimals(
  fetchFn: typeof fetch,
  restUrl: string,
  chain: ChainConfig,
  denom: string,
  errors: string[],
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
  try {
    const res = await fetchFn(`${restUrl}/ibc/apps/transfer/v1/denom_traces/${encodeURIComponent(hash)}`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      errors.push(`${denom.slice(0, 12)}: decimals_unknown (denom trace HTTP ${res.status})`);
      return null;
    }
    const json = await res.json() as { denom_trace?: { base_denom?: string } };
    const baseDenom = json.denom_trace?.base_denom;
    if (baseDenom && denomDecimals[baseDenom] != null) return denomDecimals[baseDenom];
    errors.push(`${denom.slice(0, 12)}: decimals_unknown (${baseDenom || "no base denom"})`);
    return null;
  } catch (error) {
    errors.push(`${denom.slice(0, 12)}: decimals_unknown (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
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
