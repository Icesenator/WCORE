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
  /**
   * ISO time the result was observed, set only when it is served from the scan-result cache
   * (up to SCAN_RESULT_CACHE_TTL_MS old). Absent on a result scanned for this request.
   */
  cachedAt?: string;
  /**
   * One explicit outcome per requested custom token (customTokens), so a caller never has to
   * read an absent token as "sold": "held" = positive balance, "zero" = zero confirmed by a
   * reliable live read, "unknown" = read failed, unreliable vote, unsupported or not read.
   */
  requestedTokens?: RequestedTokenStatus[];
}

export type RequestedTokenStatusValue = "held" | "zero" | "unknown";

export interface RequestedTokenStatus {
  contract: string;
  status: RequestedTokenStatusValue;
  reason?: string;
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
  /** STALE_IS_NOT_FRESH: set when priceEur comes from the stale-cache fallback. */
  priceStale?: boolean;
  /** Epoch ms at which a stale price was observed. */
  priceTs?: number;
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
