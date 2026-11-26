import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "@wcore/core";
import Fastify from "fastify";
import {
  analyzeChange, analyzeSnippet, diffLines, extractDates, normalizeSnapshot, sanitizeExcerpt, publicOfficialChanges,
  expiryMs, SNAPSHOT_MAX, type AnalyzedProposal,
} from "./sentinel-analysis.js";
import { runSentinelCheck, sentinelPlugin, SENTINEL_KEYS, type Proposal } from "./sentinel.js";

const NOW = Date.parse("2026-12-01T10:00:00Z");
const DAY = 86_400_000;
const page = (...lines: string[]) => `<html><body>${lines.map((l) => `<p>${l}</p>`).join("")}</body></html>`;
const change = (before: string[], after: string[]) => analyzeChange(normalizeSnapshot(page(...before)), normalizeSnapshot(page(...after)), NOW);

describe("dates", () => {
  test("formats ISO, anglais, francais, jour/mois", () => {
    assert.deepEqual(extractDates("Deadline 2026-12-15, 15 December 2026, December 15, 2026, 15/12/2026, 15 décembre 2026"), ["2026-12-15"]);
    assert.deepEqual(extractDates("31/02/2026 et 2026-13-40"), []);
  });
});

describe("classement", () => {
  test("mot fort => VIGILANCE, extrait des lignes ajoutees", () => {
    const a = change(["Home", "Docs"], ["Home", "Docs", "The network will shut down on 15 January 2027. Withdraw your funds."]);
    assert.equal(a.level, "VIGILANCE");
    assert.equal(a.detail, "DIFF");
    assert.ok(a.dates.includes("2027-01-15"));
    assert.match(a.excerpts[0]!, /shut down/i);
  });
  test("francais : fermeture => VIGILANCE", () => {
    assert.equal(change(["a b c"], ["a b c", "Annonce : fermeture du réseau prévue."]).level, "VIGILANCE");
  });
  test("mot faible + date future dans la meme ligne => VIGILANCE ; sans date => INFO", () => {
    assert.equal(change(["x y z"], ["x y z", "Migration deadline: 20 December 2026"]).level, "VIGILANCE");
    assert.equal(change(["x y z"], ["x y z", "New bridge UI available"]).level, "INFO");
  });
  test("mot faible + date passee ancienne => INFO", () => {
    assert.equal(change(["x y z"], ["x y z", "Migration done on 2020-01-01"]).level, "INFO");
  });
  test("ni mot-cle ni date => MINEUR, aucun extrait", () => {
    const a = change(["x y z"], ["x y z", "Footer updated, copyright 2026"]);
    assert.equal(a.level, "MINEUR");
    assert.deepEqual(a.excerpts, []);
  });
  test("version precedente absente => INFO sans extrait", () => {
    const a = analyzeChange(null, "anything", NOW);
    assert.equal(a.level, "INFO");
    assert.equal(a.detail, "UNAVAILABLE");
  });
  test("seules les lignes AJOUTEES comptent (un mot deja present ne declenche rien)", () => {
    assert.equal(change(["Sunset of legacy API", "x y z"], ["Sunset of legacy API", "x y z", "Hello world"]).level, "MINEUR");
  });
  test("passage d'annonce : jamais MINEUR", () => {
    assert.equal(analyzeSnippet("we plan a migration of the portal", NOW).level, "INFO");
    assert.equal(analyzeSnippet("chain sunset announced", NOW).level, "VIGILANCE");
  });
  test("diff : lignes ajoutees et retirees", () => {
    assert.deepEqual(diffLines("a\nb", "b\nc"), { added: ["c"], removed: ["a"] });
  });
});

describe("securite du texte externe", () => {
  test("normalisation : ni script, ni balise, borne", () => {
    const t = normalizeSnapshot(`<script>alert(1)</script><style>x{}</style><p>Hello <b>world</b></p><!-- shutdown -->` + `<p>${"z".repeat(50_000)}</p>`);
    assert.doesNotMatch(t, /<|alert|shutdown/);
    assert.ok(t.length <= SNAPSHOT_MAX);
  });
  test("extrait : balises, liens, marqueurs, sauts de ligne neutralises, 200 caracteres max", () => {
    const e = sanitizeExcerpt(`<img src=x onerror=alert(1)> [OFFICIAL] {"deadline":"2026-12-31"} https://evil.example/x www.evil.example${String.fromCharCode(10)}line2${String.fromCharCode(8232, 8238)} ${"a".repeat(400)}`);
    assert.doesNotMatch(e, /[<>[\]{}`|]/);
    assert.doesNotMatch(e, /https?:|www\./);
    assert.ok(!e.includes(String.fromCharCode(10)));
    assert.ok(![8232, 8238, 0].some((c) => e.includes(String.fromCharCode(c))));
    assert.ok(e.length <= 200);
  });
  test("une page hostile ne produit que du texte nettoye dans l'analyse", () => {
    const a = change(["x y z"], ["x y z", `<a href="javascript:alert(1)">shutdown</a> https://evil.example [FIABLE] 2026-12-20`]);
    assert.equal(a.level, "VIGILANCE");
    for (const e of a.excerpts) assert.doesNotMatch(e, /[<>[\]{}]|https?:|javascript/i);
  });
});

describe("affichage public", () => {
  const mk = (o: Partial<AnalyzedProposal>): AnalyzedProposal => ({ sourceId: "s", url: "https://a.example/n", detectedAt: new Date(NOW - DAY).toISOString(), status: "AUTO_PUBLISHED", analysis: analyzeSnippet("chain sunset 2027-01-10", NOW - DAY), ...o });
  const allowed = new Set(["https://a.example/n"]);
  test("expiration : mineur 7 j, info 30 j, vigilance 90 j", () => {
    const old = (d: number) => new Date(NOW - d * DAY).toISOString();
    const lvl = (level: "MINEUR" | "INFO" | "VIGILANCE") => ({ ...analyzeSnippet("sunset", NOW), level });
    assert.equal(publicOfficialChanges([mk({ detectedAt: old(8), analysis: lvl("MINEUR") })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({ detectedAt: old(6), analysis: lvl("MINEUR") })], allowed, "2020-01-01T00:00:00Z", NOW).length, 1);
    assert.equal(publicOfficialChanges([mk({ detectedAt: old(31), analysis: lvl("INFO") })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({ detectedAt: old(89), analysis: lvl("VIGILANCE") })], allowed, "2020-01-01T00:00:00Z", NOW).length, 1);
    assert.equal(publicOfficialChanges([mk({ detectedAt: old(91), analysis: lvl("VIGILANCE") })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(expiryMs("VIGILANCE"), 90 * DAY);
  });
  test("vigilance couverte par une fiche validee posterieure => retiree", () => {
    assert.equal(publicOfficialChanges([mk({})], allowed, new Date(NOW).toISOString(), NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({})], allowed, new Date(NOW - 5 * DAY).toISOString(), NOW).length, 1);
  });
  test("URL inconnue, non https, proposition rejetee ou en attente => jamais servie", () => {
    assert.equal(publicOfficialChanges([mk({ url: "https://evil.example" })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({ url: "http://a.example/n" })], new Set(["http://a.example/n"]), "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({ status: "REJECTED" })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
    assert.equal(publicOfficialChanges([mk({ status: "PENDING_ADMIN_REVIEW" })], allowed, "2020-01-01T00:00:00Z", NOW).length, 0);
  });
  test("tri : vigilance d'abord ; mineur sans extrait", () => {
    const minor = mk({ analysis: { ...analyzeSnippet("sunset", NOW), level: "MINEUR" }, detectedAt: new Date(NOW - 1000).toISOString() });
    const out = publicOfficialChanges([minor, mk({})], allowed, "2020-01-01T00:00:00Z", NOW);
    assert.equal(out[0]!.level, "VIGILANCE");
    assert.deepEqual(out[1]!.excerpts, []);
  });
});

describe("collecteur : traitement automatique de bout en bout", () => {
  const URL_ = "https://migrate.abs.xyz/";
  const fetchFrom = (text: string) => async () => ({ status: 200, text });
  test("changement => proposition AUTO_PUBLISHED analysee, snapshot conserve, aucun compteur d'attente, bandeau public", async () => {
    const store = new MemoryCacheStore();
    const run = (text: string, at: number) => runSentinelCheck({ store, fetchText: async (u) => (u === URL_ ? { status: 200, text } : { status: 404, text: "" }), now: () => at, watchSources: [] });
    await run(page("Welcome", "Docs"), NOW);
    await run(page("Welcome", "Docs", "The network will be shut down on 15 January 2027."), NOW + 6 * 3600_000);
    const props = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(props.length, 1);
    assert.equal(props[0]!.status, "AUTO_PUBLISHED");
    assert.equal(props[0]!.analysis?.level, "VIGILANCE");
    assert.equal(props.filter((p) => p.status === "PENDING_ADMIN_REVIEW").length, 0);
    const snapEntry = await store.get<{ text: string }>(SENTINEL_KEYS.snap("abstract:abs-migrate"));
    assert.match(snapEntry?.text ?? "", /shut down/);

    const app = Fastify();
    await app.register(sentinelPlugin, { store, fetchText: fetchFrom(""), isAdmin: () => false, userId: () => null, exposuresFor: async () => [], now: () => NOW + 7 * 3600_000, watchSources: [] });
    const chains = ((await app.inject({ method: "GET", url: "/api/sentinel/chains" })).json() as { chains: { chainKey: string; officialChanges: { level: string; url: string; excerpts: string[] }[] }[] }).chains;
    const abs = chains.find((c) => c.chainKey === "abstract")!;
    assert.equal(abs.officialChanges[0]!.level, "VIGILANCE");
    assert.equal(abs.officialChanges[0]!.url, URL_);
    assert.match(abs.officialChanges[0]!.excerpts[0]!, /shut down/);
    const health = (await app.inject({ method: "GET", url: "/api/sentinel/health" })).json() as { announcementsPending: number; vigilanceOpen: number };
    assert.equal(health.announcementsPending, 0);
    assert.equal(health.vigilanceOpen, 1);
  });
  test("anciennes propositions en attente reprises automatiquement", async () => {
    const store = new MemoryCacheStore();
    const old: Proposal = { id: "abstract:watch:1", chainKey: "abstract", sourceId: "watch", url: "https://a.example/n", previousSha256: null, newSha256: "1", detectedAt: new Date(NOW - 2 * DAY).toISOString(), status: "PENDING_ADMIN_REVIEW", kind: "ANNOUNCEMENT_KEYWORD", snippet: "legacy network sunset announced" };
    await store.set(SENTINEL_KEYS.proposals, [old]);
    await runSentinelCheck({ store, fetchText: async () => ({ status: 404, text: "" }), now: () => NOW, watchSources: [] });
    const props = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(props[0]!.status, "AUTO_PUBLISHED");
    assert.equal(props[0]!.analysis?.level, "VIGILANCE");
  });
});

describe("garanties de la revue (perte de signal, ecriture, verrou, retention)", () => {
  const URL_ = "https://migrate.abs.xyz/";
  const mkFetch = (body: () => string) => async (u: string) => (u === URL_ ? { status: 200, text: body() } : { status: 404, text: "" });
  test("annonce fragmentee entre blocs => VIGILANCE (pas MINEUR)", () => {
    const a = change(["x y z"], ["x y z", "The network will be", "shut", "down soon"]);
    assert.notEqual(a.level, "MINEUR");
    const b = change(["x y z"], ["x y z", "Le réseau sera", "fermé", "bientôt"]);
    assert.equal(b.level, "VIGILANCE");
  });
  test("francais : arret, cloture, fin du support, mise hors service", () => {
    for (const l of ["Arrêt du réseau annoncé", "Clôture du réseau", "Fin du support le mois prochain", "Mise hors service prévue"]) assert.equal(change(["x y z"], ["x y z", l]).level, "VIGILANCE", l);
  });
  test("beaucoup de lignes ajoutees : la fermeture en fin de liste est vue", () => {
    const many = Array.from({ length: 900 }, (_, i) => `ligne ${i} bla`);
    assert.equal(change(["x y z"], ["x y z", ...many, "The chain will sunset"]).level, "VIGILANCE");
  });
  test("page plus longue que la zone analysee : jamais MINEUR", () => {
    const big = Array.from({ length: 4000 }, (_, i) => `ligne numero ${i}`);
    const a = analyzeChange(normalizeSnapshot(page(...big)), normalizeSnapshot(page(...big.slice(0, 3999), "autre ligne finale")), NOW);
    assert.notEqual(a.level, "MINEUR");
  });
  test("extraits publics marques non verifies", () => {
    const p: AnalyzedProposal = { sourceId: "s", url: "https://a.example/n", detectedAt: new Date(NOW - DAY).toISOString(), status: "AUTO_PUBLISHED", analysis: analyzeSnippet("sunset", NOW) };
    assert.equal(publicOfficialChanges([p], new Set(["https://a.example/n"]), "2020-01-01T00:00:00Z", NOW)[0]!.verified, false);
  });
  test("texte conserve lie a l'empreinte : un texte d'une autre version n'est pas une base de comparaison", async () => {
    const store = new MemoryCacheStore();
    let body = page("Welcome", "Docs");
    const run = (at: number) => runSentinelCheck({ store, fetchText: mkFetch(() => body), now: () => at, watchSources: [] });
    await run(NOW);
    const key = SENTINEL_KEYS.snap("abstract:abs-migrate");
    const snap = await store.get<{ sha: string; text: string }>(key);
    assert.ok(snap && /^[0-9a-f]{64}$/.test(snap.sha));
    await store.set(key, { sha: "0".repeat(64), text: "autre version" });
    body = page("Welcome", "Docs", "We will shut down");
    await run(NOW + 6 * 3600_000);
    const props = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(props[0]!.analysis?.detail, "UNAVAILABLE");
  });
  test("ecriture : proposition ecrite AVANT l'empreinte ; une panne sur l'empreinte ne perd pas le changement", async () => {
    const store = new MemoryCacheStore();
    let body = page("Welcome", "Docs");
    const run = (at: number) => runSentinelCheck({ store, fetchText: mkFetch(() => body), now: () => at, watchSources: [] });
    await run(NOW);
    body = page("Welcome", "Docs", "The chain will sunset");
    const realSet = store.set.bind(store);
    store.set = (async (k: string, v: unknown, ttl?: number) => { if (k === SENTINEL_KEYS.sources) throw new Error("panne"); return realSet(k, v, ttl); }) as typeof store.set;
    await run(NOW + 6 * 3600_000);
    store.set = realSet;
    const after = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(after.length, 1);
    await run(NOW + 12 * 3600_000);
    const final = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.equal(final.length, 1, "pas de doublon a la redetection");
    assert.equal(final[0]!.analysis?.level, "VIGILANCE");
  });
  test("verrou : une passe qui a perdu son verrou n'ecrit rien et ne supprime pas celui de son successeur", async () => {
    const store = new MemoryCacheStore();
    // Comme un vrai stockage (Redis/PostgreSQL) : chaque lecture rend une copie, jamais la reference interne.
    const rawGet = store.get.bind(store);
    store.get = (async (k: string) => { const v = await rawGet(k); return v === undefined ? v : structuredClone(v); }) as typeof store.get;
    let body = page("Welcome", "Docs");
    await runSentinelCheck({ store, fetchText: mkFetch(() => body), now: () => NOW, watchSources: [] });
    body = page("Welcome", "Docs", "The chain will sunset");
    const before = JSON.stringify((await store.get(SENTINEL_KEYS.proposals)) ?? []);
    let hijacked = false;
    const fetchText = async (u: string) => { if (!hijacked) { hijacked = true; await store.set(SENTINEL_KEYS.lock, "successeur", 600_000); } return mkFetch(() => body)(u); };
    await runSentinelCheck({ store, fetchText, now: () => NOW + 6 * 3600_000, watchSources: [] });
    assert.equal(await store.get(SENTINEL_KEYS.lock), "successeur");
    assert.equal(JSON.stringify((await store.get(SENTINEL_KEYS.proposals)) ?? []), before);
  });
  test("retention : source retiree => etat et texte supprimes ; decisions anciennes purgees", async () => {
    const store = new MemoryCacheStore();
    await store.set(SENTINEL_KEYS.sources, { "ancienne:src": { url: "https://x.example", sha256: "a", checkedAt: "2026-01-01T00:00:00Z", status: "OK" } });
    await store.set(SENTINEL_KEYS.snap("ancienne:src"), { sha: "a", text: "t" });
    const old = (id: string, status: Proposal["status"], d: number): Proposal => ({ id, chainKey: "abstract", sourceId: "s", url: "https://x.example", previousSha256: null, newSha256: id, detectedAt: new Date(NOW - d * DAY).toISOString(), decidedAt: new Date(NOW - d * DAY).toISOString(), status });
    await store.set(SENTINEL_KEYS.proposals, [old("r1", "REJECTED", 400), old("r2", "REJECTED", 10)]);
    await runSentinelCheck({ store, fetchText: async () => ({ status: 404, text: "" }), now: () => NOW, watchSources: [] });
    assert.ok(!(await store.get(SENTINEL_KEYS.snap("ancienne:src"))));
    assert.ok(!((await store.get<Record<string, unknown>>(SENTINEL_KEYS.sources)) || {})["ancienne:src"]);
    assert.deepEqual(((await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || []).map((p) => p.id), ["r2"]);
  });
  test("compteur de sante aligne sur l'affichage : vigilance hors fiche non comptee", async () => {
    const store = new MemoryCacheStore();
    const v: Proposal = { id: "x", chainKey: "abstract", sourceId: "s", url: "https://inconnue.example/", previousSha256: null, newSha256: "x", detectedAt: new Date(NOW - DAY).toISOString(), status: "AUTO_PUBLISHED", analysis: analyzeSnippet("sunset", NOW) };
    await store.set(SENTINEL_KEYS.proposals, [v]);
    const app = Fastify();
    await app.register(sentinelPlugin, { store, fetchText: async () => ({ status: 404, text: "" }), isAdmin: () => false, userId: () => null, exposuresFor: async () => [], now: () => NOW, watchSources: [] });
    assert.equal(((await app.inject({ method: "GET", url: "/api/sentinel/health" })).json() as { vigilanceOpen: number }).vigilanceOpen, 0);
  });
});

describe("second tour de revue : store de production, contexte, hors registre", () => {
  test("store de production : le verrou se lit et se libere dans Redis, jamais dans PostgreSQL", async () => {
    const { createSentinelStore } = await import("./sentinel-store.js");
    const redis = new Map<string, unknown>();
    const lock = {
      add: async (k: string, v: unknown) => (redis.has(k) ? false : (redis.set(k, v), true)),
      get: async (k: string) => redis.get(k),
      delete: async (k: string) => { redis.delete(k); },
      compareAndDelete: async (k: string, e: unknown) => (redis.get(k) === e ? (redis.delete(k), true) : false),
    };
    const sqlRows = new Map<string, unknown>();
    const sql = {
      $queryRawUnsafe: async (_q: string, key: string) => (sqlRows.has(key) ? [{ value: sqlRows.get(key) }] : []),
      $executeRawUnsafe: async (_q: string, key: string, value: string) => { sqlRows.set(key, JSON.parse(value)); return 1; },
    };
    const store = createSentinelStore(sql as never, lock as never);
    // Un verrou lu dans PostgreSQL ne serait jamais trouve : la passe se croirait toujours depossedee.
    await runSentinelCheck({ store, fetchText: async () => ({ status: 404, text: "" }), now: () => NOW, watchSources: [] });
    assert.equal(redis.size, 0, "verrou libere par son proprietaire");
    assert.ok(sqlRows.has(SENTINEL_KEYS.proposals), "ecritures effectuees (le verrou n'a pas ete juge perdu)");
    redis.set(SENTINEL_KEYS.lock, "autre");
    assert.equal(await (store as unknown as { compareAndDelete: (k: string, e: unknown) => Promise<boolean> }).compareAndDelete(SENTINEL_KEYS.lock, "pas-moi"), false);
    assert.equal(redis.get(SENTINEL_KEYS.lock), "autre");
  });
  test("negation retiree dans un bloc, mention de fermeture dans un bloc inchange => au moins INFO, extrait de la mention", () => {
    const a = change(["There are no plans to", "The network will shut down.", "x y z"], ["There are plans to", "The network will shut down.", "x y z"]);
    assert.notEqual(a.level, "MINEUR");
    assert.match(a.excerpts[0] ?? "", /shut down/);
    const b = change(["Intro", "x y z"], ["Intro changed", "x y z"]);
    assert.equal(b.level, "MINEUR");
  });
  test("chaine surveillee hors registre : annonce servie dans extraOfficialChanges et comptee", async () => {
    const store = new MemoryCacheStore();
    const p: Proposal = { id: "horsreg:watch:1", chainKey: "horsreg", sourceId: "watch", url: "https://news.example/", previousSha256: null, newSha256: "1", detectedAt: new Date(NOW - DAY).toISOString(), status: "AUTO_PUBLISHED", analysis: analyzeSnippet("chain sunset announced", NOW - DAY) };
    await store.set(SENTINEL_KEYS.proposals, [p]);
    const app = Fastify();
    await app.register(sentinelPlugin, { store, fetchText: async () => ({ status: 404, text: "" }), isAdmin: () => false, userId: () => null, exposuresFor: async () => [], now: () => NOW, watchSources: [{ chainKey: "horsreg", url: "https://news.example/", publisher: "Hors Registre" }] });
    const body = (await app.inject({ method: "GET", url: "/api/sentinel/chains" })).json() as { extraOfficialChanges: { chainKey: string; name: string; officialChanges: { level: string }[] }[] };
    assert.equal(body.extraOfficialChanges[0]!.name, "Hors Registre");
    assert.equal(body.extraOfficialChanges[0]!.officialChanges[0]!.level, "VIGILANCE");
    assert.equal(((await app.inject({ method: "GET", url: "/api/sentinel/health" })).json() as { vigilanceOpen: number }).vigilanceOpen, 1);
  });
  test("purge d'un texte orphelin en echec : l'etat est conserve pour retenter", async () => {
    const store = new MemoryCacheStore();
    await store.set(SENTINEL_KEYS.sources, { "ancienne:src": { url: "https://x.example", sha256: "a", checkedAt: "2026-01-01T00:00:00Z", status: "OK" } });
    const realDelete = store.delete.bind(store);
    store.delete = (async (k: string) => { if (k === SENTINEL_KEYS.snap("ancienne:src")) throw new Error("panne"); return realDelete(k); }) as typeof store.delete;
    await runSentinelCheck({ store, fetchText: async () => ({ status: 404, text: "" }), now: () => NOW, watchSources: [] });
    assert.ok(((await store.get<Record<string, unknown>>(SENTINEL_KEYS.sources)) || {})["ancienne:src"]);
  });
});
