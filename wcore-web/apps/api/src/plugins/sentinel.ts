import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { CacheStore } from "@wcore/core";
import {
  VERIFIED_LIFECYCLE_REGISTRY, evaluateChain, diffAlerts, pendingNotifications, monitorHealthAlert, toPublicAlert,
  type ChainLifecycleRecord, type ExposureInput, type SentinelAlert,
} from "@wcore/shared";
import { isPublicHttp } from "../lib/safe-http.js";

/**
 * Chain Sentinel — API.
 *
 * - Collecte serveur periodique, independante du navigateur et du watchdog GAS.
 * - Les sources officielles sont relues ; un changement de contenu cree une
 *   PROPOSITION a valider par un administrateur : aucune date n'est modifiee
 *   automatiquement.
 * - Les alertes privees ne sont servies qu'a l'utilisateur authentifie ; les
 *   routes publiques n'exposent aucune donnee de portefeuille.
 * - Aucune transaction, signature ou operation wallet.
 */

export const SENTINEL_KEYS = {
  registry: "sentinel:v1:registry",
  sources: "sentinel:v1:sources",
  proposals: "sentinel:v1:proposals",
  health: "sentinel:v1:health",
  lock: "sentinel:v1:lock",
  alerts: (userId: string) => `sentinel:v1:alerts:${userId}`,
  acks: (userId: string) => `sentinel:v1:acks:${userId}`,
  history: (userId: string) => `sentinel:v1:history:${userId}`,
} as const;

export interface SourceState { url: string; sha256: string | null; checkedAt: string; status: "OK" | "CHANGED" | "CHECK_FAILED"; httpStatus?: number; error?: string }
export interface Proposal { id: string; chainKey: string; sourceId: string; url: string; previousSha256: string | null; newSha256: string; detectedAt: string; status: "PENDING_ADMIN_REVIEW" | "APPROVED" | "REJECTED"; decidedAt?: string; note?: string }
export interface SentinelHealth { lastRunAt: string | null; lastSuccessAt: string | null; sourcesChecked: number; sourcesFailed: number; proposalsCreated: number; lastError: string | null }
export interface RegistryState { version: number; records: ChainLifecycleRecord[]; updatedAt: string }

export type SentinelFetch = (url: string) => Promise<{ status: number; text: string }>;

export interface SentinelDeps {
  store: CacheStore;
  fetchText: SentinelFetch;
  now?: () => number;
  intervalMs?: number;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Un registre sauvegarde (apres validation d'une proposition) ne porte pas les traductions
 * ajoutees ensuite au registre embarque. On les reprend, champ d'affichage seulement, et
 * uniquement quand le texte francais sauvegarde est identique a celui du registre embarque :
 * une note modifiee depuis ne recoit jamais une traduction perimee. Aucun fait n'est touche.
 */
export function withEmbeddedTranslations(records: ChainLifecycleRecord[]): ChainLifecycleRecord[] {
  const embedded = new Map(VERIFIED_LIFECYCLE_REGISTRY.map((r) => [r.chainKey, r]));
  return records.map((rec) => {
    const ref = embedded.get(rec.chainKey);
    if (!ref) return rec;
    const out: ChainLifecycleRecord = { ...rec, sources: { ...rec.sources } };
    if (!out.recoveryNoteEn && ref.recoveryNoteEn && rec.recoveryNote === ref.recoveryNote) out.recoveryNoteEn = ref.recoveryNoteEn;
    for (const [id, src] of Object.entries(out.sources)) {
      const refSrc = ref.sources[id];
      if (src && !src.publisherEn && refSrc?.publisherEn && src.publisher === refSrc.publisher) out.sources[id] = { ...src, publisherEn: refSrc.publisherEn };
    }
    return out;
  });
}

export async function loadRegistry(store: CacheStore): Promise<RegistryState> {
  const saved = await store.get<RegistryState>(SENTINEL_KEYS.registry);
  if (saved && Array.isArray(saved.records) && saved.records.length) return { ...saved, records: withEmbeddedTranslations(saved.records) };
  return { version: 1, records: VERIFIED_LIFECYCLE_REGISTRY.map((r) => structuredClone(r)), updatedAt: "2026-11-07T12:30:00Z" };
}

/** Une passe de collecte. Ne leve jamais : les echecs sont consignes dans la sante. */
export async function runSentinelCheck(deps: SentinelDeps): Promise<{ ran: boolean; reason?: string; health?: SentinelHealth }> {
  const now = (deps.now || Date.now)();
  const lockTtl = 10 * 60 * 1000;
  const got = await deps.store.add(SENTINEL_KEYS.lock, iso(now), lockTtl);
  if (!got) return { ran: false, reason: "LOCKED" };
  const prevHealth = (await deps.store.get<SentinelHealth>(SENTINEL_KEYS.health)) || null;
  const health: SentinelHealth = { lastRunAt: iso(now), lastSuccessAt: prevHealth?.lastSuccessAt || null, sourcesChecked: 0, sourcesFailed: 0, proposalsCreated: 0, lastError: null };
  try {
    const registry = await loadRegistry(deps.store);
    const sources = (await deps.store.get<Record<string, SourceState>>(SENTINEL_KEYS.sources)) || {};
    const proposals = (await deps.store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    for (const rec of registry.records) {
      for (const [sourceId, src] of Object.entries(rec.sources)) {
        if (!src.official) continue;
        const key = `${rec.chainKey}:${sourceId}`;
        health.sourcesChecked++;
        let res: { status: number; text: string } | null = null;
        try { res = await deps.fetchText(src.url); } catch (e) { res = null; sources[key] = { url: src.url, sha256: sources[key]?.sha256 ?? null, checkedAt: iso(now), status: "CHECK_FAILED", error: e instanceof Error ? e.message.slice(0, 120) : "fetch_failed" }; }
        if (!res) { health.sourcesFailed++; continue; }
        if (res.status < 200 || res.status >= 300) { health.sourcesFailed++; sources[key] = { url: src.url, sha256: sources[key]?.sha256 ?? null, checkedAt: iso(now), status: "CHECK_FAILED", httpStatus: res.status }; continue; }
        const h = sha(res.text);
        const prev = sources[key]?.sha256 ?? null;
        const changed = prev !== null && prev !== h;
        sources[key] = { url: src.url, sha256: h, checkedAt: iso(now), status: changed ? "CHANGED" : "OK", httpStatus: res.status };
        if (changed && !proposals.some((p) => p.chainKey === rec.chainKey && p.sourceId === sourceId && p.newSha256 === h)) {
          proposals.push({ id: `${key}:${h.slice(0, 12)}`, chainKey: rec.chainKey, sourceId, url: src.url, previousSha256: prev, newSha256: h, detectedAt: iso(now), status: "PENDING_ADMIN_REVIEW" });
          health.proposalsCreated++;
        }
      }
    }
    await deps.store.set(SENTINEL_KEYS.sources, sources);
    await deps.store.set(SENTINEL_KEYS.proposals, proposals);
    // Succes = au moins une source officielle relue ; tout en echec n est pas un succes.
    if (health.sourcesChecked > 0 && health.sourcesFailed < health.sourcesChecked) health.lastSuccessAt = iso(now);
    else health.lastError = "ALL_SOURCES_FAILED";
  } catch (e) {
    health.lastError = e instanceof Error ? e.message.slice(0, 160) : "unknown_error";
  } finally {
    await deps.store.set(SENTINEL_KEYS.health, health);
    try { await deps.store.delete(SENTINEL_KEYS.lock); } catch { /* le TTL libere le verrou */ }
  }
  return { ran: true, health };
}

/** Planification serveur (aucune session utilisateur requise). */
export function startSentinelScheduler(deps: SentinelDeps, log: { warn: (o: unknown, m?: string) => void }, initialDelayMs = 60_000): { stop: () => void } {
  const interval = deps.intervalMs || 6 * 3600 * 1000;
  const tick = () => { runSentinelCheck(deps).catch((e) => log.warn({ err: e instanceof Error ? e.message : String(e) }, "sentinel check failed")); };
  const first = setTimeout(tick, initialDelayMs); first.unref?.();
  const every = setInterval(tick, interval); every.unref?.();
  return { stop: () => { clearTimeout(first); clearInterval(every); } };
}

export interface SentinelPluginOptions extends SentinelDeps {
  isAdmin: (req: FastifyRequest) => boolean;
  /** Identifiant de l utilisateur authentifie, ou null. */
  userId: (req: FastifyRequest) => string | null;
  /** Expositions de l utilisateur, construites depuis ses scans (exposuresFromScans). */
  exposuresFor: (userId: string, chainKeys: string[]) => Promise<ExposureInput[]>;
}

function publicChainView(rec: ChainLifecycleRecord, nowMs: number) {
  return {
    chainKey: rec.chainKey, chainId: rec.chainId, name: rec.name, status: rec.status, successorChainId: rec.successorChainId ?? null,
    recoveryAfterShutdown: rec.recoveryAfterShutdown, recoveryNote: rec.recoveryNote ?? null, recoveryNoteEn: rec.recoveryNoteEn ?? null, lastVerifiedAt: rec.lastVerifiedAt,
    deadlines: rec.deadlines.map((d) => ({
      kind: d.kind, at: d.at, assets: d.assets ?? null, countdownMs: Date.parse(d.at) - nowMs,
      sources: d.sourceIds.map((id) => rec.sources[id]).filter(Boolean).map((s) => ({ url: s!.url, publisher: s!.publisher, publisherEn: s!.publisherEn ?? null, official: s!.official })),
    })),
  };
}

export async function sentinelPlugin(app: FastifyInstance, opts: SentinelPluginOptions) {
  const now = () => (opts.now || Date.now)();
  const interval = opts.intervalMs || 6 * 3600 * 1000;

  app.get("/api/sentinel/chains", async () => {
    const reg = await loadRegistry(opts.store);
    const n = now();
    const chains = reg.records.map((r) => publicChainView(r, n));
    // Alertes publiques evaluees SANS portefeuille : exposition masquee.
    const alerts = reg.records.map((r) => evaluateChain(r, [], n)).filter((a): a is SentinelAlert => !!a).map(toPublicAlert);
    return { version: reg.version, generatedAt: iso(n), chains, alerts };
  });

  app.get("/api/sentinel/health", async () => {
    const h = (await opts.store.get<SentinelHealth>(SENTINEL_KEYS.health)) || null;
    const n = now();
    const stale = monitorHealthAlert(h?.lastSuccessAt ? Date.parse(h.lastSuccessAt) : null, n, interval);
    return { lastRunAt: h?.lastRunAt ?? null, lastSuccessAt: h?.lastSuccessAt ?? null, sourcesChecked: h?.sourcesChecked ?? 0, sourcesFailed: h?.sourcesFailed ?? 0, monitoring: stale ? { status: "STALE", severity: stale.severity } : { status: "OK" } };
  });

  app.get("/api/sentinel/alerts", async (req, reply) => {
    const uid = opts.userId(req);
    if (!uid) return reply.code(401).send({ error: "not_authenticated" });
    const reg = await loadRegistry(opts.store);
    const n = now();
    const exposures = await opts.exposuresFor(uid, reg.records.map((r) => r.chainKey));
    const alerts = reg.records.map((r) => evaluateChain(r, exposures.filter((e) => e.chainKey === r.chainKey), n)).filter((a): a is SentinelAlert => !!a);
    const h = (await opts.store.get<SentinelHealth>(SENTINEL_KEYS.health)) || null;
    const healthAlert = monitorHealthAlert(h?.lastSuccessAt ? Date.parse(h.lastSuccessAt) : null, n, interval);
    if (healthAlert) alerts.push(healthAlert);
    const previous = (await opts.store.get<SentinelAlert[]>(SENTINEL_KEYS.alerts(uid))) || [];
    const diff = diffAlerts(previous, alerts);
    await opts.store.set(SENTINEL_KEYS.alerts(uid), alerts);
    if (diff.added.length || diff.deadlineChanged.length || diff.resolved.length) {
      const hist = (await opts.store.get<unknown[]>(SENTINEL_KEYS.history(uid))) || [];
      hist.push({ at: iso(n), added: diff.added.map((a) => a.id), deadlineChanged: diff.deadlineChanged.map((a) => a.id), resolved: diff.resolved });
      await opts.store.set(SENTINEL_KEYS.history(uid), hist.slice(-200));
    }
    const acks = new Set((await opts.store.get<string[]>(SENTINEL_KEYS.acks(uid))) || []);
    const pending = pendingNotifications(alerts, acks).map((a) => a.id);
    return { generatedAt: iso(n), alerts: alerts.map((a) => ({ ...a, acknowledged: acks.has(a.id) })), pendingNotificationIds: pending, changes: { added: diff.added.length, deadlineChanged: diff.deadlineChanged.length, resolved: diff.resolved.length } };
  });

  app.post<{ Params: { id: string } }>("/api/sentinel/alerts/:id/ack", async (req, reply) => {
    const uid = opts.userId(req);
    if (!uid) return reply.code(401).send({ error: "not_authenticated" });
    const id = decodeURIComponent(req.params.id);
    const current = (await opts.store.get<SentinelAlert[]>(SENTINEL_KEYS.alerts(uid))) || [];
    if (!current.some((a) => a.id === id)) return reply.code(404).send({ error: "unknown_alert" });
    const acks = new Set((await opts.store.get<string[]>(SENTINEL_KEYS.acks(uid))) || []);
    acks.add(id);
    await opts.store.set(SENTINEL_KEYS.acks(uid), Array.from(acks).slice(-500));
    return { ok: true, id };
  });

  app.get<{ Querystring: { limit?: string } }>("/api/sentinel/history", async (req, reply) => {
    const uid = opts.userId(req);
    if (!uid) return reply.code(401).send({ error: "not_authenticated" });
    const hist = (await opts.store.get<unknown[]>(SENTINEL_KEYS.history(uid))) || [];
    return { history: hist.slice(-Math.min(200, Math.max(1, Number(req.query.limit) || 50))) };
  });

  // --- Administration ---
  app.get("/api/admin/sentinel/proposals", async (req, reply) => {
    if (!opts.isAdmin(req)) return reply.code(401).send({ error: "unauthorized" });
    return { proposals: (await opts.store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [], sources: (await opts.store.get<Record<string, SourceState>>(SENTINEL_KEYS.sources)) || {} };
  });

  app.post<{ Params: { id: string }; Body: { decision?: string; record?: ChainLifecycleRecord; note?: string } }>("/api/admin/sentinel/proposals/:id", async (req, reply) => {
    if (!opts.isAdmin(req)) return reply.code(401).send({ error: "unauthorized" });
    const id = decodeURIComponent(req.params.id);
    const proposals = (await opts.store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    const p = proposals.find((x) => x.id === id);
    if (!p) return reply.code(404).send({ error: "unknown_proposal" });
    const decision = req.body?.decision;
    if (decision !== "APPROVED" && decision !== "REJECTED") return reply.code(400).send({ error: "invalid_decision" });
    if (decision === "APPROVED") {
      const rec = req.body?.record;
      // Validation minimale : meme chaine, dates ISO valides, au moins une source officielle par echeance.
      if (!rec || rec.chainKey !== p.chainKey || !Array.isArray(rec.deadlines) || rec.deadlines.some((d) => !Number.isFinite(Date.parse(d.at)) || !d.sourceIds?.some((s) => rec.sources?.[s]?.official))) {
        return reply.code(400).send({ error: "invalid_record" });
      }
      // Revue securite M1 (2026-11-08) : toute URL de source doit etre https et publique (anti-SSRF au stockage,
      // URL rendue aux visiteurs et relue par la collecte). Une URL malformee ou interne est refusee.
      const badSource = Object.values(rec.sources || {}).some((src) => {
        const u = String((src && src.url) || "");
        return !u.startsWith("https://") || !isPublicHttp(u);
      });
      if (badSource) return reply.code(400).send({ error: "invalid_source_url" });
      const reg = await loadRegistry(opts.store);
      const others = reg.records.filter((r) => r.chainKey !== rec.chainKey);
      await opts.store.set(SENTINEL_KEYS.registry, { version: reg.version + 1, records: [...others, { ...rec, lastVerifiedAt: iso(now()) }], updatedAt: iso(now()) });
    }
    p.status = decision; p.decidedAt = iso(now()); p.note = req.body?.note?.slice(0, 500);
    await opts.store.set(SENTINEL_KEYS.proposals, proposals);
    return { ok: true, proposal: p };
  });
}
