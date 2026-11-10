import { EvmRpc, RpcDispatcher } from "../rpc/index.js";
import { TRANSFER_EVENT_TOPIC } from "./abi.js";
import {
  LOG_PAGINATION_MAX_CHUNKS_PER_DIRECTION,
  formatPartialCoverageError,
  planLogChunks,
  type LogCoverage,
} from "./log-pagination.js";

export interface TransferLog {
  address: string;
  topics?: string[];
}

export interface TransferLogDiscoveryParams {
  address: string;
  endpoints: string[];
  dispatcher: RpcDispatcher;
  rpc: EvmRpc;
  fromBlock?: string;
  toBlock?: string;
  /** Blocks per eth_getLogs call (chain RPC.LOG_CHUNK_BLOCKS); invalid or absent = LOG_CHUNK_SIZE. */
  chunkBlocks?: number;
  /**
   * Pagination bornée (chaînes `RPC.PAGINATE_LOGS`) : taille maximale d'un segment eth_getLogs.
   * Absent : comportement historique (segments de chunkBlocks, sinon 10 000 blocs, au-delà de cette taille).
   */
  maxBlockRange?: number;
  /** Budget de segments par direction pour ce scan (pagination seulement). */
  maxChunksPerDirection?: number;
  /** Segments en vol par direction (pagination seulement) ; défaut LOG_CHUNK_CONCURRENCY. */
  chunkConcurrency?: number;
}

export interface TransferLogDiscoveryResult {
  contracts: string[];
  errors: string[];
  /** Couverture vérifiable de la fenêtre, fournie seulement en mode paginé. */
  coverage?: LogCoverage;
}

const LOG_CHUNK_SIZE = 10_000;
const LOG_CHUNK_CONCURRENCY = 5;

async function discoverLogsInRange(
  _dispatcher: RpcDispatcher,
  endpoints: string[],
  rpc: EvmRpc,
  topics: (string | null)[],
  fromBlock: string,
  toBlock: string,
): Promise<{ contracts: string[]; errors: string[]; ok: boolean }> {
  // Discovery doesn't need consensus — just find contracts. Fallback to next endpoint if one fails.
  const found = new Set<string>();
  const errors: string[] = [];
  const filter = { fromBlock, toBlock, topics };
  for (const endpoint of endpoints) {
    try {
      const logs = await rpc.call<TransferLog[]>(endpoint, "eth_getLogs", [filter]);
      for (const log of logs ?? []) {
        const contract = normalizeAddress(log.address);
        if (contract) found.add(contract);
      }
      // v4.16.66(web): un fallback réussi ne propage PAS les échecs des
      // endpoints précédents. Sinon une simple avance de tête de bloc d'un
      // nœud ("after last accepted block" / "block not found ... not yet
      // available") empoisonnait errors[] et basculait le scan en dégradé
      // alors que la découverte a abouti. La santé RPC est déjà tracée par
      // rpc-health ; ici seul le résultat final compte.
      return { contracts: [...found], errors: [], ok: true };
    } catch (err) {
      errors.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { contracts: [], errors, ok: false };
}

const toHex = (n: number) => `0x${n.toString(16)}`;

export async function discoverTokensByTransferLogs(params: TransferLogDiscoveryParams): Promise<TransferLogDiscoveryResult> {
  const addressTopic = topicForAddress(params.address);
  const fromBlock = params.fromBlock ?? "latest";
  const toBlock = params.toBlock ?? "latest";
  const found = new Set<string>();
  const errors: string[] = [];

  const fromNum = parseInt(String(fromBlock), 16);
  const toNum = parseInt(String(toBlock), 16);
  const numeric = !isNaN(fromNum) && !isNaN(toNum) && toNum >= fromNum;
  // Taille de segment par chaîne (RPC.LOG_CHUNK_BLOCKS), sinon LOG_CHUNK_SIZE.
  const baseChunkSize = typeof params.chunkBlocks === "number" && Number.isSafeInteger(params.chunkBlocks) && params.chunkBlocks > 0
    ? params.chunkBlocks
    : LOG_CHUNK_SIZE;
  const paginate = numeric && typeof params.maxBlockRange === "number"
    && Number.isInteger(params.maxBlockRange) && params.maxBlockRange > 0;
  // Pagination bornée : jamais un segment plus large que ce que le nœud accepte.
  const chunkSize = paginate ? Math.min(params.maxBlockRange!, baseChunkSize) : baseChunkSize;
  // If block range is numeric and large, chunk it to avoid RPC rejection.
  const shouldChunk = paginate || (numeric && toNum - fromNum > chunkSize);
  // Segments inclusifs et contigus : l'ancienne boucle `chunkFrom < toNum` sautait toBlock
  // quand l'écart était un multiple exact de la taille de segment.
  const plan = shouldChunk ? planLogChunks(fromNum, toNum, chunkSize) : [];
  const budget = paginate
    ? Math.max(1, Math.min(params.maxChunksPerDirection ?? LOG_PAGINATION_MAX_CHUNKS_PER_DIRECTION, plan.length))
    : plan.length;
  const concurrency = paginate
    ? Math.max(1, Math.min(params.chunkConcurrency ?? LOG_CHUNK_CONCURRENCY, LOG_CHUNK_CONCURRENCY))
    : LOG_CHUNK_CONCURRENCY;

  async function discoverForTopicIndex(topicIndex: 1 | 2): Promise<{ contracts: string[]; errors: string[]; ok: boolean[]; attempted: number }> {
    const topicFound = new Set<string>();
    const topicErrors: string[] = [];
    const topics = topicIndex === 1
      ? [TRANSFER_EVENT_TOPIC, addressTopic]
      : [TRANSFER_EVENT_TOPIC, null, addressTopic];
    const ok: boolean[] = [];
    let attempted = 0;

    if (shouldChunk) {
      const chunks = plan.slice(0, budget);
      // Process chunks in parallel groups, oldest first, so the covered prefix stays contiguous.
      for (let i = 0; i < chunks.length; i += concurrency) {
        const group = chunks.slice(i, i + concurrency);
        attempted += group.length;
        const results = await Promise.all(group.map(([from, to]) =>
          discoverLogsInRange(params.dispatcher, params.endpoints, params.rpc, topics, toHex(from), toHex(to)),
        ));
        let groupFailed = false;
        for (const result of results) {
          topicErrors.push(...result.errors);
          for (const c of result.contracts) topicFound.add(c);
          ok.push(result.ok);
          if (!result.ok) groupFailed = true;
        }
        // Pagination : un groupe en échec arrête le parcours (pas de rafale contre un nœud
        // en 400/429/502) ; la suite est reportée au scan suivant via le curseur.
        if (paginate && groupFailed) break;
      }
    } else {
      attempted = 1;
      const result = await discoverLogsInRange(
        params.dispatcher, params.endpoints, params.rpc, topics, fromBlock, toBlock,
      );
      topicErrors.push(...result.errors);
      for (const c of result.contracts) topicFound.add(c);
      ok.push(result.ok);
    }
    return { contracts: [...topicFound], errors: topicErrors, ok, attempted };
  }

  const results = await Promise.all([discoverForTopicIndex(1), discoverForTopicIndex(2)]);
  for (const result of results) {
    errors.push(...result.errors);
    for (const c of result.contracts) found.add(c);
  }

  if (!paginate) return { contracts: [...found], errors };

  // Préfixe contigu réussi par direction, puis minimum des deux directions.
  const prefixEnd = (ok: boolean[]): number | null => {
    let end: number | null = null;
    for (let i = 0; i < ok.length; i++) {
      if (!ok[i]) break;
      end = plan[i]![1];
    }
    return end;
  };
  const ends = results.map((r) => prefixEnd(r.ok));
  const completeThrough = ends.some((e) => e == null) ? null : Math.min(...(ends as number[]));
  const complete = completeThrough === toNum;
  const coverage: LogCoverage = {
    fromBlock: fromNum,
    toBlock: toNum,
    chunkSize,
    chunksPlanned: plan.length * 2,
    chunksAttempted: results.reduce((s, r) => s + r.attempted, 0),
    chunksSucceeded: results.reduce((s, r) => s + r.ok.filter(Boolean).length, 0),
    completeThrough,
    complete,
    pendingFrom: complete ? null : (completeThrough == null ? fromNum : completeThrough + 1),
  };
  // Une couverture incomplète n'est jamais silencieuse : ce marqueur n'est pas bénin et garde
  // le scan DEGRADED tant que la fenêtre n'est pas couverte.
  if (!complete) errors.push(formatPartialCoverageError(coverage));
  return { contracts: [...found], errors, coverage };
}

export function topicForAddress(address: string): string {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("invalid EVM address");
  return `0x${normalized.replace(/^0x/, "").padStart(64, "0")}`;
}

function normalizeAddress(address: string): string | null {
  const value = String(address || "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) ? value : null;
}
