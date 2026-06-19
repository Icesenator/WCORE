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
    web: "scan:v2:{address}:{chainKey}",
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
} as const;

export type CacheKeyName = keyof typeof CACHE_KEY_REGISTRY;
