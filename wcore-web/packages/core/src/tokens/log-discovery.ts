import { EvmRpc, RpcDispatcher } from "../rpc/index.js";
import { TRANSFER_EVENT_TOPIC } from "./abi.js";

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
}

export interface TransferLogDiscoveryResult {
  contracts: string[];
  errors: string[];
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
): Promise<{ contracts: string[]; errors: string[] }> {
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
      return { contracts: [...found], errors };
    } catch (err) {
      errors.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { contracts: [], errors };
}

export async function discoverTokensByTransferLogs(params: TransferLogDiscoveryParams): Promise<TransferLogDiscoveryResult> {
  const addressTopic = topicForAddress(params.address);
  const fromBlock = params.fromBlock ?? "latest";
  const toBlock = params.toBlock ?? "latest";
  const found = new Set<string>();
  const errors: string[] = [];

  // If block range is numeric and large, chunk it to avoid RPC rejection
  const fromNum = parseInt(String(fromBlock), 16);
  const toNum = parseInt(String(toBlock), 16);
  const shouldChunk = !isNaN(fromNum) && !isNaN(toNum) && toNum - fromNum > LOG_CHUNK_SIZE;

  async function discoverForTopicIndex(topicIndex: 1 | 2): Promise<{ contracts: string[]; errors: string[] }> {
    const topicFound = new Set<string>();
    const topicErrors: string[] = [];
    const topics = topicIndex === 1
      ? [TRANSFER_EVENT_TOPIC, addressTopic]
      : [TRANSFER_EVENT_TOPIC, null, addressTopic];

    if (shouldChunk) {
      const chunks: Array<[string, string]> = [];
      for (let chunkFrom = fromNum; chunkFrom < toNum; chunkFrom += LOG_CHUNK_SIZE) {
        const chunkTo = Math.min(chunkFrom + LOG_CHUNK_SIZE - 1, toNum);
        chunks.push([`0x${chunkFrom.toString(16)}`, `0x${chunkTo.toString(16)}`]);
      }
      // Process chunks in parallel groups of LOG_CHUNK_CONCURRENCY
      for (let i = 0; i < chunks.length; i += LOG_CHUNK_CONCURRENCY) {
        const group = chunks.slice(i, i + LOG_CHUNK_CONCURRENCY);
        const results = await Promise.all(group.map(([from, to]) =>
          discoverLogsInRange(params.dispatcher, params.endpoints, params.rpc, topics, from, to),
        ));
        for (const result of results) {
          topicErrors.push(...result.errors);
          for (const c of result.contracts) topicFound.add(c);
        }
      }
    } else {
      const result = await discoverLogsInRange(
        params.dispatcher, params.endpoints, params.rpc, topics, fromBlock, toBlock,
      );
      topicErrors.push(...result.errors);
      for (const c of result.contracts) topicFound.add(c);
    }
    return { contracts: [...topicFound], errors: topicErrors };
  }

  const results = await Promise.all([discoverForTopicIndex(1), discoverForTopicIndex(2)]);
  for (const result of results) {
    errors.push(...result.errors);
    for (const c of result.contracts) found.add(c);
  }

  return { contracts: [...found], errors };
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
