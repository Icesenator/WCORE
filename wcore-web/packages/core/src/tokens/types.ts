import type { PositionMetadata } from "../defi/index.js";

export interface DiscoveredToken {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  source?: "registry" | "logs" | "indexer";
  logoUrl?: string;
  defi?: PositionMetadata;
  // Optional asset identity used for pricing and display when `contract` is a
  // protocol call target (for example Compound V3 Comet collateral reads).
  pricingContract?: string;
  // For non-standard ERC-20 contracts (no standard balanceOf): the 4-byte
  // selector of a single-arg (address) view function returning uint256 (the
  // user's balance). Example: WCT Stake Weight uses locks(address) -> (uint128,uint64)
  // and WCT Reward Distributor uses claim(address) -> uint256.
  balanceSelector?: string;
  // For functions that take arguments after the user address (e.g.
  // collateralBalanceOf(address,address) where the second arg is the collateral
  // asset). Each string is ABI-encoded (32 bytes, padded). Appended to the
  // call data after the user address. Example: wrsETH collateral on Comet.
  balanceSelectorExtraArgs?: string[];
}

export function makeToken(contract: string, symbol: string, name: string, decimals: number, logoUrl?: string): DiscoveredToken {
  return { contract: contract.toLowerCase(), symbol, name, decimals, source: "registry", logoUrl };
}

export interface TokenDiscovery {
  discoverTokensForWallet(address: string, chainKey: string): Promise<DiscoveredToken[]>;
}
