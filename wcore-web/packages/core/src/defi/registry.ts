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
  // Compound V3 (Compound III) positions are NOT in the static registry.
  // They are discovered on-chain at scan time via discoverCompoundV3CTokens +
  // getCompoundV3Tokens (in compound-v3.ts), which queries Comet.numAssets() +
  // getAssetInfo(i).asset to enumerate cToken addresses per collateral type.
  // Each cToken address is unique per collateral, eliminating the collision
  // between multiple collaterals on the same Comet market that the old
  // Comet-proxy-as-contract static entries caused.
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

export function buildDefaultDeFiPositionMetadata(
  chain: string,
  contract: string,
  symbol: string,
  type: import("./positions.js").PositionType,
): DeFiPositionRegistryEntry {
  return {
    chain: String(chain || "").trim().toUpperCase(),
    contract: String(contract || "").trim().toLowerCase(),
    symbol: String(symbol || "").trim(),
    protocol: "compound-v3",
    type,
    liquidityStatus: "flex",
    confidence: "high",
  };
}

export function listDeFiPositionRegistryEntries(): readonly DeFiPositionRegistryEntry[] {
  return entries;
}
