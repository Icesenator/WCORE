// Run: tsx --test apps/api/src/plugins/sentinel.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyRequest } from "fastify";
import { MemoryCacheStore } from "@wcore/core";
import type { ExposureInput } from "@wcore/shared";
import { sentinelPlugin, runSentinelCheck, loadRegistry, SENTINEL_KEYS, type SentinelFetch } from "./sentinel.js";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const H = 3600000;

function fetchFrom(map: Record<string, { status: number; text: string } | Error>): SentinelFetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const r = map[url] ?? { status: 200, text: `stable:${url}` };
    if (r instanceof Error) throw r;
    return r;
  }) as SentinelFetch & { calls: string[] };
  f.calls = calls;
  return f;
}

async function build(opts: { exposures?: ExposureInput[]; fetchMap?: Record<string, { status: number; text: string } | Error>; now?: () => number } = {}) {
  const store = new MemoryCacheStore();
  const fetchText = fetchFrom(opts.fetchMap || {});
  const app = Fastify();
  await app.register(sentinelPlugin, {
    store, fetchText, now: opts.now || (() => NOW), intervalMs: 6 * H,
    isAdmin: (req: FastifyRequest) => req.headers["x-admin"] === "yes",
    userId: (req: FastifyRequest) => (req.headers["x-user"] as string) || null,
    exposuresFor: async () => opts.exposures || [],
  });
  await app.ready();
  return { app, store, fetchText };
}

const gravityPositive: ExposureInput = { chainKey: "gravity", kind: "NATIVE", asset: "G", covered: true, balance: 5, balanceObservedAt: Date.parse("2026-11-01T08:44:09Z") };

describe("collecteur serveur", () => {
  test("premiere passe : relit les sources officielles uniquement, persiste les empreintes et la sante", async () => {
    const { store, fetchText } = await build();
    const r = await runSentinelCheck({ store, fetchText, now: () => NOW });
    assert.equal(r.ran, true);
    assert.ok(fetchText.calls.length >= 6);
    assert.ok(!fetchText.calls.some((u) => u.includes("cointelegraph") || u.includes("TheBlockCo")), "sources non officielles jamais collectees");
    const h = await store.get<{ lastSuccessAt: string; sourcesFailed: number }>(SENTINEL_KEYS.health);
    assert.equal(h?.lastSuccessAt, new Date(NOW).toISOString());
    assert.equal(h?.sourcesFailed, 0);
    assert.deepEqual(await store.get(SENTINEL_KEYS.proposals), []);
  });

  test("verrou : deux passes simultanees => une seule s execute", async () => {
    const { store, fetchText } = await build();
    await store.add(SENTINEL_KEYS.lock, "busy", 60000);
    const r = await runSentinelCheck({ store, fetchText, now: () => NOW });
    assert.equal(r.ran, false);
    assert.equal(r.reason, "LOCKED");
    assert.equal(fetchText.calls.length, 0);
  });

  test("source officielle modifiee => proposition a valider, registre INCHANGE (aucune date auto)", async () => {
    const url = "https://migrate.abs.xyz/";
    const { store } = await build();
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v1" } }), now: () => NOW });
    const before = await loadRegistry(store);
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v2 nouvelle date" } }), now: () => NOW + H });
    const proposals = (await store.get<{ chainKey: string; status: string }[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]!.chainKey, "abstract");
    assert.equal(proposals[0]!.status, "PENDING_ADMIN_REVIEW");
    assert.deepEqual(await loadRegistry(store), before);
    // meme contenu une seconde fois : pas de doublon
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v2 nouvelle date" } }), now: () => NOW + 2 * H });
    assert.equal(((await store.get<unknown[]>(SENTINEL_KEYS.proposals)) || []).length, 1);
  });

  test("toutes les sources en echec => pas de faux succes, surveillance signalee", async () => {
    const { store } = await build();
    const failing = (async () => { throw new Error("ETIMEDOUT"); }) as SentinelFetch;
    await runSentinelCheck({ store, fetchText: failing, now: () => NOW });
    const h = await store.get<{ lastSuccessAt: string | null; lastError: string }>(SENTINEL_KEYS.health);
    assert.equal(h?.lastSuccessAt, null);
    assert.equal(h?.lastError, "ALL_SOURCES_FAILED");
  });
});

describe("routes", () => {
  test("GET /api/sentinel/chains public : registre, echeances, sources, aucune donnee privee", async () => {
    const { app } = await build({ exposures: [gravityPositive] });
    const res = await app.inject({ method: "GET", url: "/api/sentinel/chains" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { chains: { chainKey: string; chainId: number }[]; alerts: { exposure: string }[] };
    assert.ok(body.chains.some((c) => c.chainKey === "gravity" && c.chainId === 1625));
    assert.ok(body.alerts.every((a) => a.exposure === "AUTH_REQUIRED"));
    assert.doesNotMatch(res.payload, /privateDetail|"balance"/);
  });

  test("GET /api/sentinel/alerts : 401 sans session ; avec session, P0 Gravity a fonds bloques + notification en attente", async () => {
    const { app } = await build({ exposures: [gravityPositive] });
    assert.equal((await app.inject({ method: "GET", url: "/api/sentinel/alerts" })).statusCode, 401);
    const res = await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u1" } });
    const body = res.json() as { alerts: { id: string; code: string; severity: string; acknowledged: boolean }[]; pendingNotificationIds: string[] };
    const g = body.alerts.find((a) => a.code === "FUNDS_STRANDED_AFTER_SHUTDOWN")!;
    assert.equal(g.severity, "P0");
    assert.ok(body.pendingNotificationIds.includes(g.id));
  });

  test("accuse de reception : la notification quitte la file en attente, l alerte reste visible", async () => {
    const { app } = await build({ exposures: [gravityPositive] });
    const first = (await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u1" } })).json() as { alerts: { id: string; code: string }[] };
    const id = first.alerts.find((a) => a.code === "FUNDS_STRANDED_AFTER_SHUTDOWN")!.id;
    const ack = await app.inject({ method: "POST", url: `/api/sentinel/alerts/${encodeURIComponent(id)}/ack`, headers: { "x-user": "u1" } });
    assert.equal(ack.statusCode, 200);
    const after = (await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u1" } })).json() as { alerts: { id: string; acknowledged: boolean }[]; pendingNotificationIds: string[] };
    assert.equal(after.alerts.find((a) => a.id === id)!.acknowledged, true);
    assert.equal(after.pendingNotificationIds.includes(id), false);
    assert.equal((await app.inject({ method: "POST", url: "/api/sentinel/alerts/inconnue/ack", headers: { "x-user": "u1" } })).statusCode, 404);
  });

  test("notifications non perdues : P0 non acquittee reste en attente a chaque lecture", async () => {
    const { app } = await build({ exposures: [gravityPositive] });
    for (let i = 0; i < 3; i++) {
      const b = (await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u2" } })).json() as { pendingNotificationIds: string[] };
      assert.ok(b.pendingNotificationIds.length >= 1);
    }
  });

  test("surveillance jamais executee => alerte SENTINEL_STALE dans les alertes privees et /health", async () => {
    const { app } = await build();
    const h = (await app.inject({ method: "GET", url: "/api/sentinel/health" })).json() as { monitoring: { status: string; severity: string } };
    assert.equal(h.monitoring.status, "STALE");
    const a = (await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u1" } })).json() as { alerts: { code: string }[] };
    assert.ok(a.alerts.some((x) => x.code === "SENTINEL_STALE"));
  });

  test("historique : premiere lecture enregistree, lectures identiques non dupliquees", async () => {
    const { app } = await build({ exposures: [gravityPositive] });
    await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u3" } });
    await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u3" } });
    const h = (await app.inject({ method: "GET", url: "/api/sentinel/history", headers: { "x-user": "u3" } })).json() as { history: unknown[] };
    assert.equal(h.history.length, 1);
  });

  test("admin : 401 sans droits ; approbation exige des dates valides et une source officielle par echeance", async () => {
    const url = "https://migrate.abs.xyz/";
    const { app, store } = await build();
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v1" } }), now: () => NOW });
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v2" } }), now: () => NOW + H });
    assert.equal((await app.inject({ method: "GET", url: "/api/admin/sentinel/proposals" })).statusCode, 401);
    const list = (await app.inject({ method: "GET", url: "/api/admin/sentinel/proposals", headers: { "x-admin": "yes" } })).json() as { proposals: { id: string }[] };
    const pid = encodeURIComponent(list.proposals[0]!.id);
    const reg = await loadRegistry(store);
    const abs = structuredClone(reg.records.find((r) => r.chainKey === "abstract")!);
    const bad = { ...abs, deadlines: [{ kind: "WITHDRAW_LAST", at: "2026-12-20T00:00:00Z", sourceIds: ["inconnue"] }] };
    assert.equal((await app.inject({ method: "POST", url: `/api/admin/sentinel/proposals/${pid}`, headers: { "x-admin": "yes" }, payload: { decision: "APPROVED", record: bad } })).statusCode, 400);
    abs.deadlines = [{ kind: "WITHDRAW_LAST", at: "2026-12-20T00:00:00Z", sourceIds: ["abs-migrate"] }, { kind: "NETWORK_SHUTDOWN", at: "2026-12-20T00:00:00Z", sourceIds: ["abs-migrate"] }];
    const ok = await app.inject({ method: "POST", url: `/api/admin/sentinel/proposals/${pid}`, headers: { "x-admin": "yes" }, payload: { decision: "APPROVED", record: abs } });
    assert.equal(ok.statusCode, 200);
    const reg2 = await loadRegistry(store);
    assert.equal(reg2.version, reg.version + 1);
    assert.equal(reg2.records.find((r) => r.chainKey === "abstract")!.deadlines[0]!.at, "2026-12-20T00:00:00Z");
  });

  test("changement de date approuve => alerte DEADLINE_CHANGED (pas de doublon) pour l utilisateur", async () => {
    const url = "https://migrate.abs.xyz/";
    const abstractPositive: ExposureInput = { chainKey: "abstract", kind: "NATIVE", asset: "ETH", covered: true, balance: 1, balanceObservedAt: NOW - H };
    const { app, store } = await build({ exposures: [abstractPositive] });
    await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u4" } });
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v1" } }), now: () => NOW });
    await runSentinelCheck({ store, fetchText: fetchFrom({ [url]: { status: 200, text: "v2" } }), now: () => NOW + H });
    const pid = encodeURIComponent(((await store.get<{ id: string }[]>(SENTINEL_KEYS.proposals)) || [])[0]!.id);
    const abs = structuredClone((await loadRegistry(store)).records.find((r) => r.chainKey === "abstract")!);
    abs.deadlines = abs.deadlines.map((d) => ({ ...d, at: "2026-12-10T00:00:00Z" }));
    await app.inject({ method: "POST", url: `/api/admin/sentinel/proposals/${pid}`, headers: { "x-admin": "yes" }, payload: { decision: "APPROVED", record: abs } });
    const b = (await app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: { "x-user": "u4" } })).json() as { changes: { added: number; deadlineChanged: number } };
    assert.equal(b.changes.deadlineChanged, 1);
  });

  test("aucune route de transaction, signature, bridge ou swap", async () => {
    const { app } = await build();
    const routes = app.printRoutes();
    assert.doesNotMatch(routes, /sign|transfer|bridge|swap|withdraw|unstake/i);
  });
});

test("a saved registry gets the embedded English texts only where the French text is unchanged", async () => {
  const { withEmbeddedTranslations } = await import("./sentinel.js");
  const { VERIFIED_LIFECYCLE_REGISTRY } = await import("@wcore/shared");
  const ref = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.recoveryNoteEn && Object.values(r.sources).some((s) => s.publisherEn))!;
  const srcId = Object.keys(ref.sources).find((id) => ref.sources[id]!.publisherEn)!;
  const strip = (r: typeof ref) => {
    const sources = Object.fromEntries(Object.entries(r.sources).map(([id, s]) => { const { publisherEn: _p, ...rest } = s; void _p; return [id, rest]; }));
    const { recoveryNoteEn: _n, ...rest } = r; void _n;
    return { ...rest, sources } as typeof ref;
  };

  const [same] = withEmbeddedTranslations([strip(ref)]);
  assert.equal(same!.recoveryNoteEn, ref.recoveryNoteEn);
  assert.equal(same!.sources[srcId]!.publisherEn, ref.sources[srcId]!.publisherEn);

  const edited = { ...strip(ref), recoveryNote: "Note modifiee par l'administration." };
  edited.sources = { ...edited.sources, [srcId]: { ...edited.sources[srcId]!, publisher: "Autre source" } };
  const [changed] = withEmbeddedTranslations([edited]);
  assert.equal(changed!.recoveryNoteEn, undefined, "a changed French note never gets a stale translation");
  assert.equal(changed!.sources[srcId]!.publisherEn, undefined);
  assert.equal(changed!.recoveryNote, "Note modifiee par l'administration.", "facts are untouched");
});
