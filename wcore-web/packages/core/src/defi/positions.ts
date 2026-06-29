export type PositionType =
  | "wallet_token"
  | "staking_locked"
  | "claimable"
  | "lending_collateral"
  | "lending_debt"
  | "vault_share"
  | "liquid_staking"
  | "real_world_asset"
  | "unknown_defi";

export type LiquidityStatus = "flex" | "lock" | "unknown";

export interface PortfolioPosition {
  id: string;
  chain: string;
  protocol?: string;
  type: PositionType;
  label: string;
  name: string;
  contract: string;
  underlying?: string;
  balance: number;
  decimals: number;
  priceEur: number | null;
  valueEur: number | null;
  liquidityStatus?: LiquidityStatus;
  source: "registry" | "discovery" | "registry+rpc" | "api" | "cache";
  confidence: "high" | "medium" | "low";
}

export type PositionMetadata = Pick<PortfolioPosition, "protocol" | "type" | "underlying" | "liquidityStatus" | "confidence"> & {
  pricing?: {
    mode: "mirror_underlying" | "mirror_native" | "direct" | "none";
    sign?: "asset" | "debt";
  };
};

export interface TokenLikePositionInput {
  symbol: string;
  name: string;
  contract: string;
  balance: number;
  decimals: number;
  priceEur: number | null;
  valueEur: number | null;
}

export function liquiditySuffix(status?: LiquidityStatus): "" | "[Flex]" | "[Lock]" | "[Unknown]" {
  if (status === "flex") return "[Flex]";
  if (status === "lock") return "[Lock]";
  if (status === "unknown") return "[Unknown]";
  return "";
}

export function withLiquiditySuffix(name: string, meta: { type?: PositionType; liquidityStatus?: LiquidityStatus }): string {
  const base = String(name || "").trim();
  if (!meta.type || meta.type === "wallet_token") return base;
  const suffix = liquiditySuffix(meta.liquidityStatus);
  if (!suffix) return base;
  if (/\s\[(Flex|Lock|Unknown)\]$/.test(base)) return base;
  return `${base} ${suffix}`;
}

export function positionToTokenLike(position: PortfolioPosition): TokenLikePositionInput {
  return {
    symbol: position.label,
    name: withLiquiditySuffix(position.name, position),
    contract: position.contract,
    balance: position.balance,
    decimals: position.decimals,
    priceEur: position.priceEur,
    valueEur: position.valueEur,
  };
}
