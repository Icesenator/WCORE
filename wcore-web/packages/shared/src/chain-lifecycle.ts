/**
 * Permanently retired networks: no wallet action, RPC call, scan or new GM.
 * Identifiers are chain keys, decimal chain ids and hex chain ids — never token
 * symbols: the $B3 token on Base (chain BASE) and the B2 chain are not concerned.
 * Mirrors WCORE_REMOVED_CHAINS in wcore-gsheet/src/19_CHAIN_FACTORY.gs.
 */
const RETIRED_CHAINS: ReadonlyArray<{ label: string; code: string; ids: readonly string[] }> = [
  // Superseed L2, not Ethereum or its SUPR token.
  { label: "Superseed L2", code: "SUPERSEED (5330)", ids: ["superseed", "sseed", "5330", "0x14d2"] },
  // B3 Mainnet: network closed, withdrawals closed on 2026-10-31.
  { label: "B3 Mainnet (8333)", code: "B3 (8333)", ids: ["b3", "8333", "0x208d"] },
];

/** Tombstone code shared with GAS (`[CHAIN_REMOVED] <code>`), or null. */
export function getRetiredChainCode(key: string): string | null {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return RETIRED_CHAINS.find((chain) => chain.ids.includes(normalized))?.code ?? null;
}

/** Display label of a retired network, or null when the key is active or unknown. */
export function getRetiredChainLabel(key: string): string | null {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return RETIRED_CHAINS.find((chain) => chain.ids.includes(normalized))?.label ?? null;
}

export function isRetiredChain(key: string): boolean {
  return getRetiredChainLabel(key) !== null;
}

/** Numeric form, for wallet calls that carry a chain id rather than a key. */
export function isRetiredChainId(chainId: number | string): boolean {
  if (typeof chainId === "number") return Number.isInteger(chainId) && isRetiredChain(String(chainId));
  const raw = String(chainId ?? "").trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(raw)) return isRetiredChain(String(parseInt(raw, 16)));
  return /^\d+$/.test(raw) && isRetiredChain(raw);
}

/** Migrate legacy selections without hiding unknown, newly supported chains. */
export function filterActiveChainKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !isRetiredChain(key));
}
