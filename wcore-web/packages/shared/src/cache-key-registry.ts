import { EvmAddress, SvmAddress } from "./address";

type CacheKeyVars = Record<string, string>;

function normalizeZerionWallet(vars: CacheKeyVars): CacheKeyVars {
  const evm = EvmAddress.safeParse(vars.address);
  if (evm.success) return { ...vars, address: evm.data };

  const svm = SvmAddress.safeParse(vars.address);
  if (svm.success) return { ...vars, address: svm.data };

  throw new Error("Invalid Zerion wallet address");
}

function validateZerionBudgetDate(vars: CacheKeyVars): CacheKeyVars {
  const date = vars.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    throw new Error("Invalid Zerion budget date");
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid Zerion budget date");
  }

  return vars;
}

export const CACHE_KEY_REGISTRY = {
  priceDex: {
    vars: ["chainSlug", "contract"],
    gsheet: "DEX:{chainSlug}:{contract}",
    web: "price:dex:{chainSlug}:{contract}",
    storage: "local" as const,
    ttl: "2h",
  },
  priceGt: {
    vars: ["gtNetwork", "contract"],
    gsheet: "GT:{gtNetwork}:{contract}",
    web: "price:gt:{gtNetwork}:{contract}",
    storage: "local" as const,
    ttl: "2h",
  },
  priceLlama: {
    vars: ["llamaId"],
    gsheet: "LLAMA:{llamaId}",
    web: "price:llama:{llamaId}",
    storage: "local" as const,
    ttl: "2h",
  },
  tokenMetadata: {
    vars: ["chainSlug", "contract"],
    gsheet: "META:{chainSlug}:{contract}",
    web: "meta:{chainSlug}:{contract}",
    storage: "web-backed" as const,
    ttl: "24h",
  },
  dynamicRpcs: {
    vars: ["chainKey"],
    gsheet: null,
    web: "rpc:dynamic:{chainKey}",
    storage: "web-only" as const,
    ttl: "30d",
  },
  scanResult: {
    vars: ["address", "chainKey"],
    gsheet: "WALLET_CACHE_{chainKey}_{address}",
    web: "scan:result:{address}:{chainKey}",
    storage: "local" as const,
    ttl: "24h",
  },
  walletGlobal: {
    vars: [],
    gsheet: "GLOBAL_WALLET_CACHE_V1",
    web: "wallet:global",
    storage: "local" as const,
    ttl: "14d",
  },
  fxEurUsd: {
    vars: [],
    gsheet: "FX_EUR_USD",
    web: "fx:eur:usd",
    storage: "local" as const,
    ttl: "1h",
  },
  emptyWallet: {
    vars: ["chainKey", "address"],
    gsheet: "EMPTY_{chainKey}_{address}",
    web: "empty:{chainKey}:{address}",
    storage: "local" as const,
    ttl: "10m",
  },
  compoundV3CTokens: {
    vars: ["chain", "market"],
    gsheet: null,
    web: "compoundV3:{chain}:{market}",
    storage: "web-only" as const,
    ttl: "7d",
  },
  stockPriceFresh: {
    vars: ["ticker"],
    gsheet: null,
    web: "stock:price:{ticker}:fresh",
    storage: "web-only" as const,
    ttl: "1h",
  },
  stockPriceLastGood: {
    vars: ["ticker"],
    gsheet: null,
    web: "stock:price:{ticker}:last-good",
    storage: "web-only" as const,
    ttl: "30d",
  },
  stockTopMarketCapFresh: {
    vars: [],
    gsheet: null,
    web: "stock:top-market-cap:fresh",
    storage: "web-only" as const,
    ttl: "1h",
  },
  stockTopMarketCapLastGood: {
    vars: [],
    gsheet: null,
    web: "stock:top-market-cap:last-good",
    storage: "web-only" as const,
    ttl: "30d",
  },
  stockTopMarketCapLock: {
    vars: [],
    gsheet: null,
    web: "stock:top-market-cap:lock",
    storage: "web-only" as const,
    ttl: "15m",
  },
  cryptoTopMarketCapFresh: {
    vars: [],
    gsheet: null,
    web: "crypto:top-market-cap:fresh",
    storage: "web-only" as const,
    ttl: "1h",
  },
  cryptoTopMarketCapLastGood: {
    vars: [],
    gsheet: null,
    web: "crypto:top-market-cap:last-good",
    storage: "web-only" as const,
    ttl: "30d",
  },
  cryptoTopMarketCapLock: {
    vars: [],
    gsheet: null,
    web: "crypto:top-market-cap:lock",
    storage: "web-only" as const,
    ttl: "60s",
  },
  zerionPortfolioFresh: {
    vars: ["address"],
    gsheet: null,
    web: "zerion:portfolio:v1:{address}:fresh",
    storage: "web-only" as const,
    ttl: "10m",
    normalize: normalizeZerionWallet,
  },
  zerionPortfolioLastGood: {
    vars: ["address"],
    gsheet: null,
    web: "zerion:portfolio:v1:{address}:last-good",
    storage: "web-only" as const,
    ttl: "24h",
    normalize: normalizeZerionWallet,
  },
  zerionPortfolioFailure: {
    vars: ["address"],
    gsheet: null,
    web: "zerion:portfolio:v1:{address}:failure",
    storage: "web-only" as const,
    ttl: "2m",
    normalize: normalizeZerionWallet,
  },
  zerionPortfolioUntracked: {
    vars: ["address"],
    gsheet: null,
    web: "zerion:portfolio:v1:{address}:untracked",
    storage: "web-only" as const,
    ttl: "1h",
    normalize: normalizeZerionWallet,
  },
  zerionRequestLease: {
    vars: ["address"],
    gsheet: null,
    web: "provider:zerion:request:{address}",
    storage: "web-only" as const,
    ttl: "10s",
    normalize: normalizeZerionWallet,
  },
  zerionHalfOpenLease: {
    vars: [],
    gsheet: null,
    web: "provider:zerion:half-open-lease",
    storage: "web-only" as const,
    ttl: "10s",
  },
  zerionDailyBudget: {
    vars: ["date"],
    gsheet: null,
    web: "provider:zerion:daily:{date}",
    storage: "web-only" as const,
    ttl: "24h",
    normalize: validateZerionBudgetDate,
  },
  zerionBreakerState: {
    vars: [],
    gsheet: null,
    web: "provider:zerion:breaker",
    storage: "web-only" as const,
    ttl: "2m",
  },
} as const;

export type CacheKeyName = keyof typeof CACHE_KEY_REGISTRY;
