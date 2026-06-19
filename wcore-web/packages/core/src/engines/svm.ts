import { getChain } from "../chains/index.js";
import type { ChainConfig } from "../types.js";
import { RpcClient } from "../rpc/client.js";
import { reachConsensus } from "../rpc/consensus.js";
import { getRpcEndpoints } from "../rpc/endpoints.js";
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
import type { CacheStore } from "../cache/index.js";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

let _svmTokenMap: Map<string, { symbol: string; name: string; decimals: number; logoUrl?: string }> | null = null;
const _svmMetaCache = new Map<string, { symbol: string; name: string; decimals: number; logoUrl?: string }>();

async function loadSvmTokenMetadata(): Promise<Map<string, { symbol: string; name: string; decimals: number; logoUrl?: string }>> {
  if (_svmTokenMap) return _svmTokenMap;
  try {
    const res = await fetch("https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json");
    const data = await res.json() as { tokens: Array<{ address: string; symbol: string; name: string; decimals: number }> };
    _svmTokenMap = new Map(data.tokens.map(t => [t.address, { symbol: t.symbol, name: t.name, decimals: t.decimals }]));
  } catch {
    _svmTokenMap = new Map();
  }
  return _svmTokenMap;
}

export interface SvmWalletToken extends WalletAssetPrice {
  [key: string]: unknown;
  mint: string;
  name: string;
  decimals: number;
}

export type SvmScanPhases = ScanPhases;

export type SvmWalletAssets = WalletAssetsCommon<SvmWalletToken>;

const sharedPriceCache = new MemoryPricingCache();
const defaultSources: PricingSourceSet = {
  defillama: new DefiLlamaPriceSource(),
  dexscreener: new DexScreenerPriceSource(),
  geckoterminal: new GeckoTerminalPriceSource(sharedPriceCache),
  coingecko: new CoinGeckoPriceSource(),
  jupiter: new JupiterPriceSource(),
  onchainV3: new OnchainV3PriceSource(sharedPriceCache),
};

export async function getSvmWalletAssets(
  address: string,
  chainKey: string,
  opts: {
    rpc?: RpcClient;
    sources?: PricingSourceSet;
    sharedPriceCache?: PricingCache;
    fxRate?: number;
    cache?: CacheStore;
    deepScan?: boolean;
    intraScanCache?: IntraScanCache;
    forceRefresh?: boolean;
  } = {},
): Promise<SvmWalletAssets> {
  const key = normalizeChainKey(chainKey);
  const chain = getChain(key);
  if (!chain || chain.vm !== "SVM") throw new Error(`unsupported SVM chain: ${chainKey}`);
  const svmChain = chain; // narrow for closures

  const endpoints = getRpcEndpoints(key);
  const priceCache = opts.sharedPriceCache ?? sharedPriceCache;
  if (!endpoints.length) throw new Error(`no RPC endpoints for ${key}`);

  const rpc = opts.rpc ?? new RpcClient(undefined, Number(chain.TIMEOUTS?.HTTP_MS ?? 2500));
  const sources = opts.sources ?? (opts.sharedPriceCache
    ? { ...defaultSources, geckoterminal: new GeckoTerminalPriceSource(priceCache), onchainV3: new OnchainV3PriceSource(priceCache) }
    : defaultSources);
  if (!opts.fxRate) throw new Error("FX rate required in opts (use getEurUsdRate from ./fx.js)");
  const fxRate: number = opts.fxRate;
  const errors: string[] = [];
  const endpoint = endpoints[0]!;

  const cache = opts.cache;
  const startTime = Date.now();

  // Negative cache: empty wallet/chain results memoized for short TTL.
  // v2: Liveness check — a single fast getBalance call (~200ms) verifies the
  // wallet is still empty before serving the cached result. This prevents
  // stale cache from blocking real assets indefinitely (no more prefix bumps).
  const emptyCacheKey = cache && !opts.forceRefresh ? `empty:v2:${key.toLowerCase()}:${address}` : undefined;
  if (cache && emptyCacheKey) {
    const cachedEmpty = await cache.get<{ chain: string; chainName: string; nativeSymbol: string; nativeLogo?: string }>(emptyCacheKey);
    if (cachedEmpty) {
      const alive = await quickSvmLivenessCheck(rpc, endpoints, address);
      if (!alive) {
        return {
          chain: cachedEmpty.chain,
          chainName: cachedEmpty.chainName,
          native: { symbol: cachedEmpty.nativeSymbol, balance: 0, priceEur: null, valueEur: null, logoUrl: cachedEmpty.nativeLogo },
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

  const nativeStart = Date.now();
  const nativeRead = await readSvmNativeBalance(rpc, endpoints, address, errors);
  let nativeBalance = nativeRead.balance;

  // Fallback to cached native balance when RPC consensus fails
  if (nativeRead.consensusFailed && nativeBalance === 0n && cache) {
    const nativeCacheKey = `native:${key.toLowerCase()}:${address}`;
    const cached = await cache.get<{ balance: string }>(nativeCacheKey);
    if (cached) {
      const cachedBalance = BigInt(cached.balance);
      if (cachedBalance > 0n) {
        nativeBalance = cachedBalance;
        errors.push("[DEGRADED] native balance: using cached fallback (RPC consensus failed)");
      }
    }
  } else if (nativeBalance > 0n && cache) {
    const nativeCacheKey = `native:${key.toLowerCase()}:${address}`;      await cache.set(nativeCacheKey, { balance: nativeBalance.toString() }, 86400_000);
  }

  const native = await priceSvmNative(chain, nativeBalance, fxRate, sources, priceCache, errors, opts.intraScanCache);
  const nativeMs = Date.now() - nativeStart;

  const discoveryStart = Date.now();
  // Preload token metadata registry + populate cache
  const tokenMeta = await loadSvmTokenMetadata();
  // Populate persistent cache from token list
  for (const [addr, meta] of tokenMeta) {
    if (!_svmMetaCache.has(addr)) _svmMetaCache.set(addr, meta);
  }

  const tokens: SvmWalletToken[] = [];
  const taResult = await readSvmTokenAccounts(rpc, endpoints, address, errors);
  let tokenAccounts = taResult.items;
  const taFailed = taResult.failed;

  // Cache token accounts for fallback on future RPC failures.
  // SVM reads all balances in one shot via getTokenAccountsByOwner — no per-token RPC.
  const taCacheKey = cache ? `ta:${key.toLowerCase()}:${address}` : undefined;
  if (cache && taCacheKey) {
    if (!taFailed) {
      cache.set(taCacheKey, tokenAccounts, 86400_000).catch(() => {});
    } else {
      const cachedTa = await cache.get<SvmTokenAccount[]>(taCacheKey);
      if (cachedTa && cachedTa.length > 0) {
        tokenAccounts = cachedTa;
        errors.push("[DEGRADED] token accounts: using cached fallback (RPC failed)");
      }
    }
  }

  // Enrich unknown tokens via Metaplex getAsset (try mainnet-beta RPC)
  const unknownMints = tokenAccounts
    .filter(ta => !tokenMeta.has(ta.mint) && !_svmMetaCache.has(ta.mint))
    .map(ta => ta.mint);
  if (unknownMints.length > 0) {
    await enrichSvmMetadata(rpc, unknownMints);
  }
  const discoveryMs = Date.now() - discoveryStart;

  const pricingStart = Date.now();

  // Parallel pricing with bounded concurrency to avoid overwhelming price APIs
  // under SCAN_CONCURRENCY=50 (prevents GT throttle starvation across scans).
  const PRICING_CONCURRENCY = 10;
  const tokenQueue = tokenAccounts.filter(ta => rawAmountToBigInt(ta.amount) > 0n);
  const pricedTokens: SvmWalletToken[] = new Array(tokenQueue.length);
  let nextIndex = 0;

  async function priceWorker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= tokenQueue.length) return;
      const ta = tokenQueue[idx]!;
      const meta = tokenMeta.get(ta.mint) || _svmMetaCache.get(ta.mint);
      const metaDecimals = meta && meta.decimals > 0 ? meta.decimals : undefined;
      const decimals = ta.decimals ?? metaDecimals ?? await tryGetSvmTokenDecimals(rpc, endpoint, ta.mint) ?? 0;
      if (decimals === 0) {
        errors.push(`${ta.mint.slice(0, 8)}: decimals unavailable`);
        continue;
      }
      const symbol = meta?.symbol || ta.symbol || ta.mint.slice(0, 8);
      const name = meta?.name || symbol;
      const logoUrl = meta?.logoUrl;
      const balance = rawAmountToNumber(ta.amount, decimals);
      if (!meta && symbol !== ta.mint.slice(0, 8)) {
        _svmMetaCache.set(ta.mint, { symbol, name, decimals });
      }
      pricedTokens[idx] = await priceSvmToken(svmChain, ta.mint, symbol, name, logoUrl, balance, decimals, fxRate, sources, priceCache, errors, opts.intraScanCache);

      if (cache && rawAmountToBigInt(ta.amount) > 0n) {
        const tokenCacheKey = `token:${key.toLowerCase()}:${ta.mint}:${address}`;
        cache.set(tokenCacheKey, { balance: ta.amount, decimals, symbol }, 86400_000).catch(() => {});
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
      nativeLogo: native.logoUrl,
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
    phases: { nativeMs, discoveryMs, balancesMs: 0, pricingMs },
  };
}

async function readSvmNativeBalance(
  rpc: RpcClient,
  endpoints: string[],
  address: string,
  errors: string[],
): Promise<{ balance: bigint; consensusFailed: boolean }> {
  // v4.15.42: Multi-RPC consensus for SVM native balance
  // Prevents stale-RPC zero balances from overwriting correct cached values
  if (!endpoints || endpoints.length === 0) {
    errors.push("native balance: no RPC endpoints");
    return { balance: 0n, consensusFailed: true };
  }

  const results = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const res = await rpc.call<{ value: number }>(ep, "getBalance", [address]);
      return { value: BigInt(res.value), endpoint: ep };
    }),
  );

  const successes = results
    .filter((r): r is PromiseFulfilledResult<{ value: bigint; endpoint: string }> => r.status === "fulfilled")
    .map(r => r.value);

  if (successes.length === 0) {
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));
    errors.push(`native balance failed on all ${endpoints.length} RPCs: ${failures.join("; ").slice(0, 200)}`);
    return { balance: 0n, consensusFailed: true };
  }

  const consensus = reachConsensus(
    results.map((r) => r.status === "fulfilled" ? r.value.value : null),
    (v) => v.toString(),
    { total: endpoints.length },
  );
  // P1-5: A strict consensus zero should never be beaten by a single outlier
  // positive from a stale/faulty RPC. However, with only 2-3 RPCs, rate-limited
  // RPCs returning zero can out-vote a single healthy RPC reporting the real
  // balance. Only accept consensus zero when ALL successes agree on zero.
  if (consensus.consensus && consensus.value !== null) {
    if (consensus.value > 0n || successes.every(s => s.value === 0n)) {
      return { balance: consensus.value, consensusFailed: false };
    }
    // Consensus is zero but some RPCs report non-zero. Don't discard the
    // positive responses — use the max as a best guess (degraded).
  }

  // No strict consensus — use the highest reported balance as a best guess.
  // Free RPC tiers often return zero under load, which can out-vote a single
  // healthy RPC that returns the real balance. Mark degraded so the uncertain
  // value won't be cached and reused as clean in future scans.
  const maxBalance = successes.reduce((max, s) => s.value > max ? s.value : max, 0n);
  if (maxBalance > 0n) {
    errors.push(`[DEGRADED] native balance: no strict consensus (${consensus.votes}/${consensus.total} agree) using max reported balance`);
    return { balance: maxBalance, consensusFailed: true };
  }
  errors.push(`native balance: no consensus (${consensus.votes}/${consensus.total} agree) and all RPCs report zero`);
  return { balance: 0n, consensusFailed: true };
}

interface SvmTokenAccount {
  mint: string;
  amount: string;
  symbol?: string;
  decimals?: number;
}

// v4.15.43: TOKEN program is required; TOKEN-2022 is best-effort.
// Previously, a TOKEN-2022 timeout would discard the successful TOKEN result
// for the same endpoint, causing all tokens to be lost even on a healthy RPC.
async function readSvmTokenAccounts(
  rpc: RpcClient,
  endpoints: string[],
  owner: string,
  errors: string[],
): Promise<{ items: SvmTokenAccount[]; failed: boolean }> {
  for (const endpoint of endpoints) {
    const res = await tryReadTokenAccounts(rpc, endpoint, owner, TOKEN_PROGRAM_ID);
    if (res.failed) continue;

    // TOKEN-2022 is optional — most wallets have no Token-2022 accounts,
    // and some RPCs (e.g. publicnode) timeout on this call.
    const res2022 = await tryReadTokenAccounts(rpc, endpoint, owner, TOKEN_2022_PROGRAM_ID);
    const items2022 = res2022.failed ? [] : res2022.items;
    if (res2022.failed) {
      errors.push(`token accounts: TOKEN-2022 skipped on ${endpoint.slice(0, 40)} (RPC failed)`);
    }

    return { items: [...res.items, ...items2022], failed: false };
  }
  errors.push("token accounts: no data from any RPC endpoint");
  return { items: [], failed: true };
}

async function tryReadTokenAccounts(
  rpc: RpcClient,
  endpoint: string,
  owner: string,
  programId: string,
): Promise<{ items: SvmTokenAccount[]; failed: boolean }> {
  try {
    const res = await rpc.call<{
      value: Array<{
        pubkey: string;
        account: {
          data: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; uiAmount?: number; decimals?: number }; symbol?: string } } };
        };
      }>;
    }>(
      endpoint,
      "getTokenAccountsByOwner",
      [owner, { programId }, { encoding: "jsonParsed" }],
      { timeoutMs: 5000 },
    );
    const accounts: SvmTokenAccount[] = [];
    for (const item of res.value ?? []) {
      const info = item.account?.data?.parsed?.info;
      if (!info?.mint) continue;
      const amount = String(info.tokenAmount?.amount ?? "0");
      accounts.push({ mint: info.mint, amount, decimals: info.tokenAmount?.decimals ?? undefined, symbol: info.symbol || undefined });
    }
    return { items: accounts, failed: false };
  } catch { return { items: [], failed: true }; }
}

async function tryGetSvmTokenDecimals(
  rpc: RpcClient,
  endpoint: string,
  mint: string,
): Promise<number | null> {
  try {
    const res = await rpc.call<{
      value?: { parsed?: { info?: { decimals?: number } } };
    }>(
      endpoint,
      "getAccountInfo",
      [mint, { encoding: "jsonParsed" }],
      { timeoutMs: 3000 },
    );
    return res.value?.parsed?.info?.decimals ?? null;
  } catch {
    return null;
  }
}

async function priceSvmNative(
  chain: ChainConfig,
  balance: bigint,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  errors: string[],
  intraScanCache?: IntraScanCache,
): Promise<WalletAssetPrice> {
  const decimals = Number(chain.CHAIN?.NATIVE_DECIMALS ?? 9);
  const numericBalance = rawAmountToNumber(balance.toString(), decimals);
  const token: PricingToken = {
    key: `native@${chain.key.toLowerCase()}`,
    contract: "native",
    symbol: String(chain.CHAIN?.NATIVE_SYMBOL ?? "SOL"),
    name: String(chain.CHAIN?.NATIVE_NAME ?? chain.CHAIN?.NATIVE_SYMBOL ?? "Solana"),
    chain,
    isNative: true,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, intraScanCache });
  if (priced.reason) errors.push(`native price: ${priced.reason}`);
  const valueEur = priced.priceEur == null ? null : roundMoney(numericBalance * priced.priceEur);
  return {
    symbol: token.symbol ?? "SOL",
    balance: numericBalance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur,
  };
}

async function priceSvmToken(
  chain: ChainConfig,
  mint: string,
  symbol: string,
  name: string,
  logoUrl: string | undefined,
  balance: number,
  decimals: number,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  errors: string[],
  intraScanCache?: IntraScanCache,
): Promise<SvmWalletToken> {
  const token: PricingToken = {
    key: `${chain.key.toLowerCase()}:${mint}`,
    contract: mint,
    symbol,
    name,
    chain,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, allowCoinGeckoTokenFallback: true, intraScanCache });
  if (priced.reason) errors.push(`${symbol} price: ${priced.reason}`);
  return {
    mint,
    symbol,
    name,
    decimals,
    balance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur: priced.priceEur == null ? null : roundMoney(balance * priced.priceEur),
    logoUrl,
  };
}

async function enrichSvmMetadata(rpc: RpcClient, mints: string[]): Promise<void> {
  try {
    for (const mint of mints.slice(0, 20)) {
      const resp = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAsset", params: [mint] }),
      });
      const data = await resp.json() as { result?: { content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } } } };
      const meta = data.result?.content?.metadata;
      const image = data.result?.content?.links?.image;
      if (meta?.name) {
        _svmMetaCache.set(mint, { symbol: meta.symbol || meta.name.slice(0, 8), name: meta.name, decimals: -1, logoUrl: image });
      }
    }
  } catch { /* Metaplex unavailable */ }
}

/** Quick liveness check: single getBalance call to verify wallet is still empty. */
async function quickSvmLivenessCheck(
  rpc: RpcClient,
  endpoints: string[],
  address: string,
): Promise<boolean> {
  // Returns true if wallet has activity (should do full scan).
  // Returns false if wallet appears empty (negative cache can be served).
  if (!endpoints.length) return true; // No RPC available — assume alive (safe)
  try {
    const ep = endpoints[0]!;
    const res = await rpc.call<{ value: number }>(ep, "getBalance", [address], { timeoutMs: 2000 });
    return BigInt(res.value) > 0n;
  } catch {
    return true; // RPC failed — assume wallet might have assets (safe: do full scan)
  }
}

function normalizeChainKey(chainKey: string): string {
  const key = String(chainKey || "").trim().toUpperCase();
  if (key === "SOL") return "SOLANA";
  return key;
}

function rawAmountToBigInt(raw: string | number | bigint): bigint {
  try {
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number") return BigInt(Math.trunc(raw));
    return BigInt(raw || "0");
  } catch {
    return 0n;
  }
}

function rawAmountToNumber(raw: string | number | bigint, decimals: number): number {
  const value = rawAmountToBigInt(raw);
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
