// GeckoTerminal Security Score client — batched, timeout-guarded, fail-graceful.
// GT exposes a 0-100 risk score + holder distribution that GoPlus does not.
// Docs: https://www.geckoterminal.com/dex-api
// Design: enriches ScamEnrichment.gt so detectScam can use market structure.

export interface GtScoreDetails {
  pool?: number;
  transaction?: number;
  creation?: number;
  info?: number;
  holders?: number;
}

export interface GtHolderDistribution {
  top_10?: number;
  "11_30"?: number;
  "31_50"?: number;
  rest?: number;
}

export interface GtVerdict {
  available: boolean;
  gtScore?: number; // 0-100 (GT Security Score)
  gtScoreDetails?: GtScoreDetails;
  gtVerified?: boolean;
  holderCount?: number;
  holderDistribution?: GtHolderDistribution; // percentages (0-100)
  isHoneypot?: boolean;
  categories?: string[];
}

const UNAVAILABLE = (): GtVerdict => ({ available: false });

// chainId → GT network slug (only chains GT covers with a /tokens/{addr}/info endpoint)
// Slugs verified against GET /api/v2/networks on 2026-08-27.
const CHAIN_TO_GT: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon_pos",
  10: "optimism",
  42161: "arbitrum",
  43114: "avax",
  8453: "base",
  480: "world-chain",
};

export function gtNetworkForChain(chainId: number): string | undefined {
  return CHAIN_TO_GT[chainId];
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseDistribution(raw: unknown): GtHolderDistribution | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, string>;
  return {
    top_10: num(r.top_10),
    "11_30": num(r["11_30"]),
    "31_50": num(r["31_50"]),
    rest: num(r.rest),
  };
}

function parseGtTokenInfo(payload: unknown): GtVerdict | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: { attributes?: Record<string, unknown> } }).data;
  const a = data?.attributes;
  if (!a) return null;
  const score = num(a.gt_score);
  const rawDetails = (a.gt_score_details ?? undefined) as Record<string, unknown> | undefined;
  const holders = (a.holders ?? undefined) as Record<string, unknown> | undefined;
  return {
    available: true,
    gtScore: score,
    gtScoreDetails: rawDetails
      ? {
          pool: num(rawDetails.pool),
          transaction: num(rawDetails.transaction),
          creation: num(rawDetails.creation),
          info: num(rawDetails.info),
          holders: num(rawDetails.holders),
        }
      : undefined,
    gtVerified: a.gt_verified === true,
    holderCount: num(holders?.count),
    holderDistribution: parseDistribution(holders?.distribution_percentage),
    isHoneypot: a.is_honeypot === true,
    categories: Array.isArray(a.categories) ? (a.categories as string[]) : undefined,
  };
}

export async function fetchGtVerdict(network: string, address: string, timeoutMs = 5_000): Promise<GtVerdict> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address.toLowerCase()}/info`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return UNAVAILABLE();
    return parseGtTokenInfo(await res.json()) ?? UNAVAILABLE();
  } catch {
    return UNAVAILABLE();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGtVerdicts(
  chainId: number,
  addresses: string[],
  timeoutMs = 5_000,
): Promise<Map<string, GtVerdict>> {
  const out = new Map<string, GtVerdict>();
  const network = gtNetworkForChain(chainId);
  if (!network) {
    for (const a of addresses) out.set(a, UNAVAILABLE());
    return out;
  }
  for (const batch of chunk(addresses, 8)) {
    const results = await Promise.all(batch.map(async (addr) => {
      const v = await fetchGtVerdict(network, addr, timeoutMs);
      return [addr.toLowerCase(), v] as [string, GtVerdict];
    }));
    for (const [k, v] of results) out.set(k, v);
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, size));
  return out;
}
