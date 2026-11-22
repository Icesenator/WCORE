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
  // Moonbeam et Moonriver : GLMR et MOVR migres vers Base (migration close le 2026-07-31), reseaux arretes ou figes.
  // Les jetons GLMR/MOVR ne sont pas concernes : seuls la cle de chaine et les identifiants 1284/1285 figurent ici.
  { label: "Moonbeam (1284)", code: "MOONBEAM (1284)", ids: ["moonbeam", "1284", "0x504"] },
  { label: "Moonriver (1285)", code: "MOONRIVER (1285)", ids: ["moonriver", "1285", "0x505"] },
  // Swellchain : depots coupes le 2026-05-05, retraits jusqu'au 2026-06-15, reseau arrete le 2026-06-30 (annonce Swell).
  // Le jeton SWELL n'est pas concerne : seuls la cle de chaine et les identifiants 1923 / 0x783 figurent ici.
  { label: "Swellchain (1923)", code: "SWELLCHAIN (1923)", ids: ["swellchain", "1923", "0x783"] },
  // ZERO Network : arret annonce pour le 2026-07-31 (page d'aide Zerion), chaine constatee a l'arret.
  // Le jeton ZERO n'est pas concerne : seuls la cle de chaine et les identifiants 543210 / 0x849ea figurent ici.
  { label: "ZERO Network (543210)", code: "ZERO (543210)", ids: ["zero", "543210", "0x849ea"] },
  // RPC publics tous hors service, domaines RPC disparus (constat WCORE du 2026-11-22) ; les jetons ne sont pas concernés.
  { label: "Nexus Mainnet (3946)", code: "NEXUS (3946)", ids: ["nexus", "3946", "0xf6a"] },
  { label: "AirDAO (16718)", code: "AIRDAO (16718)", ids: ["airdao", "16718", "0x414e"] },
  { label: "Crossbell (3737)", code: "CROSSBELL (3737)", ids: ["crossbell", "3737", "0xe99"] },
  { label: "Edgeless (2026)", code: "EDGELESS (2026)", ids: ["edgeless", "2026", "0x7ea"] },
  { label: "Lumio (8866)", code: "LUMIO (8866)", ids: ["lumio", "8866", "0x22a2"] },
  { label: "Dogechain (2000)", code: "DOGECHAIN (2000)", ids: ["dogechain", "2000", "0x7d0"] },
  { label: "Hychain (2911)", code: "HYCHAIN (2911)", ids: ["hychain", "2911", "0xb5f"] },
  { label: "Proof of Play Apex (70700)", code: "PROOF_OF_PLAY_APEX (70700)", ids: ["proof_of_play_apex", "70700", "0x1142c"] },
  { label: "Step Network (1234)", code: "STEP_NETWORK (1234)", ids: ["step_network", "1234", "0x4d2"] },
  { label: "Shimmer EVM (148)", code: "SHIMMER_EVM (148)", ids: ["shimmer_evm", "148", "0x94"] },
  { label: "Lorenzo (8329)", code: "LORENZO (8329)", ids: ["lorenzo", "8329", "0x2089"] },
  { label: "DOS Chain (7979)", code: "DOS_CHAIN (7979)", ids: ["dos_chain", "7979", "0x1f2b"] },
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
