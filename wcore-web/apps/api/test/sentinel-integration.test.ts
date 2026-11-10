// Chain Sentinel : integration avec PostgreSQL et Redis REELS (boucle locale uniquement :
// set-test-env.js refuse toute URL distante sans ALLOW_REMOTE_TEST_DB=1).
// Prerequis : migrations appliquees (prisma migrate deploy) sur TEST_DATABASE_URL.
//
// Couvre : migration, persistance (redemarrage), planificateur reel, verrou Redis et
// multi-instances, reprise apres echec, deduplication, historique des echeances,
// fraicheur de la surveillance, contrat admin, authentification et isolation A/B.
// Aucune operation wallet ; aucun appel reseau externe (fetch des sources simule).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@wcore/db";
import { createCacheStore, isAtomicCacheStore, type CacheStore } from "@wcore/core";
import { VERIFIED_LIFECYCLE_REGISTRY, type ChainLifecycleRecord } from "@wcore/shared";
import { authPlugin } from "../src/auth.js";
import { apiConfig } from "../src/config.js";
import { isAdminAuthorized } from "../src/admin-auth.js";
import { getApiRateLimitBucket } from "../src/server-helpers.js";
import { sentinelPlugin, runSentinelCheck, startSentinelScheduler, SENTINEL_KEYS, type SentinelFetch } from "../src/plugins/sentinel.js";
import { createSentinelStore, exposuresForUser, type WalletScanReader } from "../src/plugins/sentinel-store.js";

const RUN = randomBytes(4).toString("hex");
const ADMIN_TOKEN = randomBytes(24).toString("hex");
const ADMIN_WALLET = `0xad${RUN}${"0".repeat(30)}`.slice(0, 42);
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.ADMIN_WALLET_ADDRESS = ADMIN_WALLET;

const addr = (tag: string) => `0x${tag}${RUN}${"1".repeat(40)}`.slice(0, 42);
const A_ADDR = addr("aa"), B_ADDR = addr("bb");
const MARKER = `PRIV${RUN}`.toUpperCase(); // actif propre a A, ne doit jamais apparaitre chez B

type Ctx = { app: FastifyInstance; prisma: PrismaClient; redis: CacheStore; store: CacheStore };
let fetchCalls: string[] = [];
let fetchMode: "ok" | "fail" | "changed" = "ok";
const fetchText: SentinelFetch = async (url) => {
  fetchCalls.push(url);
  if (fetchMode === "fail") throw new Error("network down");
  return { status: 200, text: fetchMode === "changed" ? `annonce modifiee ${url}` : `annonce ${url}` };
};

async function boot(): Promise<Ctx> {
  const prisma = new PrismaClient();
  const redis = await createCacheStore({ ...apiConfig.redis.config!, keyPrefix: `wcore-it-${RUN}:` });
  assert.ok(isAtomicCacheStore(redis), "Redis reel requis (pas de repli memoire)");
  const store = createSentinelStore(prisma, redis);
  const app = Fastify();
  await app.register(cookie);
  await authPlugin(app, prisma, redis);
  await app.register(sentinelPlugin, {
    store, fetchText, intervalMs: 6 * 3600 * 1000,
    isAdmin: (req) => isAdminAuthorized(req),
    userId: (req) => req.user?.id ?? null,
    exposuresFor: (uid, keys) => exposuresForUser(prisma as unknown as WalletScanReader, uid, keys),
  });
  await app.ready();
  return { app, prisma, redis, store };
}

const access = (u: { id: string; address: string }, opts: { secret?: string; expiresIn?: number; type?: string } = {}) =>
  jwt.sign({ sub: u.id, address: u.address, type: opts.type ?? "access", jti: randomBytes(8).toString("hex") },
    opts.secret ?? apiConfig.auth.jwtSecret, { expiresIn: opts.expiresIn ?? 900 });

let ctx: Ctx;
let userA: { id: string; address: string }, userB: { id: string; address: string }, admin: { id: string; address: string };
const asA = () => ({ cookie: `wcore_access=${access(userA)}` });
const asB = () => ({ cookie: `wcore_access=${access(userB)}` });

describe("Chain Sentinel — PostgreSQL + Redis reels", () => {
  before(async () => {
    ctx = await boot();
    await ctx.prisma.$executeRawUnsafe(`DELETE FROM "sentinel_state"`);
    userA = await ctx.prisma.user.create({ data: { address: A_ADDR } });
    userB = await ctx.prisma.user.create({ data: { address: B_ADDR } });
    admin = await ctx.prisma.user.create({ data: { address: ADMIN_WALLET } });
    // A : un scan Gravity avec un actif marque ; B : aucun scan.
    const scan = { generatedAt: new Date().toISOString(), chains: [{ chainKey: "GRAVITY", cachedAt: new Date().toISOString(), native: { symbol: "G", balance: 1 }, tokens: [{ symbol: MARKER, balance: 1 }] }] };
    await ctx.prisma.walletScan.create({ data: { userId: userA.id, address: A_ADDR, chains: ["GRAVITY"], totalEur: 0, tokenCount: 1, result: scan } });
  });

  after(async () => {
    await ctx.prisma.walletScan.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await ctx.prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, admin.id] } } });
    await ctx.prisma.$executeRawUnsafe(`DELETE FROM "sentinel_state"`);
  });

  test("migration : table sentinel_state presente avec cle primaire", async () => {
    const cols = await ctx.prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'sentinel_state' ORDER BY column_name`);
    assert.deepEqual(cols.map((c) => c.column_name), ["key", "updated_at", "value"]);
  });

  // ---------- Authentification et confidentialite ----------
  test("anonyme : 401 sur alertes, accuse, historique ; vue publique sans donnee privee", async () => {
    for (const [method, url] of [["GET", "/api/sentinel/alerts"], ["POST", "/api/sentinel/alerts/x/ack"], ["GET", "/api/sentinel/history"]] as const) {
      assert.equal((await ctx.app.inject({ method, url })).statusCode, 401, url);
    }
    const pub = await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" });
    assert.equal(pub.statusCode, 200);
    const body = pub.body;
    assert.ok(!body.includes("privateDetail"));
    assert.ok(!body.includes(MARKER) && !body.toLowerCase().includes(A_ADDR.toLowerCase()));
    for (const a of pub.json().alerts) { assert.equal(a.exposure, "AUTH_REQUIRED"); assert.equal(a.id, undefined); }
  });

  test("session falsifiee : adresse seule, mauvais secret, jeton expire, jeton refresh, Bearer -> 401", async () => {
    const forged = [
      { cookie: `wcore_address=${A_ADDR}` },
      { "x-wcore-address": A_ADDR },
      { cookie: `wcore_access=${access(userA, { secret: "not-the-secret-" + RUN })}` },
      { cookie: `wcore_access=${access(userA, { expiresIn: -10 })}` },
      { cookie: `wcore_access=${access(userA, { type: "refresh" })}` },
      { cookie: `wcore_access=${jwt.sign({ sub: "ghost-" + RUN, address: A_ADDR, type: "access" }, apiConfig.auth.jwtSecret)}` },
    ];
    if (!apiConfig.auth.authAllowBearer) forged.push({ authorization: `Bearer ${access(userA)}` } as never);
    for (const h of forged) {
      const r = await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: h as Record<string, string> });
      assert.equal(r.statusCode, 401, JSON.stringify(Object.keys(h)));
    }
  });

  test("isolation : A voit sa propre exposition, B ne voit rien de A", async () => {
    const ra = await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() });
    const rb = await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asB() });
    assert.equal(ra.statusCode, 200); assert.equal(rb.statusCode, 200);
    assert.ok(ra.body.includes(MARKER), "A voit son actif");
    assert.ok(!rb.body.includes(MARKER), "B ne voit pas l'actif de A");
    assert.ok(!rb.body.toLowerCase().includes(A_ADDR.toLowerCase()) && !ra.body.toLowerCase().includes(A_ADDR.toLowerCase()), "aucune adresse servie");
    const gA = ra.json().alerts.find((a: { chainKey: string }) => a.chainKey === "gravity");
    const gB = rb.json().alerts.find((a: { chainKey: string }) => a.chainKey === "gravity");
    assert.ok(gA && gB);
    assert.notEqual(gA.exposure, gB.exposure, "exposition differente selon l'utilisateur");
    assert.ok(["NOT_COVERED", "UNKNOWN"].includes(gB.exposure), `B sans scan = ${gB.exposure}, jamais ZERO_ATTESTED`);
  });

  test("accuses : A acquitte, B ne peut ni voir ni acquitter pour A ; identifiant inconnu = 404", async () => {
    const ra = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json();
    const rb = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asB() })).json();
    const idsB = new Set(rb.alerts.map((a: { id: string }) => a.id));
    const onlyA = ra.alerts.find((a: { id: string }) => !idsB.has(a.id));
    assert.ok(onlyA, "au moins une alerte propre a A (exposition differente)");
    const enc = encodeURIComponent(onlyA.id);
    assert.equal((await ctx.app.inject({ method: "POST", url: `/api/sentinel/alerts/${enc}/ack`, headers: asB() })).statusCode, 404, "B ne peut pas acquitter une alerte de A");
    assert.equal((await ctx.app.inject({ method: "POST", url: `/api/sentinel/alerts/${encodeURIComponent("inexistant|X|-")}/ack`, headers: asA() })).statusCode, 404);
    assert.equal((await ctx.app.inject({ method: "POST", url: `/api/sentinel/alerts/${enc}/ack`, headers: asA() })).statusCode, 200);
    const again = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json();
    assert.equal(again.alerts.find((a: { id: string }) => a.id === onlyA.id).acknowledged, true);
    assert.ok(!again.pendingNotificationIds.includes(onlyA.id));
    const bAcks = await ctx.store.get<string[]>(SENTINEL_KEYS.acks(userB.id));
    assert.ok(!(bAcks || []).includes(onlyA.id), "aucun accuse ecrit chez B");
  });

  test("routes admin : anonyme, utilisateur, mauvais jeton -> 401 ; ADMIN_TOKEN et wallet admin -> 200", async () => {
    const url = "/api/admin/sentinel/proposals";
    assert.equal((await ctx.app.inject({ method: "GET", url })).statusCode, 401);
    assert.equal((await ctx.app.inject({ method: "GET", url, headers: asA() })).statusCode, 401);
    assert.equal((await ctx.app.inject({ method: "GET", url, headers: { "x-admin-token": ADMIN_TOKEN + "x" } })).statusCode, 401);
    assert.equal((await ctx.app.inject({ method: "GET", url, headers: { "x-admin-token": ADMIN_TOKEN } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ method: "GET", url, headers: { cookie: `wcore_access=${access(admin)}` } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ method: "POST", url: `${url}/x`, headers: asA(), payload: { decision: "APPROVED" } })).statusCode, 401);
  });

  test("limitation de debit : toutes les routes Sentinel passent par un seau", () => {
    for (const [m, u] of [["GET", "/api/sentinel/alerts"], ["POST", "/api/sentinel/alerts/a/ack"], ["GET", "/api/sentinel/chains"], ["GET", "/api/sentinel/health"], ["GET", "/api/admin/sentinel/proposals"]]) {
      assert.equal(getApiRateLimitBucket(m!, u!), "catch_all", u);
    }
  });

  // ---------- Collecte, verrou, reprise ----------
  test("collecte : sources officielles seulement, aucun appel GAS ni navigateur", async () => {
    fetchCalls = []; fetchMode = "ok";
    const r = await runSentinelCheck({ store: ctx.store, fetchText });
    assert.equal(r.ran, true);
    const official = VERIFIED_LIFECYCLE_REGISTRY.flatMap((rec) => Object.values(rec.sources).filter((s) => s.official).map((s) => s.url));
    assert.deepEqual([...fetchCalls].sort(), [...official].sort());
    assert.ok(fetchCalls.every((u) => !/script\.google|googleusercontent|localhost|127\.0\.0\.1/.test(u)));
    assert.ok(r.health!.lastSuccessAt);
  });

  test("verrou Redis : deux instances simultanees, une seule collecte", async () => {
    const other = await boot(); // seconde instance : clients Prisma et Redis distincts
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    let calls = 0;
    const slow: SentinelFetch = async (u) => { calls++; await gate; return { status: 200, text: `annonce ${u}` }; };
    const p1 = runSentinelCheck({ store: ctx.store, fetchText: slow });
    await new Promise((r) => setTimeout(r, 100));
    const r2 = await runSentinelCheck({ store: other.store, fetchText: slow });
    assert.deepEqual(r2, { ran: false, reason: "LOCKED" });
    release();
    const first = await p1;
    assert.equal(first.ran, true);
    assert.equal(calls, first.health!.sourcesChecked, "seule la premiere instance a collecte");
    await other.app.close();
  });

  test("verrou : expiration controlee apres un crash (TTL), puis reprise", async () => {
    assert.equal(await ctx.redis.add(SENTINEL_KEYS.lock, "crash", 400), true, "verrou orphelin simule");
    assert.deepEqual(await runSentinelCheck({ store: ctx.store, fetchText }), { ran: false, reason: "LOCKED" });
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await runSentinelCheck({ store: ctx.store, fetchText })).ran, true);
    assert.equal(await ctx.redis.get(SENTINEL_KEYS.lock), undefined, "verrou libere en fin de passe");
  });

  test("reprise apres echec : tout en echec n'est pas un succes ; la passe suivante repart", async () => {
    const before = (await ctx.store.get<{ lastSuccessAt: string }>(SENTINEL_KEYS.health))!.lastSuccessAt;
    fetchMode = "fail";
    const t0 = Date.now() + 1000;
    const failed = await runSentinelCheck({ store: ctx.store, fetchText, now: () => t0 });
    assert.equal(failed.health!.lastError, "ALL_SOURCES_FAILED");
    assert.equal(failed.health!.lastSuccessAt, before, "lastSuccessAt inchange");
    fetchMode = "ok";
    const ok = await runSentinelCheck({ store: ctx.store, fetchText, now: () => t0 + 1000 });
    assert.equal(ok.health!.lastError, null);
    assert.equal(ok.health!.lastSuccessAt, new Date(t0 + 1000).toISOString());
  });

  test("planificateur reel : passes periodiques sans session ni navigateur", async () => {
    fetchCalls = []; fetchMode = "ok";
    const sched = startSentinelScheduler({ store: ctx.store, fetchText, intervalMs: 400 }, { warn: () => {} }, 20);
    await new Promise((r) => setTimeout(r, 1500));
    sched.stop();
    const perPass = VERIFIED_LIFECYCLE_REGISTRY.flatMap((rec) => Object.values(rec.sources).filter((s) => s.official)).length;
    assert.ok(fetchCalls.length >= perPass * 3, `au moins 3 passes (${fetchCalls.length / perPass})`);
    const n = fetchCalls.length;
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(fetchCalls.length, n, "arret effectif");
  });

  test("source modifiee : proposition dedupliquee, registre inchange sans validation admin", async () => {
    const regBefore = await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" });
    fetchMode = "changed";
    await runSentinelCheck({ store: ctx.store, fetchText });
    await runSentinelCheck({ store: ctx.store, fetchText });
    fetchMode = "ok";
    const props = (await ctx.app.inject({ method: "GET", url: "/api/admin/sentinel/proposals", headers: { "x-admin-token": ADMIN_TOKEN } })).json().proposals;
    const pending = props.filter((p: { status: string; newSha256: string }) => p.status === "PENDING_ADMIN_REVIEW");
    const official = VERIFIED_LIFECYCLE_REGISTRY.flatMap((rec) => Object.values(rec.sources).filter((s) => s.official)).length;
    assert.equal(new Set(pending.map((p: { id: string }) => p.id)).size, pending.length, "aucun doublon");
    assert.equal(pending.filter((p: { newSha256: string; previousSha256: string }) => p.previousSha256 !== null).length >= official, true);
    const regAfter = await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" });
    assert.deepEqual(regAfter.json().chains.map((c: { deadlines: unknown }) => c.deadlines.map((d: { at: string }) => d.at)),
      regBefore.json().chains.map((c: { deadlines: unknown }) => c.deadlines.map((d: { at: string }) => d.at)), "collecte HTTP != confirmation : aucune date modifiee");
  });

  test("validation admin : enregistrement invalide refuse, date modifiee tracee dans l'historique", async () => {
    const props = (await ctx.app.inject({ method: "GET", url: "/api/admin/sentinel/proposals", headers: { "x-admin-token": ADMIN_TOKEN } })).json().proposals;
    // Echeance reellement citee par une alerte de A (actionByMs), pour que son deplacement soit observable.
    const baseAlerts = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json().alerts as { chainKey: string; actionByMs: number | null }[];
    const cited = baseAlerts.find((a) => a.actionByMs !== null && VERIFIED_LIFECYCLE_REGISTRY.some((r) => r.chainKey === a.chainKey && r.deadlines.some((d) => Date.parse(d.at) === a.actionByMs)));
    assert.ok(cited, "une alerte citant une echeance du registre");
    const target = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainKey === cited.chainKey)!;
    const citedIdx = target.deadlines.findIndex((d) => Date.parse(d.at) === cited.actionByMs);
    const p = props.find((x: { chainKey: string; status: string }) => x.chainKey === target.chainKey && x.status === "PENDING_ADMIN_REVIEW");
    assert.ok(p, "proposition en attente pour " + target.chainKey);
    const url = `/api/admin/sentinel/proposals/${encodeURIComponent(p.id)}`;
    const h = { "x-admin-token": ADMIN_TOKEN };
    const bad: ChainLifecycleRecord = { ...structuredClone(target), deadlines: [{ ...target.deadlines[0]!, at: "pas une date" }] };
    assert.equal((await ctx.app.inject({ method: "POST", url, headers: h, payload: { decision: "APPROVED", record: bad } })).statusCode, 400);
    const noOfficial: ChainLifecycleRecord = { ...structuredClone(target), deadlines: [{ ...target.deadlines[0]!, sourceIds: ["absente"] }] };
    assert.equal((await ctx.app.inject({ method: "POST", url, headers: h, payload: { decision: "APPROVED", record: noOfficial } })).statusCode, 400);
    assert.equal((await ctx.app.inject({ method: "POST", url, headers: h, payload: { decision: "MAYBE" } })).statusCode, 400);
    // Revue securite M1 : URL de source non https, interne ou malformee => 400 invalid_source_url, registre inchange.
    for (const badUrl of ["javascript:alert(1)", "http://example.com/a", "https://127.0.0.1/x", "https://api.railway.internal/x", "pas une url"]) {
      const hostile: ChainLifecycleRecord = structuredClone(target);
      const firstId = Object.keys(hostile.sources)[0]!;
      hostile.sources[firstId] = { ...hostile.sources[firstId]!, url: badUrl };
      const r = await ctx.app.inject({ method: "POST", url, headers: h, payload: { decision: "APPROVED", record: hostile } });
      assert.equal(r.statusCode, 400, badUrl);
      assert.equal(r.json().error, "invalid_source_url", badUrl);
    }
    assert.equal((await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" })).json().version, 1, "aucune URL hostile n a modifie le registre");

    await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() }); // etat de reference
    const moved: ChainLifecycleRecord = structuredClone(target);
    moved.deadlines = moved.deadlines.map((d, i) => (i === citedIdx ? { ...d, at: new Date(Date.parse(d.at) + 86_400_000).toISOString() } : d));
    const ok = await ctx.app.inject({ method: "POST", url, headers: h, payload: { decision: "APPROVED", record: moved, note: "test" } });
    assert.equal(ok.statusCode, 200);
    const chains = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" })).json();
    assert.equal(chains.version, 2);
    const res = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json();
    const hist = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/history", headers: asA() })).json().history;
    assert.ok(res.changes.deadlineChanged + res.changes.added > 0, "le changement d'echeance produit une difference d'alerte");
    const last = hist[hist.length - 1] as { deadlineChanged: string[]; added: string[] };
    assert.ok([...last.deadlineChanged, ...last.added].some((id) => id.startsWith(`${target.chainKey}|`)), "historique trace la chaine modifiee");
    // Deduplication : une relecture identique n'ajoute rien a l'historique.
    const n = hist.length;
    await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() });
    assert.equal((await ctx.app.inject({ method: "GET", url: "/api/sentinel/history", headers: asA() })).json().history.length, n);
  });

  test("fraicheur : surveillance arretee -> STALE (jamais un etat sain)", async () => {
    const h = await ctx.store.get<Record<string, unknown>>(SENTINEL_KEYS.health);
    await ctx.store.set(SENTINEL_KEYS.health, { ...h, lastSuccessAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString() });
    const r = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/health" })).json();
    assert.equal(r.monitoring.status, "STALE");
    const alerts = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json().alerts;
    assert.ok(alerts.some((a: { code: string }) => a.code === "SENTINEL_STALE"));
  });

  test("redemarrage de l'API : registre, propositions et accuses relus depuis PostgreSQL", async () => {
    const ackedBefore = await ctx.store.get<string[]>(SENTINEL_KEYS.acks(userA.id));
    const propsBefore = await ctx.store.get<unknown[]>(SENTINEL_KEYS.proposals);
    await ctx.app.close();
    await ctx.prisma.$disconnect();
    ctx = await boot(); // nouveaux clients, nouvelle instance
    assert.deepEqual(await ctx.store.get(SENTINEL_KEYS.acks(userA.id)), ackedBefore);
    assert.deepEqual(await ctx.store.get(SENTINEL_KEYS.proposals), propsBefore);
    assert.equal((await ctx.app.inject({ method: "GET", url: "/api/sentinel/chains" })).json().version, 2);
    const res = (await ctx.app.inject({ method: "GET", url: "/api/sentinel/alerts", headers: asA() })).json();
    for (const id of ackedBefore || []) {
      const a = res.alerts.find((x: { id: string }) => x.id === id);
      if (a) assert.equal(a.acknowledged, true);
    }
  });

  test("magasin : le verrou ne s'ecrit jamais en base, l'etat durable jamais dans Redis", async () => {
    await assert.rejects(ctx.store.set(SENTINEL_KEYS.lock, "x"));
    await assert.rejects(ctx.store.add(SENTINEL_KEYS.health, "x"));
    await assert.rejects(ctx.store.clear());
    assert.equal(await ctx.redis.get(SENTINEL_KEYS.proposals), undefined);
  });
});
