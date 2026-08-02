import type { WalletAssets } from "@wcore/core";

export type ProviderId = "zerion" | "helius" | "etherscan" | "lifi-earn";
export type EnrichmentPurpose = "complex-positions" | "wallet-hints" | "diagnostics";

export const DISABLED_PROVIDER_IDS = ["helius", "etherscan", "lifi-earn"] as const satisfies readonly ProviderId[];

export interface ProviderCapabilities {
  readonly requestScope: "wallet" | "chain";
  readonly purposes: readonly EnrichmentPurpose[];
  /** A provider must declare a positive integer request ceiling. */
  readonly maxRequests: number;
}

export interface ProviderRequestContext {
  readonly address: string;
  readonly requestedChains: readonly string[];
  readonly purposes: readonly EnrichmentPurpose[];
  readonly maxPositions: number;
}

export interface ProviderWalletHint {
  readonly chain: string;
  readonly contract: string;
}

export type NormalizedPositionType =
  | "collateral"
  | "vault_share"
  | "lending_debt"
  | "staking_locked"
  | "staking_liquid"
  | "claimable"
  | "real_world_asset"
  | "unknown_defi";

export interface NormalizedProviderPosition {
  readonly provider: ProviderId;
  readonly chain: string;
  readonly protocol: string;
  readonly type: NormalizedPositionType;
  readonly contract?: string;
  readonly underlyingContract?: string;
  readonly receiptContract?: string;
  readonly poolAddress?: string;
  /** Provider-owned opaque identifier. Consumers must not parse it. */
  readonly positionId: string;
  readonly groupId?: string;
  readonly balance: number;
  readonly priceEur: number | null;
  readonly valueEur: number;
  readonly liquidity: "liquid" | "locked" | "claimable" | "unknown";
  readonly providerVerified: true;
}

export interface ProviderPortfolioSnapshot {
  readonly provider: ProviderId;
  readonly walletHints: readonly ProviderWalletHint[];
  readonly positions: readonly NormalizedProviderPosition[];
  readonly derivedPositionValueEur: number;
  readonly observedAt: string;
  readonly diagnostics: Readonly<Record<string, number | string | boolean>>;
}

export interface PortfolioEnrichmentInput {
  readonly address: string;
  readonly requestedChains: readonly string[];
  readonly assetsByChain: ReadonlyMap<string, WalletAssets>;
}

export interface PortfolioEnrichmentResult {
  readonly assetsByChain: Map<string, WalletAssets>;
  readonly diagnostics: Readonly<Record<string, number | string | boolean>>;
}

export interface PortfolioEnrichmentProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  supports(address: string): boolean;
  load(context: ProviderRequestContext): Promise<ProviderPortfolioSnapshot>;
}

export interface PortfolioEnrichmentService {
  enrich(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult>;
}
