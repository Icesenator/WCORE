// Scam enrichment loader — reads cached GoPlus verdicts (scam_verdicts), fetches
// missing/expired ones under the SCAN_ENRICHMENT feature flag, persists them and
// logs flagged decisions (scam_scan_logs). Fail-graceful by design: any error
// here must never degrade a scan (spec §2.5).
import type { PrismaClient } from "@wcore/db";
import type { ScamEnrichment, GoPlusSignal } from "@wcore/shared";

export type { GoPlusSignal };

const VERDICT_TTL_MS = 30 * 24 * 3600 * 1000; // 30d per spec §2.3
// Short TTL for "both providers had nothing" rows: retried daily so a token
// that later lists on GT/GoPlus (or a provider outage ends) is re-enriched,
// without re-querying every missing contract on every scan (quota exhaustion
// loop — incident 2026-09-03).
const MISS_TTL_MS = 24 * 3600 * 1000;
const MAX_CONTRACTS_PER_SCAN = 200;

export type ScamEnrichmentLoader =
  (chainId: number, contracts: string[]) => Promise<Map<string, ScamEnrichment>>;

export function isScamEnrichmentEnabled(): boolean {
  return process.env.SCAN_ENRICHMENT === "1";
}

function isEvmAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

type VerdictRow = {
  address: string;
  verdict: string;
  source: string;
  payload: unknown;
  updatedAt: Date;
};

function normalizePayload(payload: unknown): GoPlusSignal | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  if (p.available !== true) return undefined;
  return p as unknown as GoPlusSignal;
}

function normalizeCachedEnrichment(payload: unknown): ScamEnrichment | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  // v33+ combined payload.
  if ("goPlus" in p || "gt" in p) {
    const goPlus = normalizePayload(p.goPlus);
    const rawGt = p.gt;
    const gt = rawGt && typeof rawGt === "object" && (rawGt as Record<string, unknown>).available === true
      ? rawGt as ScamEnrichment["gt"]
      : undefined;
    if (!goPlus && !gt) return undefined;
    return { ...(goPlus ? { goPlus } : {}), ...(gt ? { gt } : {}) };
  }
  // Legacy v26-v32 payload: flat GoPlus object.
  const goPlus = normalizePayload(payload);
  return goPlus ? { goPlus } : undefined;
}

export function goPlusWeight(v: GoPlusSignal): number {
  let score = 0;
  if (v.isHoneypot) score += 2;
  if (v.isBlacklisted) score += 1;
  if (v.canTakeBackOwnership) score += 1;
  if (v.slippageModifiable) score += 1;
  if ((v.ownerPercent ?? 0) > 50) score += 2;
  return score;
}

export function classifyGoPlus(v: GoPlusSignal): "clean" | "suspicious" | "scam" {
  const score = goPlusWeight(v);
  if (score >= 6) return "scam";
  if (score >= 2) return "suspicious";
  return "clean";
}

export function createRpcBytecodeFetcher(
  resolveEndpoints: (chainId: number) => string[],
): (chainId: number, address: string) => Promise<string | null> {
  return async (chainId, address) => {
    const endpoints = resolveEndpoints(chainId).slice(0, 2);
    if (endpoints.length === 0) return null;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] });
    const attempts = endpoints.map(async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4_000);
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: ctrl.signal });
        if (!res.ok) return null;
        const hex = String((await res.json() as { result?: unknown }).result ?? "");
        if (!/^0x[0-9a-fA-F]+$/.test(hex) || hex.length <= 2) return null;
        const bytes = Buffer.from(hex.slice(2), "hex");
        return bytes.toString("latin1");
      } catch { return null; }
      finally { clearTimeout(timer); }
    });
    const results = await Promise.all(attempts);
    return results.find(Boolean) ?? null;
  };
}

export interface ScamEnrichmentDeps {
  prisma: PrismaClient;
  warn?: (msg: string) => void;
  bytecodeFetcher?: (chainId: number, address: string) => Promise<string | null>;
}

export function classifyMaliciousBytecode(ascii: string): GoPlusSignal | null {
  const lower = ascii.toLowerCase();
  const blacklistAt = lower.indexOf("blacklisted address");
  const blacklistPluralAt = lower.indexOf("blacklisted addresses");
  const antiSellAt = Math.max(blacklistAt, blacklistPluralAt);
  const antiSell = antiSellAt >= 0 && lower.slice(antiSellAt, antiSellAt + 160).includes("sell tokens");
  const phantom = lower.includes("invalid phantom amount")
    || lower.includes("exceeds phantom balance");
  if (!antiSell || !phantom) return null;
  return {
    available: true,
    isHoneypot: true,
    isBlacklisted: true,
    canTakeBackOwnership: true,
    isOpenSource: false,
    isInDex: false,
  };
}
export function createScamEnrichmentLoader(deps: ScamEnrichmentDeps): ScamEnrichmentLoader {
  const { prisma, warn, bytecodeFetcher } = deps;
  return async (chainId: number, contracts: string[]): Promise<Map<string, ScamEnrichment>> => {
    const out = new Map<string, ScamEnrichment>();
    try {
      if (!isScamEnrichmentEnabled() || !Number.isFinite(chainId) || chainId <= 0 || contracts.length === 0) {
        return out;
      }
      const addrs = [...new Set(contracts.map((c) => c.toLowerCase()))]
        .filter(isEvmAddress)
        .slice(0, MAX_CONTRACTS_PER_SCAN);
      if (addrs.length === 0) return out;

      let rows: VerdictRow[] = [];
      try {
        rows = await prisma.scamVerdict.findMany({ where: { chainId, address: { in: addrs } } });
      } catch (e) {
        warn?.(`scam-verdicts read failed: ${(e as Error).message}`);
      }

      const known = new Map(rows.map((r) => [r.address.toLowerCase(), r]));

      const now = Date.now();
      const fresh = new Map<string, ScamEnrichment>();
      const missingAll: string[] = [];
      const missingGt: string[] = [];
      for (const a of addrs) {
        const row = known.get(a);
        if (!row) { missingAll.push(a); continue; }
        // Admin verdicts are deliberate: they never expire and are applied as-is.
        if (row.source === "admin") {
          fresh.set(a, row.verdict === "clean" ? {} : {});
          continue;
        }
        if (row.source === "miss" && now - new Date(row.updatedAt).getTime() < MISS_TTL_MS) {
          continue; // recent total miss: skip silently, retry after MISS_TTL
        }
        if (now - new Date(row.updatedAt).getTime() < VERDICT_TTL_MS) {
          const cached = normalizeCachedEnrichment(row.payload);
          if (cached) {
            fresh.set(a, cached);
            if (!cached.gt) missingGt.push(a);
          } else {
            missingAll.push(a);
          }
        } else {
          missingAll.push(a);
        }
      }

      if (missingGt.length > 0) {
        const { fetchGtVerdicts } = await import("@wcore/core");
        const gtVerdicts = await fetchGtVerdicts(chainId, missingGt);
        for (const addr of missingGt) {
          const current = fresh.get(addr) ?? {};
          const gt = gtVerdicts.get(addr);
          if (!gt?.available) continue;
          const combined: ScamEnrichment = { ...current, gt };
          fresh.set(addr, combined);
          try {
            await prisma.scamVerdict.upsert({
              where: { chainId_address: { chainId, address: addr } },
              update: { source: "goplus+gt", payload: combined as object },
              create: { chainId, address: addr, verdict: "clean", source: "goplus+gt", payload: combined as object },
            });
          } catch (e) {
            warn?.(`scam-verdict GT backfill failed (${addr}): ${(e as Error).message}`);
          }
        }
      }

      if (missingAll.length > 0) {
        const { fetchGoPlusVerdicts, fetchGtVerdicts } = await import("@wcore/core");
        const [verdicts, gtVerdicts] = await Promise.all([
          fetchGoPlusVerdicts(chainId, missingAll),
          fetchGtVerdicts(chainId, missingAll),
        ]);
        // Tombstone misses ONLY when GoPlus actually answered: a GoPlus outage
        // must not open a 24h scam-detection blind spot (retry every scan).
        const canTombstone = verdicts.anyBatchSucceeded === true;
        const entries = [...verdicts.entries()];
        const resolvedEntries: Array<[string, GoPlusSignal, boolean]> = [];
        for (let i = 0; i < entries.length; i += 8) {
          const batch = entries.slice(i, i + 8);
          resolvedEntries.push(...await Promise.all(batch.map(async ([addr, v]) => {
            if (v.available || !bytecodeFetcher) return [addr, v, v.available] as [string, GoPlusSignal, boolean];
            try {
              const ascii = await bytecodeFetcher(chainId, addr);
              return [addr, ascii ? (classifyMaliciousBytecode(ascii) ?? v) : v, false] as [string, GoPlusSignal, boolean];
            } catch {
              return [addr, v, false] as [string, GoPlusSignal, boolean];
            }
          })));
        }
        for (const [addr, resolved, fromGoPlus] of resolvedEntries) {
          const enrichment: ScamEnrichment = {};
          if (resolved.available) enrichment.goPlus = resolved;
          const gt = gtVerdicts.get(addr);
          if (gt?.available) enrichment.gt = gt;
          if (enrichment.goPlus || enrichment.gt) {
            fresh.set(addr, enrichment);
          }
          if (enrichment.goPlus || enrichment.gt) {
            try {
              await prisma.scamVerdict.upsert({
                where: { chainId_address: { chainId, address: addr } },
                update: {
                  verdict: resolved.available ? classifyGoPlus(resolved) : "clean",
                  source: enrichment.goPlus && enrichment.gt ? "goplus+gt" : enrichment.goPlus ? (fromGoPlus ? "goplus" : "bytecode") : "gt",
                  payload: enrichment as object,
                },
                create: {
                  chainId,
                  address: addr,
                  verdict: resolved.available ? classifyGoPlus(resolved) : "clean",
                  source: enrichment.goPlus && enrichment.gt ? "goplus+gt" : enrichment.goPlus ? (fromGoPlus ? "goplus" : "bytecode") : "gt",
                  payload: enrichment as object,
                },
              });
            } catch (e) {
              warn?.(`scam-verdict write failed (${addr}): ${(e as Error).message}`);
            }
          } else if (canTombstone) {
            // Total miss with GoPlus reachable: persist a short-TTL "miss"
            // tombstone so the next scan does not re-query this contract
            // (quota exhaustion loop, incident 2026-09-03). Not persisted when
            // GoPlus itself was unreachable — retry then, security first.
            // Fail-graceful: write errors ignored.
            try {
              await prisma.scamVerdict.upsert({
                where: { chainId_address: { chainId, address: addr } },
                update: { verdict: "clean", source: "miss", payload: {} },
                create: { chainId, address: addr, verdict: "clean", source: "miss", payload: {} },
              });
            } catch (e) {
              warn?.(`scam-miss write failed (${addr}): ${(e as Error).message}`);
            }
          }
        }
      }

      for (const [k, val] of fresh) out.set(k, val);
      return out;
    } catch (e) {
      warn?.(`scam-enrichment disabled this scan: ${(e as Error).message}`);
      return out;
    }
  };
}

export interface ScamScanLogEntry {
  chainId: number;
  address: string;
  symbol: string;
  heuristicScore: number;
  totalScore: number;
  level: string;
  decision: string;
  reason: string;
  goPlus?: GoPlusSignal;
}

export function createScamDecisionLogger(prisma: PrismaClient) {
  return (entry: ScamScanLogEntry): void => {
    void prisma.scamScanLog.create({
      data: {
        chainId: entry.chainId,
        address: entry.address,
        symbol: entry.symbol.slice(0, 32),
        heuristicScore: Math.max(0, Math.round(entry.heuristicScore)),
        ...(entry.goPlus ? { goPlusPayload: entry.goPlus as object } : {}),
        totalScore: entry.totalScore,
        level: entry.level,
        decision: entry.decision,
        reason: entry.reason.slice(0, 500),
      },
    }).catch(() => { /* best-effort audit log */ });
  };
}
