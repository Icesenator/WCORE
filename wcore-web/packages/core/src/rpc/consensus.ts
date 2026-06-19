// Strict majority consensus — port of v4.15.1 rule from src/05_RPC.gs:
//   bestCount * 2 > total
// A 2/4 tie is NOT consensus; majority must be strictly greater than half.

export interface ConsensusResult<T> {
  value: T | null;
  votes: number;
  total: number;
  consensus: boolean;
  buckets: { value: T; count: number }[];
}

export function reachConsensus<T>(
  values: ReadonlyArray<T | null | undefined>,
  serialize: (v: T) => string = (v) => JSON.stringify(v),
  opts: { total?: number } = {},
): ConsensusResult<T> {
  const buckets = new Map<string, { value: T; count: number }>();
  let successfulTotal = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    successfulTotal++;
    const key = serialize(v);
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
    else buckets.set(key, { value: v, count: 1 });
  }
  const total = Math.max(opts.total ?? successfulTotal, successfulTotal);
  let best: { value: T; count: number } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }
  const list = [...buckets.values()].sort((a, b) => b.count - a.count);
  if (!best || total === 0) {
    return { value: null, votes: 0, total, consensus: false, buckets: list };
  }
  const consensus = best.count * 2 > total;
  return {
    value: consensus ? best.value : null,
    votes: best.count,
    total,
    consensus,
    buckets: list,
  };
}
