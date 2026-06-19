export interface DiscoveredToken {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  source?: "registry" | "logs" | "indexer";
  logoUrl?: string;
}

export function makeToken(contract: string, symbol: string, name: string, decimals: number, logoUrl?: string): DiscoveredToken {
  return { contract: contract.toLowerCase(), symbol, name, decimals, source: "registry", logoUrl };
}

export interface TokenDiscovery {
  discoverTokensForWallet(address: string, chainKey: string): Promise<DiscoveredToken[]>;
}
