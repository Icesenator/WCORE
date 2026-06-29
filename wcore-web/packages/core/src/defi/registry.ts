import type { PositionMetadata } from "./positions.js";

export interface DeFiPositionRegistryEntry extends PositionMetadata {
  chain: string;
  contract: string;
  symbol?: string;
}

const entries: DeFiPositionRegistryEntry[] = [
  {
    chain: "BASE",
    contract: "0x8a337e3f2b63e869b085354ce28dd5902a5db038",
    symbol: "SDAYS",
    protocol: "staked-mirror",
    type: "liquid_staking",
    underlying: "0xb58372a5bb18e10229e680d8bcc4201ca3c98301",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "BASE",
    contract: "0x9ebe195d685f90b9be3449fe0628af20e15f729b",
    symbol: "SSWEET",
    protocol: "staked-mirror",
    type: "liquid_staking",
    underlying: "0x8da2a47f76d928a97a8f44498db25aa787198087",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf",
    symbol: "WCT Claimable",
    protocol: "walletconnect-staking",
    type: "claimable",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0x521b4c065bbdbe3e20b3727340730936912dfa46",
    symbol: "WCT Stake",
    protocol: "walletconnect-staking",
    type: "staking_locked",
    underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945",
    liquidityStatus: "lock",
    confidence: "high",
    pricing: { mode: "mirror_underlying", sign: "asset" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    symbol: "Comp WETH Borrow",
    protocol: "compound-v3",
    type: "lending_debt",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "debt" },
  },
  {
    chain: "OPTIMISM",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    symbol: "Comp wrsETH",
    protocol: "compound-v3",
    type: "lending_collateral",
    underlying: "native",
    liquidityStatus: "flex",
    confidence: "high",
    pricing: { mode: "mirror_native", sign: "asset" },
  },
];

function norm(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function getDeFiPositionMetadata(chain: string, contract: string, symbol?: string): DeFiPositionRegistryEntry | undefined {
  const chainKey = String(chain || "").trim().toUpperCase();
  const c = norm(contract);
  const s = norm(symbol || "");

  const symbolSpecific = entries.find((entry) => entry.chain === chainKey && norm(entry.contract) === c && entry.symbol && norm(entry.symbol) === s);
  if (symbolSpecific) return symbolSpecific;

  return entries.find((entry) => entry.chain === chainKey && norm(entry.contract) === c && !entry.symbol);
}

export function listDeFiPositionRegistryEntries(): readonly DeFiPositionRegistryEntry[] {
  return entries;
}
