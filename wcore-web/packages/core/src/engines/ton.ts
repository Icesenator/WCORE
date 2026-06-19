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
import type { CacheStore } from "../cache/index.js";

const TONAPI_BASE = "https://tonapi.io/v2";
const TONCENTER_BASE = "https://toncenter.com/api/v2";

export interface TonWalletToken extends WalletAssetPrice {
  [key: string]: unknown;
  jettonAddress: string;
  name: string;
  decimals: number;
}

export type TonScanPhases = ScanPhases;

export type TonWalletAssets = WalletAssetsCommon<TonWalletToken>;

const sharedPriceCache = new MemoryPricingCache();
const defaultSources: PricingSourceSet = {
  defillama: new DefiLlamaPriceSource(),
  dexscreener: new DexScreenerPriceSource(),
  geckoterminal: new GeckoTerminalPriceSource(sharedPriceCache),
  coingecko: new CoinGeckoPriceSource(),
  jupiter: new JupiterPriceSource(),
  onchainV3: new OnchainV3PriceSource(sharedPriceCache),
};

interface TonJetton {
  balance: string;
  jetton: {
    address: string;
    decimals: number;
    symbol?: string;
    name?: string;
    image?: string;
  };
}

interface TonAccount {
  balance: string;
  jettons?: { balances: TonJetton[] };
}

export async function getTonWalletAssets(
  address: string,
  chainKey: string,
  opts: {
    sources?: PricingSourceSet;
    sharedPriceCache?: PricingCache;
    fxRate?: number;
    fetchImpl?: typeof fetch;
    cache?: CacheStore;
    intraScanCache?: IntraScanCache;
    forceRefresh?: boolean;
  } = {},
): Promise<TonWalletAssets> {
  const key = normalizeChainKey(chainKey);
  const chain = getChain(key);
  if (!chain || chain.vm !== "TON") throw new Error(`unsupported TON chain: ${chainKey}`);
  const tonChain = chain;
  const rawFetch = opts.fetchImpl ?? fetch;
  const priceCache = opts.sharedPriceCache ?? sharedPriceCache;
  if (!opts.fxRate) throw new Error("FX rate required in opts (use getEurUsdRate from ./fx.js)");
  const fxRate: number = opts.fxRate;
  const errors: string[] = [];
  const startTime = Date.now();

  // Negative cache: 2min TTL with liveness check (matches SVM pattern).
  const emptyCacheKey = opts.cache && !opts.forceRefresh
    ? `empty:v2:${key.toLowerCase()}:${address}`
    : undefined;
  if (opts.cache && emptyCacheKey) {
    const cachedEmpty = await opts.cache.get<{ chain: string; chainName: string; nativeSymbol: string; nativeLogo?: string }>(emptyCacheKey);
    if (cachedEmpty) {
      const alive = await quickTonLivenessCheck(rawFetch, address);
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
      opts.cache.delete(emptyCacheKey).catch(() => {});
    }
  }

  // 1) Read native balance + jettons in one TonAPI call.
  const discoveryStart = Date.now();
  let account: TonAccount | null = null;
  try {
    account = await fetchTonAccount(rawFetch, address, errors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`tonapi account: ${msg}`);
  }

  const nativeNano = account?.balance ? BigInt(account.balance) : 0n;
  const jettons = (account?.jettons?.balances ?? []).filter((b) => {
    try { return BigInt(b.balance) > 0n; } catch { return false; }
  });
  const discoveryMs = Date.now() - discoveryStart;

  // 2) Fallback: if TonAPI returned no balance, hit Toncenter.
  let nativeBalance = nativeNano;
  if (nativeBalance === 0n && account == null) {
    try {
      const raw = await fetchToncenterBalance(rawFetch, address);
      if (raw) nativeBalance = BigInt(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`toncenter balance: ${msg}`);
    }
  }

  // Cache native balance.
  if (opts.cache && nativeBalance > 0n) {
    opts.cache.set(`native:${key.toLowerCase()}:${address}`, { balance: nativeBalance.toString() }, 3600_000).catch(() => {});
  } else if (opts.cache && nativeBalance === 0n) {
    // Try fallback to cached balance if live is zero and we got no account.
    if (account == null) {
      const cached = await opts.cache.get<{ balance: string }>(`native:${key.toLowerCase()}:${address}`);
      if (cached) {
        try {
          const cachedBalance = BigInt(cached.balance);
          if (cachedBalance > 0n) {
            nativeBalance = cachedBalance;
            errors.push("[DEGRADED] native balance: using cached fallback (TonAPI failed)");
          }
        } catch { /* ignore */ }
      }
    }
  }

  // 3) Price native.
  const nativeStart = Date.now();
  const native = await priceTonNative(tonChain, nativeBalance, fxRate, defaultSources, priceCache, errors, opts.intraScanCache);
  const nativeMs = Date.now() - nativeStart;

  // 4) Price jettons in parallel (bounded).
  const PRICING_CONCURRENCY = 10;
  const pricedTokens: TonWalletToken[] = new Array(jettons.length);
  let nextIndex = 0;

  async function priceWorker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= jettons.length) return;
      const j = jettons[idx]!;
      const decimals = Number(j.jetton?.decimals ?? 9);
      const symbol = String(j.jetton?.symbol ?? j.jetton.address.slice(0, 8));
      const name = String(j.jetton?.name ?? symbol);
      const balance = rawAmountToNumber(j.balance, decimals);
      const logoUrl = j.jetton?.image;
      const contract = String(j.jetton?.address ?? "");
      pricedTokens[idx] = await priceTonToken(tonChain, contract, symbol, name, logoUrl, balance, decimals, fxRate, defaultSources, priceCache, errors, opts.intraScanCache);
      if (opts.cache) {
        opts.cache.set(`token:${key.toLowerCase()}:${contract}:${address}`, { balance: j.balance, decimals, symbol, name }, 3600_000).catch(() => {});
      }
    }
  }

  const pricingStart = Date.now();
  await Promise.all(Array.from({ length: Math.min(PRICING_CONCURRENCY, jettons.length) }, () => priceWorker()));
  const tokens = pricedTokens.filter(Boolean);
  const pricingMs = Date.now() - pricingStart;

  const totalValueEur = roundMoney(
    (native.valueEur ?? 0) + tokens.reduce((sum, t) => sum + (t.valueEur ?? 0), 0),
  );
  const scanMs = Date.now() - startTime;

  // Persist negative cache when scan was clean and wallet truly empty.
  if (opts.cache && emptyCacheKey && native.balance === 0 && tokens.length === 0 &&
      !errors.some((e) => e.includes("[DEGRADED]") || e.includes("failed") || e.includes("HTTP"))) {
    await opts.cache.set(emptyCacheKey, {
      chain: tonChain.key.toLowerCase(),
      chainName: String(tonChain.CHAIN?.NAME ?? tonChain.key),
      nativeSymbol: native.symbol,
      nativeLogo: native.logoUrl,
    }, 2 * 60_000);
  }

  return {
    chain: tonChain.key.toLowerCase(),
    chainName: String(tonChain.CHAIN?.NAME ?? tonChain.key),
    native,
    tokens,
    errors,
    totalValueEur,
    scanMs,
    phases: { nativeMs, discoveryMs, balancesMs: 0, pricingMs },
  };
}

async function fetchTonAccount(rawFetch: typeof fetch, address: string, errors: string[]): Promise<TonAccount | null> {
  const url = `${TONAPI_BASE}/accounts/${encodeURIComponent(address)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await rawFetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) {
      errors.push(`tonapi HTTP ${res.status}`);
      return null;
    }
    return await res.json() as TonAccount;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchToncenterBalance(rawFetch: typeof fetch, address: string): Promise<string | null> {
  const url = `${TONCENTER_BASE}/getAddressBalance?address=${encodeURIComponent(address)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await rawFetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; result?: string };
    if (!data.ok || !data.result) return null;
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function priceTonNative(
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
    symbol: String(chain.CHAIN?.NATIVE_SYMBOL ?? "TON"),
    name: String(chain.CHAIN?.NATIVE_NAME ?? "Gram"),
    chain,
    isNative: true,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, intraScanCache });
  if (priced.reason) errors.push(`native price: ${priced.reason}`);
  const valueEur = priced.priceEur == null ? null : roundMoney(numericBalance * priced.priceEur);
  return {
    symbol: token.symbol ?? "TON",
    balance: numericBalance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur,
  };
}

async function priceTonToken(
  chain: ChainConfig,
  jettonAddress: string,
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
): Promise<TonWalletToken> {
  const token: PricingToken = {
    key: `${chain.key.toLowerCase()}:${jettonAddress}`,
    contract: jettonAddress,
    symbol,
    name,
    chain,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, allowCoinGeckoTokenFallback: true, intraScanCache });
  if (priced.reason) errors.push(`${symbol} price: ${priced.reason}`);
  return {
    jettonAddress,
    symbol,
    name,
    decimals,
    balance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur: priced.priceEur == null ? null : roundMoney(balance * priced.priceEur),
    logoUrl,
  };
}

async function quickTonLivenessCheck(rawFetch: typeof fetch, address: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await rawFetch(`${TONAPI_BASE}/accounts/${encodeURIComponent(address)}`, {
        headers: { accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) return true; // API errored: assume alive (safe)
      const data = await res.json() as { balance?: string; jettons?: { balances?: TonJetton[] } };
      const bal = data.balance ? BigInt(data.balance) : 0n;
      const jn = data.jettons?.balances?.length ?? 0;
      return bal > 0n || jn > 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return true; // network error: assume alive (safe)
  }
}

function normalizeChainKey(chainKey: string): string {
  return String(chainKey || "").trim().toUpperCase();
}

function rawAmountToNumber(raw: string | number | bigint, decimals: number): number {
  let value: bigint;
  try {
    if (typeof raw === "bigint") value = raw;
    else if (typeof raw === "number") value = BigInt(Math.trunc(raw));
    else value = BigInt(raw || "0");
  } catch { return 0; }
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
