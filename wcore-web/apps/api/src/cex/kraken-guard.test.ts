import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKrakenBalanceReader,
  createMemoryKrakenGuardStore,
  createPrismaKrakenGuardStore,
  KRAKEN_LOCKOUT_PAUSE_MS,
  KRAKEN_MIN_INTERVAL_MS,
  KRAKEN_REUSE_MS,
  KrakenGuardError,
  signKrakenRequest,
} from "./kraken-guard.js";

// Fausse cle : jamais une vraie, jamais d'appel reseau (fetch injecte).
const creds = { apiKey: "test-key", apiSecret: Buffer.from("test-secret").toString("base64") };

function fakeKraken(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const next = responses.shift() ?? { body: { error: ["EGeneral:Unexpected test call"] } };
    return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, text: async () => JSON.stringify(next.body) };
  };
  return { calls, fetchImpl };
}

function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test("un appel reel renvoie la carte brute Balance (quantites seulement) et persiste le nonce", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const k = fakeKraken([{ body: { error: [], result: { XXBT: "0.5000000000", "AAPLx.T": "2.0000000000", ZEUR: "10.0000" } } }]);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  const r = await reader.readBalances("acc1", creds);
  assert.deepEqual(r.balances, { XXBT: "0.5000000000", "AAPLx.T": "2.0000000000", ZEUR: "10.0000" });
  assert.equal(r.reused, false);
  assert.equal(k.calls.length, 1);
  assert.equal(k.calls[0]!.url, "https://api.kraken.com/0/private/Balance");
  assert.equal(k.calls[0]!.body, `nonce=${BigInt(c.now()) * 1000n}`);
  assert.equal(k.calls[0]!.headers["API-Sign"], signKrakenRequest("/0/private/Balance", String(BigInt(c.now()) * 1000n), k.calls[0]!.body, creds.apiSecret));
  const row = store.rows.get("acc1")!;
  assert.equal(row.lastNonce, BigInt(c.now()) * 1000n);
  assert.equal(row.leaseUntilMs, null, "bail rendu apres l'appel");
  assert.equal(row.lastOkMs, c.now());
});

test("reutilisation 5 min : un second appel (clic manuel, relance du classeur) ne touche pas Kraken", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const k = fakeKraken([{ body: { error: [], result: { XXBT: "1" } } }, { body: { error: [], result: { XXBT: "2" } } }]);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  await reader.readBalances("acc1", creds);
  c.advance(KRAKEN_REUSE_MS - 1);
  const again = await reader.readBalances("acc1", creds);
  assert.equal(again.reused, true);
  assert.deepEqual(again.balances, { XXBT: "1" });
  assert.equal(k.calls.length, 1);
  c.advance(2);
  const fresh = await reader.readBalances("acc1", creds);
  assert.equal(fresh.reused, false);
  assert.deepEqual(fresh.balances, { XXBT: "2" });
  assert.equal(k.calls.length, 2);
});

test("deux demandes simultanees = un seul appel Kraken", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const k = fakeKraken([{ body: { error: [], result: { XXBT: "1" } } }]);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  const [a, b] = await Promise.all([reader.readBalances("acc1", creds), reader.readBalances("acc1", creds)]);
  assert.equal(k.calls.length, 1);
  assert.deepEqual(a.balances, b.balances);
});

test("nonce strictement croissant meme si l'horloge recule", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const reader = () => createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: c.now });
  await reader().readBalances("acc1", creds);
  const first = store.rows.get("acc1")!.lastNonce;
  c.advance(KRAKEN_MIN_INTERVAL_MS + 1);
  // Seconde instance (nouveau deploiement) dont l'horloge serait en retard : le magasin impose +1.
  const lagging = createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: () => c.now() - 10 * 60_000 });
  store.rows.get("acc1")!.lastCallMs = 0;
  await lagging.readBalances("acc1", creds);
  assert.equal(store.rows.get("acc1")!.lastNonce, first + 1n);
});

test("Temporary lockout : pause persistee 60 min, aucune relance, refus sans appel ensuite (meme autre instance)", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const k = fakeKraken([{ body: { error: ["EGeneral:Temporary lockout"] } }]);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(reader.readBalances("acc1", creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused" && e.resumeAtMs === c.now() + KRAKEN_LOCKOUT_PAUSE_MS);
  assert.equal(k.calls.length, 1, "aucune relance automatique");
  c.advance(KRAKEN_LOCKOUT_PAUSE_MS - 1000);
  const other = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(other.readBalances("acc1", creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused");
  assert.equal(k.calls.length, 1, "pendant la pause, aucun appel");
  assert.match(new KrakenGuardError("kraken_paused", c.now()).message, /temporary lockout/i);
});

test("bail en cours sur une autre instance : busy, aucun appel", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  await store.claim("acc1", c.now(), "1");
  const k = fakeKraken([]);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(reader.readBalances("acc1", creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  assert.equal(k.calls.length, 0);
});

test("intervalle minimal entre deux appels reels, meme sans copie locale (autre instance)", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  await createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: c.now }).readBalances("acc1", creds);
  c.advance(KRAKEN_MIN_INTERVAL_MS - 1);
  const k = fakeKraken([]);
  await assert.rejects(createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now }).readBalances("acc1", creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_too_soon");
  assert.equal(k.calls.length, 0);
});

test("erreur distante autre que lockout : bail rendu, pas de pause, message brut seulement pour le journal", async () => {
  const store = createMemoryKrakenGuardStore();
  const c = clock();
  const reader = createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: ["EAPI:Invalid nonce"] } }]).fetchImpl, now: c.now });
  await assert.rejects(reader.readBalances("acc1", creds), /Invalid nonce/);
  const row = store.rows.get("acc1")!;
  assert.equal(row.leaseUntilMs, null);
  assert.equal(row.lockoutUntilMs, null);
});

test("reponse au format inattendu : refus, aucun solde fabrique", async () => {
  const store = createMemoryKrakenGuardStore();
  const reader = createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: { XXBT: "abc" } } }]).fetchImpl, now: clock().now });
  await assert.rejects(reader.readBalances("acc1", creds), /invalid amount/);
});

test("magasin PostgreSQL : un seul UPDATE atomique conditionne au bail, a la pause et a l'intervalle", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const sql = {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      queries.push({ sql: query, values });
      if (query.startsWith("INSERT")) return [] as T;
      return [{ lockout: "1800003600000", lease: null }] as T;
    },
    async $executeRawUnsafe(query: string, ...values: unknown[]) { queries.push({ sql: query, values }); return 1; },
  };
  const store = createPrismaKrakenGuardStore(sql);
  const claim = await store.claim("acc1", 1_800_000_000_000, "1800000000000000");
  assert.deepEqual(claim, { kind: "paused", untilMs: 1_800_003_600_000 });
  const insert = queries[0]!;
  assert.match(insert.sql, /ON CONFLICT \("account_id"\) DO UPDATE/);
  assert.match(insert.sql, /GREATEST\("kraken_call_state"\."last_nonce" \+ 1, EXCLUDED\."last_nonce"\)/);
  assert.match(insert.sql, /"lease_until_ms" IS NULL OR .*"lease_until_ms" <= \$4::bigint/);
  assert.match(insert.sql, /"lockout_until_ms" IS NULL OR .*"lockout_until_ms" <= \$4::bigint/);
  assert.match(insert.sql, /"last_call_ms" IS NULL OR .*"last_call_ms" <= \$5::bigint/);
  assert.match(insert.sql, /RETURNING "last_nonce"::text/);
  assert.deepEqual(insert.values, ["acc1", "1800000000000000", String(1_800_000_000_000 + 45_000), "1800000000000", String(1_800_000_000_000 - KRAKEN_MIN_INTERVAL_MS)]);
  await store.release("acc1", { lockoutUntilMs: 5 });
  assert.deepEqual(queries.at(-1)!.values, ["acc1", "5", null]);
});
