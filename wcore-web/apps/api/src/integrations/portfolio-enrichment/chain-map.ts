const ZERION_CHAIN_MAP = {
  ethereum: "ETHEREUM",
  arbitrum: "ARBITRUM_ONE",
  optimism: "OPTIMISM",
  base: "BASE",
  polygon: "POLYGON",
  avalanche: "AVALANCHE",
  bsc: "BSC",
  gnosis: "GNOSIS",
  "zksync-era": "ZKSYNC_ERA",
  linea: "LINEA",
  scroll: "SCROLL",
  mantle: "MANTLE",
  blast: "BLAST",
  solana: "SOLANA",
} as const;

export function toWcoreChain(providerChain: string): string | undefined {
  const normalized = providerChain.trim().toLowerCase();
  return ZERION_CHAIN_MAP[normalized as keyof typeof ZERION_CHAIN_MAP];
}
