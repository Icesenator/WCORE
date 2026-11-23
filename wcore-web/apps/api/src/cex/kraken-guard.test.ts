import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKrakenBalanceReader,
  createMemoryKrakenGuardStore,
  createPrismaKrakenGuardStore,
  KRAKEN_LEASE_MS,
  KRAKEN_LOCKOUT_PAUSE_MS,
  KRAKEN_MAX_SEND_DELAY_MS,
  KRAKEN_MIN_INTERVAL_MS,
  KRAKEN_REUSE_MS,
  KrakenGuardError,
  krakenKeyId,
  parseNonceFloor,
  signKrakenRequest,
  type KrakenGuardStore,
} from "./kraken-guard.js";

// Fausses cles : jamais une vraie, jamais d'appel reseau (fetch injecte).
const creds = { apiKey: "test-key", apiSecret: Buffer.from("test-secret").toString("base64") };
const keyId = krakenKeyId(creds.apiKey);

function fakeKraken(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; body: string; headers: Record<string, string>; redirect: string }> = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string; redirect: "error" }) => {
    calls.push({ url, body: init.body, headers: init.headers, redirect: init.redirect });
    const next = responses.shift() ?? { body: { error: ["EGeneral:Unexpected test call"] } };
    return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, text: async () => JSON.stringify(next.body) };
  };
  return { calls, fetchImpl };
}

function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function setup(responses: Array<{ status?: number; body: unknown }>, c = clock()) {
  const store = createMemoryKrakenGuardStore(c.now);
  const k = fakeKraken(responses);
  const reader = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  return { store, k, reader, c };
}

test("la garde est indexee par l'empreinte de la cle, jamais par la cle ni par le compte", () => {
  assert.match(keyId, /^kraken:[0-9a-f]{32}$/);
  assert.equal(keyId.includes(creds.apiKey), false);
  assert.equal(krakenKeyId(creds.apiKey), keyId, "meme cle = meme garde, meme si le compte WCORE est recree");
  assert.notEqual(krakenKeyId("other-key"), keyId);
});

test("un appel reel renvoie la carte brute Balance, refuse les redirections et persiste le nonce", async () => {
  const { store, k, reader, c } = setup([{ body: { error: [], result: { XXBT: "0.5000000000", "AAPLx.T": "2.0000000000", ZEUR: "10.0000" } } }]);
  const r = await reader.readBalances(creds);
  const nonce = String(BigInt(c.now()) * 1000n);
  assert.deepEqual(r.balances, { XXBT: "0.5000000000", "AAPLx.T": "2.0000000000", ZEUR: "10.0000" });
  assert.equal(r.reused, false);
  assert.equal(r.nonce, nonce);
  assert.equal(k.calls.length, 1);
  assert.equal(k.calls[0]!.url, "https://api.kraken.com/0/private/Balance");
  assert.equal(k.calls[0]!.redirect, "error");
  assert.equal(k.calls[0]!.body, `nonce=${nonce}`);
  assert.equal(k.calls[0]!.headers["API-Sign"], signKrakenRequest("/0/private/Balance", nonce, k.calls[0]!.body, creds.apiSecret));
  const row = store.rows.get(keyId)!;
  assert.equal(row.lastNonce, BigInt(nonce));
  assert.equal(row.leaseUntilMs, null, "bail rendu apres l'appel");
  assert.equal(row.lastOkMs, c.now());
});

test("plancher du classeur : le premier nonce de l'API depasse le dernier nonce GAS", async () => {
  const { store, k, reader, c } = setup([{ body: { error: [], result: {} } }]);
  const gasLast = String(BigInt(c.now()) * 1000n + 5_000_000n);
  const r = await reader.readBalances(creds, { nonceFloor: gasLast });
  assert.equal(r.nonce, String(BigInt(gasLast) + 1n));
  assert.equal(k.calls[0]!.body, `nonce=${BigInt(gasLast) + 1n}`);
  assert.equal(store.rows.get(keyId)!.lastNonce, BigInt(gasLast) + 1n);
  assert.equal(parseNonceFloor("12a"), null);
  assert.equal(parseNonceFloor("99999999999999999999"), null);
  assert.equal(parseNonceFloor(42), null);
});

test("reutilisation 5 min : un second appel (clic manuel, relance du classeur) ne touche pas Kraken", async () => {
  const { k, reader, c } = setup([{ body: { error: [], result: { XXBT: "1" } } }, { body: { error: [], result: { XXBT: "2" } } }]);
  const first = await reader.readBalances(creds);
  c.advance(KRAKEN_REUSE_MS - 1);
  const again = await reader.readBalances(creds);
  assert.equal(again.reused, true);
  assert.equal(again.nonce, first.nonce);
  assert.deepEqual(again.balances, { XXBT: "1" });
  assert.equal(k.calls.length, 1);
  c.advance(2);
  const fresh = await reader.readBalances(creds);
  assert.equal(fresh.reused, false);
  assert.deepEqual(fresh.balances, { XXBT: "2" });
  assert.equal(k.calls.length, 2);
});

test("deux demandes simultanees = un seul appel Kraken", async () => {
  const { k, reader } = setup([{ body: { error: [], result: { XXBT: "1" } } }]);
  const [a, b] = await Promise.all([reader.readBalances(creds), reader.readBalances(creds)]);
  assert.equal(k.calls.length, 1);
  assert.deepEqual(a.balances, b.balances);
});

test("nonce strictement croissant meme si l'horloge d'une instance recule", async () => {
  const c = clock();
  const store = createMemoryKrakenGuardStore(c.now);
  await createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: c.now }).readBalances(creds);
  const first = store.rows.get(keyId)!.lastNonce;
  c.advance(KRAKEN_MIN_INTERVAL_MS + 1);
  // Instance dont l'horloge serait en retard de 10 min : le magasin impose +1.
  const lagging = createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: () => c.now() - 10 * 60_000 });
  await lagging.readBalances(creds);
  assert.equal(store.rows.get(keyId)!.lastNonce, first + 1n);
});

test("Temporary lockout : pause persistee 60 min, aucune relance, refus sans appel ensuite (meme autre instance)", async () => {
  const { store, k, reader, c } = setup([{ body: { error: ["EGeneral:Temporary lockout"] } }]);
  await assert.rejects(reader.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused" && e.resumeAtMs === c.now() + KRAKEN_LOCKOUT_PAUSE_MS);
  assert.equal(k.calls.length, 1, "aucune relance automatique");
  c.advance(KRAKEN_LOCKOUT_PAUSE_MS - 1000);
  const other = createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(other.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused");
  assert.equal(k.calls.length, 1, "pendant la pause, aucun appel");
  assert.match(new KrakenGuardError("kraken_paused", c.now()).message, /temporary lockout/i);
});

test("pause non enregistrable en base : aucune instance ne rappelle Kraken (bail bloquant + pause locale)", async () => {
  const c = clock();
  const inner = createMemoryKrakenGuardStore(c.now);
  const failing: KrakenGuardStore = { claim: inner.claim, release: async () => { throw new Error("db down"); } };
  const k = fakeKraken([{ body: { error: ["EGeneral:Temporary lockout"] } }]);
  const reader = createKrakenBalanceReader({ store: failing, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(reader.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused");
  c.advance(KRAKEN_MIN_INTERVAL_MS + 1);
  await assert.rejects(reader.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_paused");
  // Autre instance, sans copie locale de la pause : le bail jamais rendu bloque toujours.
  const other = createKrakenBalanceReader({ store: failing, fetchImpl: k.fetchImpl, now: c.now });
  await assert.rejects(other.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  c.advance(KRAKEN_LEASE_MS - KRAKEN_MIN_INTERVAL_MS - 2000);
  await assert.rejects(other.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  assert.equal(k.calls.length, 1);
  assert.ok(KRAKEN_LEASE_MS >= KRAKEN_LOCKOUT_PAUSE_MS, "un bail jamais rendu dure au moins une pause");
});

test("titulaire en retard : sa liberation ne libere pas le bail du successeur, mais sa pause est enregistree", async () => {
  const c = clock();
  const store = createMemoryKrakenGuardStore(c.now);
  const a = await store.claim(keyId, "100", null);
  assert.equal(a.kind, "claimed");
  c.advance(KRAKEN_LEASE_MS + KRAKEN_MIN_INTERVAL_MS + 1);
  const b = await store.claim(keyId, "100", null);
  assert.equal(b.kind, "claimed");
  await store.release(keyId, (a as { nonce: string }).nonce, { ok: true, lockout: false });
  assert.notEqual(store.rows.get(keyId)!.leaseUntilMs, null, "le bail du successeur tient toujours");
  await store.release(keyId, (a as { nonce: string }).nonce, { ok: false, lockout: true });
  assert.ok(store.rows.get(keyId)!.lockoutUntilMs! > c.now(), "une pause n'est jamais perdue");
});

test("bail trop entame avant l'envoi : aucun envoi", async () => {
  const c = clock();
  const inner = createMemoryKrakenGuardStore(c.now);
  const slow: KrakenGuardStore = { claim: async (...args) => { const r = await inner.claim(...args); c.advance(KRAKEN_MAX_SEND_DELAY_MS + 1); return r; }, release: inner.release };
  const k = fakeKraken([]);
  await assert.rejects(createKrakenBalanceReader({ store: slow, fetchImpl: k.fetchImpl, now: c.now }).readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  assert.equal(k.calls.length, 0);
  assert.equal(inner.rows.get(keyId)!.leaseUntilMs, null, "bail rendu");
});

test("nonce hors de la plage commune (> 2^53 - 1) : aucun envoi", async () => {
  const { k, reader } = setup([]);
  await assert.rejects(reader.readBalances(creds, { nonceFloor: "9007199254740991" }), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  assert.equal(k.calls.length, 0);
});

test("intervalle : deux envois reels jamais a moins de 60 s, meme avec le delai d'envoi maximal", () => {
  assert.ok(KRAKEN_MIN_INTERVAL_MS - KRAKEN_MAX_SEND_DELAY_MS >= 60_000);
});

test("bail en cours sur une autre instance : busy, aucun appel", async () => {
  const { store, k, reader } = setup([]);
  await store.claim(keyId, "1", null);
  await assert.rejects(reader.readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_busy");
  assert.equal(k.calls.length, 0);
});

test("intervalle minimal entre deux appels reels, meme sans copie locale (autre instance)", async () => {
  const c = clock();
  const store = createMemoryKrakenGuardStore(c.now);
  await createKrakenBalanceReader({ store, fetchImpl: fakeKraken([{ body: { error: [], result: {} } }]).fetchImpl, now: c.now }).readBalances(creds);
  c.advance(KRAKEN_MIN_INTERVAL_MS - 1);
  const k = fakeKraken([]);
  await assert.rejects(createKrakenBalanceReader({ store, fetchImpl: k.fetchImpl, now: c.now }).readBalances(creds), (e: unknown) => e instanceof KrakenGuardError && e.reason === "kraken_too_soon");
  assert.equal(k.calls.length, 0);
});

test("erreur distante autre que lockout : bail rendu, pas de pause", async () => {
  const { store, reader } = setup([{ body: { error: ["EAPI:Invalid nonce"] } }]);
  await assert.rejects(reader.readBalances(creds), /Invalid nonce/);
  const row = store.rows.get(keyId)!;
  assert.equal(row.leaseUntilMs, null);
  assert.equal(row.lockoutUntilMs, null);
});

test("reponse au format inattendu : refus, aucun solde fabrique", async () => {
  const { reader } = setup([{ body: { error: [], result: { XXBT: "abc" } } }]);
  await assert.rejects(reader.readBalances(creds), /invalid amount/);
});

test("magasin PostgreSQL : horloge de la base, UPSERT conditionne, liberation conditionnee au nonce", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const sql = {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      queries.push({ sql: query, values });
      if (query.includes("INSERT")) return [] as T;
      if (query.startsWith("UPDATE")) return [{ lockout: "1800003600000" }] as T;
      return [{ lockout: "1800003600000", lease: null, now_ms: "1800000000000" }] as T;
    },
  };
  const store = createPrismaKrakenGuardStore(sql);
  const claim = await store.claim(keyId, "1800000000000000", "1799999999999999");
  assert.deepEqual(claim, { kind: "paused", untilMs: 1_800_003_600_000 });
  const insert = queries[0]!;
  assert.match(insert.sql, /clock_timestamp\(\)/);
  assert.match(insert.sql, /GREATEST\(\$2::bigint, COALESCE\(\$3::bigint, 0\) \+ 1\)/);
  assert.match(insert.sql, /ON CONFLICT \("key_id"\) DO UPDATE/);
  assert.match(insert.sql, /GREATEST\("kraken_call_state"\."last_nonce" \+ 1, EXCLUDED\."last_nonce"\)/);
  assert.match(insert.sql, /"lease_until_ms" <= EXCLUDED\."last_call_ms"/);
  assert.match(insert.sql, /"lockout_until_ms" <= EXCLUDED\."last_call_ms"/);
  assert.match(insert.sql, /"last_call_ms" <= EXCLUDED\."last_call_ms" - \$5::bigint/);
  assert.deepEqual(insert.values, [keyId, "1800000000000000", "1799999999999999", String(KRAKEN_LEASE_MS), String(KRAKEN_MIN_INTERVAL_MS)]);
  const saved = await store.release(keyId, "42", { ok: false, lockout: true });
  assert.deepEqual(saved, { lockoutUntilMs: 1_800_003_600_000 });
  const release = queries.at(-1)!;
  assert.match(release.sql, /CASE WHEN "kraken_call_state"\."last_nonce" = \$2::bigint THEN NULL/);
  assert.deepEqual(release.values, [keyId, "42", true, false, String(KRAKEN_LOCKOUT_PAUSE_MS)]);
});
