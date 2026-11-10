import { getChain } from "../chains/index.js";

/**
 * Pagination bornée d'eth_getLogs (P2-CHAIN-LOG-RANGE-OPENLEDGER-ZKLINK, 2026-11-09).
 *
 * Certains nœuds refusent plus de N blocs par appel (rpc.openledger.xyz, Pocket zkLink Nova :
 * HTTP 400 -32602 au-delà de 1 000). Plafonner la fenêtre tronquerait silencieusement la
 * découverte ; on découpe donc la fenêtre existante en segments contigus de N blocs au plus.
 * Une couverture incomplète reste PARTIAL et borne le curseur incrémental au dernier bloc
 * couvert sans trou : la suite est reprise au scan suivant, jamais déclarée couverte.
 */

/** Budget par direction (from/to) et par scan : 10 segments couvrent 10 000 blocs de 1 000. */
export const LOG_PAGINATION_MAX_CHUNKS_PER_DIRECTION = 10;

export interface LogCoverage {
  fromBlock: number;
  toBlock: number;
  chunkSize: number;
  /** Segments prévus (2 directions). */
  chunksPlanned: number;
  /** Segments lancés (2 directions). */
  chunksAttempted: number;
  /** Segments réussis (2 directions). */
  chunksSucceeded: number;
  /** Dernier bloc couvert sans trou depuis fromBlock dans les deux directions, ou null. */
  completeThrough: number | null;
  complete: boolean;
  /** Premier bloc restant à couvrir, ou null si la fenêtre est complète. */
  pendingFrom: number | null;
}

/** Segments inclusifs, contigus, sans doublon : [from..to] découpé en tranches de `size` blocs. */
export function planLogChunks(fromBlock: number, toBlock: number, size: number): Array<[number, number]> {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`invalid log chunk size: ${size}`);
  const chunks: Array<[number, number]> = [];
  for (let start = fromBlock; start <= toBlock; start += size) {
    chunks.push([start, Math.min(start + size - 1, toBlock)]);
  }
  return chunks;
}

/** Pagination activée uniquement par `RPC.PAGINATE_LOGS === true` avec un `RPC.MAX_LOG_RANGE` valide. */
export function resolveLogPagination(chainKey: string): { paginate: boolean; chunkSize?: number } {
  const chain = getChain(String(chainKey || "").trim().toUpperCase());
  const range = chain?.RPC?.MAX_LOG_RANGE;
  if (chain?.RPC?.PAGINATE_LOGS !== true) return { paginate: false };
  if (typeof range !== "number" || !Number.isInteger(range) || range <= 0) return { paginate: false };
  return { paginate: true, chunkSize: range };
}

/**
 * Prochaine valeur du curseur incrémental, ou undefined pour ne pas l'écrire (l'ancien reste).
 * - Chaîne non paginée, ou logs non parcourus : comportement historique (tête de fenêtre).
 * - Chaîne paginée : jamais au-delà du dernier bloc couvert sans trou, jamais en arrière.
 */
export function nextDiscoveryCursor(params: {
  paginated: boolean;
  currentBlock: number;
  cachedLastBlock?: number;
  coverage?: LogCoverage;
}): number | undefined {
  const { paginated, currentBlock, cachedLastBlock, coverage } = params;
  if (!paginated || !coverage) return currentBlock > 0 ? currentBlock : undefined;
  const target = coverage.complete ? coverage.toBlock : coverage.completeThrough;
  if (target == null || target <= 0) return undefined;
  if (cachedLastBlock != null && target <= cachedLastBlock) return undefined;
  return target;
}

export function formatPartialCoverageError(c: LogCoverage): string {
  const covered = c.completeThrough == null ? "none" : `0x${c.fromBlock.toString(16)}-0x${c.completeThrough.toString(16)}`;
  const pending = c.pendingFrom == null ? "none" : `0x${c.pendingFrom.toString(16)}-0x${c.toBlock.toString(16)}`;
  return `[logs] PARTIAL coverage ${covered} of 0x${c.fromBlock.toString(16)}-0x${c.toBlock.toString(16)}; pending ${pending}; chunks ${c.chunksSucceeded}/${c.chunksPlanned}`;
}
