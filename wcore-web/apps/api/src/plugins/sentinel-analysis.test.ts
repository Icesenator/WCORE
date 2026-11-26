import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "@wcore/core";
import Fastify from "fastify";
import {
  analyzeChange, analyzeSnippet, diffLines, extractDates, normalizeSnapshot, sanitizeExcerpt, publicOfficialChanges, countOpenVigilance,
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
  test("compteur de controle : seulement les vigilances ouvertes", () => {
    const p = { ...mk({}), chainKey: "c" };
    assert.equal(countOpenVigilance([p, { ...p, status: "REJECTED" }], new Map(), NOW), 1);
    assert.equal(countOpenVigilance([p], new Map([["c", new Date(NOW).toISOString()]]), NOW), 0);
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
    assert.match((await store.get<string>(SENTINEL_KEYS.snap("abstract:abs-migrate"))) ?? "", /shut down/);

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
