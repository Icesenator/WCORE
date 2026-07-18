/** Shared fields present on all WalletAssets variants (EVM, SVM, Cosmos). */
export interface WalletAssetsCommon<TToken = Record<string, unknown>> {
  chain: string;
  chainName: string;
  native: WalletAssetPrice;
  tokens: TToken[];
  errors: string[];
  totalValueEur: number;
  scanMs: number;
  phases?: ScanPhases;
  /** Cache efficiency stats for this chain scan. */
  cacheStats?: CacheStats;
}

/** Cache efficiency metrics returned per-chain in scan results. */
export interface CacheStats {
  hits: number;
  misses: number;
  stale: number;
  skipped: number;
}

export interface WalletAssetPrice {
  symbol: string;
  balance: number;
  priceEur: number | null;
  valueEur: number | null;
  logoUrl?: string;
  priceSource?: string | null;
}

/** Internal provenance carried by enriched token-compatible assets. */
export interface WalletAssetProvenance {
  providerVerified?: boolean;
  providerId?: string;
  providerPositionId?: string;
  providerGroupId?: string;
}

export interface ScanPhases {
  nativeMs: number;
  discoveryMs: number;
  balancesMs: number;
  pricingMs: number;
}
