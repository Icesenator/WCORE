// Variations de prix calculées à partir de notre propre historique : une clôture par jour UTC
// (dernier prix vu ce jour-là), conservée 40 jours. Sert aux actions, dont la source
// (companiesmarketcap) ne fournit aucune variation. Une donnée absente donne null, jamais zéro.
import type { CacheStore } from "@wcore/core";
import { cacheKey } from "@wcore/shared";

export type HistoryKind = "stock" | "crypto";
export interface PriceChanges { h1: number | null; d1: number | null; w1: number | null; m1: number | null }
export interface PricedRow { symbol: string; priceEur: number | null }

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 40 * DAY_MS;
const NO_CHANGE: PriceChanges = { h1: null, d1: null, w1: null, m1: null };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const dailyCloseKey = (kind: HistoryKind, date: string) => cacheKey("marketDailyClose", { kind, date });

function validPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export async function recordDailyCloses(cache: CacheStore, kind: HistoryKind, rows: readonly PricedRow[], now: Date): Promise<void> {
  const key = dailyCloseKey(kind, isoDay(now));
  const previous = (await cache.get<Record<string, number>>(key)) ?? {};
  const next: Record<string, number> = { ...previous };
  for (const r of rows) if (validPrice(r.priceEur)) next[r.symbol] = r.priceEur;
  await cache.set(key, next, HISTORY_TTL_MS);
}

const pct = (now: number | null, ref: number | undefined) =>
  validPrice(now) && validPrice(ref) ? (now / ref - 1) * 100 : null;

export async function changesFromHistory(cache: CacheStore, kind: HistoryKind, rows: readonly PricedRow[], now: Date): Promise<Map<string, PriceChanges>> {
  const keys = [1, 7, 30].map((n) => dailyCloseKey(kind, isoDay(new Date(now.getTime() - n * DAY_MS))));
  const [d1, w1, m1] = (await cache.mget<Record<string, number>>(keys)).map((v) => v ?? {});
  const out = new Map<string, PriceChanges>();
  for (const r of rows) {
    out.set(r.symbol, { h1: null, d1: pct(r.priceEur, d1![r.symbol]), w1: pct(r.priceEur, w1![r.symbol]), m1: pct(r.priceEur, m1![r.symbol]) });
  }
  return out;
}

// Une seule écriture et un seul calcul par instantané (le même instantané est servi pendant
// une heure) : la page reste rapide et Redis n'est pas sollicité à chaque visite.
let memo: { kind: HistoryKind; generatedAt: string; changes: Map<string, PriceChanges> } | null = null;

export async function withHistoryChanges(
  cache: CacheStore,
  kind: HistoryKind,
  snapshot: { generatedAt: string; rows: readonly PricedRow[] },
  now = new Date(),
): Promise<Map<string, PriceChanges>> {
  if (memo && memo.kind === kind && memo.generatedAt === snapshot.generatedAt) return memo.changes;
  let changes: Map<string, PriceChanges>;
  try {
    await recordDailyCloses(cache, kind, snapshot.rows, now);
    changes = await changesFromHistory(cache, kind, snapshot.rows, now);
  } catch {
    changes = new Map(snapshot.rows.map((r) => [r.symbol, { ...NO_CHANGE }]));
    return changes; // pas de mémo : on réessaiera à la prochaine visite
  }
  memo = { kind, generatedAt: snapshot.generatedAt, changes };
  return changes;
}

/** Par periode : la variation de la source (cours Yahoo) si elle existe, sinon celle de notre historique. */
export function preferSourceChanges(
  source: { d1: number | null; w1: number | null; m1: number | null } | null | undefined,
  history: PriceChanges | null | undefined,
): PriceChanges | null {
  if (!source) return history ?? null;
  return {
    h1: history?.h1 ?? null,
    d1: source.d1 ?? history?.d1 ?? null,
    w1: source.w1 ?? history?.w1 ?? null,
    m1: source.m1 ?? history?.m1 ?? null,
  };
}
