// Scam enrichment loader — reads cached GoPlus verdicts (scam_verdicts), fetches
// missing/expired ones under the SCAN_ENRICHMENT feature flag, persists them and
// logs flagged decisions (scam_scan_logs). Fail-graceful by design: any error
// here must never degrade a scan (spec §2.5).
import type { PrismaClient } from "@wcore/db";
import type { ScamEnrichment, GoPlusSignal } from "@wcore/shared";

export type { GoPlusSignal };

const VERDICT_TTL_MS = 30 * 24 * 3600 * 1000; // 30d per spec §2.3
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

export interface ScamEnrichmentDeps {
  prisma: PrismaClient;
  warn?: (msg: string) => void;
}

export function createScamEnrichmentLoader(deps: ScamEnrichmentDeps): ScamEnrichmentLoader {
  const { prisma, warn } = deps;
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
      const missing: string[] = [];
      for (const a of addrs) {
        const row = known.get(a);
        if (!row) { missing.push(a); continue; }
        // Admin verdicts are deliberate: they never expire and are applied as-is.
        if (row.source === "admin") {
          fresh.set(a, row.verdict === "clean" ? {} : {});
          continue;
        }
        if (now - new Date(row.updatedAt).getTime() < VERDICT_TTL_MS) {
          const gp = normalizePayload(row.payload);
          if (gp) fresh.set(a, { goPlus: gp });
        } else {
          missing.push(a);
        }
      }

      if (missing.length > 0) {
        const { fetchGoPlusVerdicts } = await import("@wcore/core");
        const verdicts = await fetchGoPlusVerdicts(chainId, missing);
        for (const [addr, v] of verdicts) {
          if (v.available) fresh.set(addr, { goPlus: v });
          else continue; // never persist a network-failure as a verdict (would freeze "clean" for 30d)
          try {
            await prisma.scamVerdict.upsert({
              where: { chainId_address: { chainId, address: addr } },
              update: { verdict: classifyGoPlus(v), source: "goplus", payload: v as object },
              create: { chainId, address: addr, verdict: classifyGoPlus(v), source: "goplus", payload: v as object },
            });
          } catch (e) {
            warn?.(`scam-verdict write failed (${addr}): ${(e as Error).message}`);
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
