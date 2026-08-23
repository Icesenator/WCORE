import { apiPost } from "./api";

export type FunnelCampaign = "one_portfolio" | "clean_total" | "unknown";
export type FunnelSurface = "home" | "wallet";
export type FunnelVariant = "control";
export type FunnelEventName =
  | "campaign_landing_viewed"
  | "scan_started"
  | "scan_completed"
  | "scan_failed"
  | "portfolio_action";

export type WalletCountBucket = "1" | "2_3" | "4_plus";
export type ChainCountBucket = "1_5" | "6_20" | "21_50" | "51_plus";
export type DurationBucket = "lt_5s" | "5_15s" | "15_60s" | "60s_plus";
export type AuthState = "anonymous" | "ready" | "authenticated";
export type ScanMode = "standard" | "deep";
export type ScanResult = "success" | "partial" | "failed";
export type PortfolioAction = "add" | "refresh" | "export" | "tab_overview" | "tab_wallets" | "tab_tokens";

export interface FunnelDimensions {
  walletCount?: WalletCountBucket;
  chainCount?: ChainCountBucket;
  duration?: DurationBucket;
  authState?: AuthState;
  scanMode?: ScanMode;
  result?: ScanResult;
  action?: PortfolioAction;
}

export interface FunnelEvent {
  event: FunnelEventName;
  campaign: FunnelCampaign;
  surface: FunnelSurface;
  variant: FunnelVariant;
  dimensions: FunnelDimensions;
}

export interface ScanFinishedInput {
  campaign: FunnelCampaign;
  walletCount: number;
  durationMs: number;
  wallets: Array<{
    error?: string;
    chains: Array<{
      chainKey: string;
      degraded: boolean;
      errors: unknown[];
      hasAssets?: boolean;
    }>;
  }>;
}

export function normalizeCampaign(value: string | null | undefined): FunnelCampaign {
  if (value === "one_portfolio") return "one_portfolio";
  if (value === "clean_total") return "clean_total";
  return "unknown";
}

export function bucketWalletCount(count: number): WalletCountBucket {
  if (count <= 1) return "1";
  if (count <= 3) return "2_3";
  return "4_plus";
}

export function bucketChainCount(count: number): ChainCountBucket {
  if (count <= 5) return "1_5";
  if (count <= 20) return "6_20";
  if (count <= 50) return "21_50";
  return "51_plus";
}

export function bucketDuration(durationMs: number): DurationBucket {
  if (durationMs < 5_000) return "lt_5s";
  if (durationMs < 15_000) return "5_15s";
  if (durationMs < 60_000) return "15_60s";
  return "60s_plus";
}

export function buildScanFinishedEvent(input: ScanFinishedInput): FunnelEvent {
  const chains = input.wallets.flatMap(wallet => wallet.chains);
  const successfulChains = chains.filter(chain => !chain.degraded && chain.errors.length === 0);
  const failed = successfulChains.length === 0;
  const partial = !failed && (chains.some(chain => chain.degraded || chain.errors.length > 0) || input.wallets.some(wallet => !!wallet.error));

  return {
    event: failed ? "scan_failed" : "scan_completed",
    campaign: input.campaign,
    surface: "wallet",
    variant: "control",
    dimensions: {
      walletCount: bucketWalletCount(input.walletCount),
      chainCount: bucketChainCount(new Set(chains.map(chain => chain.chainKey)).size),
      duration: bucketDuration(input.durationMs),
      result: failed ? "failed" : partial ? "partial" : "success",
    },
  };
}

export function serializeFunnelEvent(event: FunnelEvent): { events: FunnelEvent[] } {
  const dimensions: FunnelDimensions = {};
  if (event.dimensions.walletCount) dimensions.walletCount = event.dimensions.walletCount;
  if (event.dimensions.chainCount) dimensions.chainCount = event.dimensions.chainCount;
  if (event.dimensions.duration) dimensions.duration = event.dimensions.duration;
  if (event.dimensions.authState) dimensions.authState = event.dimensions.authState;
  if (event.dimensions.scanMode) dimensions.scanMode = event.dimensions.scanMode;
  if (event.dimensions.result) dimensions.result = event.dimensions.result;
  if (event.dimensions.action) dimensions.action = event.dimensions.action;

  return {
    events: [{
      event: event.event,
      campaign: event.campaign,
      surface: event.surface,
      variant: event.variant,
      dimensions,
    }],
  };
}

export async function trackFunnelEvent(event: FunnelEvent): Promise<void> {
  try {
    await apiPost("/api/analytics/events", serializeFunnelEvent(event));
  } catch {
    return;
  }
}
