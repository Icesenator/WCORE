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
  | "lending-supply"
  | "lending-borrow"
  | "liquidity-pool"
  | "staking"
  | "liquid-staking"
  | "restaking"
  | "vault"
  | "farming"
  | "vesting";

export interface NormalizedProviderPosition {
  readonly provider: ProviderId;
  readonly chain: string;
  readonly protocol: string;
  readonly type: NormalizedPositionType;
  readonly contract?: string;
  readonly underlying?: string;
  readonly receipt?: string;
  readonly pool?: string;
  readonly group?: string;
  /** Provider-owned opaque identifier. Consumers must not parse it. */
  readonly positionId: string;
  readonly balance: number | null;
  readonly priceEur: number | null;
  readonly valueEur: number | null;
  readonly liquidity: "liquid" | "locked" | "unknown";
  readonly providerVerified: true;
}

export interface ProviderDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface ProviderPortfolioSnapshot {
  readonly provider: ProviderId;
  readonly walletHints: readonly ProviderWalletHint[];
  readonly positions: readonly NormalizedProviderPosition[];
  readonly derivedPositionValueEur: number;
  readonly observedAt: string;
  readonly diagnostics: readonly ProviderDiagnostic[];
}

export interface PortfolioEnrichmentInput {
  readonly address: string;
  readonly requestedChains: readonly string[];
  readonly assetsByChain: ReadonlyMap<string, WalletAssets>;
}

export interface PortfolioEnrichmentResult {
  readonly assetsByChain: Map<string, WalletAssets>;
  readonly diagnostics: readonly ProviderDiagnostic[];
}

export interface PortfolioEnrichmentProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  enrich(context: ProviderRequestContext): Promise<ProviderPortfolioSnapshot>;
}

export interface PortfolioEnrichmentService {
  enrich(input: PortfolioEnrichmentInput): Promise<PortfolioEnrichmentResult>;
}
