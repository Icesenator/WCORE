import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanExcerpt, collectOfficialChanges, officialHttpsUrl, readOfficialChange, formatChangeDate } from "../lib/sentinel-official-changes";

const NOW = Date.parse("2026-12-01T10:00:00Z");
const ch = (extra: unknown) => [{ chainKey: "c", name: "Chaine", officialChanges: extra }];
const ok = (o: Record<string, unknown> = {}) => ({ sourceId: "s", url: "https://a.example/n", detectedAt: "2026-11-30T00:00:00Z", level: "VIGILANCE", excerpts: ["x"], expiresAt: "2027-02-01T00:00:00Z", ...o });

describe("changements de pages officielles (affichage)", () => {
  test("https seulement", () => {
    assert.ok(officialHttpsUrl("https://a.example"));
    for (const u of ["http://a.example", "javascript:alert(1)", "data:x", "nope", 5, null]) assert.equal(officialHttpsUrl(u), null);
  });
  test("extrait : texte seul, sans balise ni lien, 200 caracteres", () => {
    const e = cleanExcerpt(`<img src=x onerror=alert(1)> [FIABLE] https://evil.example/x ${"a".repeat(400)}`);
    assert.doesNotMatch(e, /[<>[\]]|https?:/);
    assert.ok(e.length <= 200);
  });
  test("entrees malformees, non https, niveau inconnu ou expirees ecartees", () => {
    for (const bad of [null, "x", ok({ url: "http://a.example" }), ok({ level: "CRITIQUE" }), ok({ detectedAt: "pas une date" }), ok({ expiresAt: "2026-11-01T00:00:00Z" })]) assert.equal(readOfficialChange(bad, NOW), null);
  });
  test("mineur : jamais d'extrait ; au plus 3 extraits sinon", () => {
    assert.deepEqual(readOfficialChange(ok({ level: "MINEUR", excerpts: ["secret"] }), NOW)!.excerpts, []);
    assert.equal(readOfficialChange(ok({ excerpts: ["1", "2", "3", "4", "5"] }), NOW)!.excerpts.length, 3);
  });
  test("regroupement par niveau, reponses anciennes sans le champ tolerees", () => {
    const g = collectOfficialChanges(ch([ok(), ok({ level: "INFO" }), ok({ level: "MINEUR" })]), NOW);
    assert.equal(g.vigilance.length, 1); assert.equal(g.info.length, 1); assert.equal(g.minor.length, 1);
    assert.deepEqual(collectOfficialChanges([{ chainKey: "c", name: "C" }], NOW), { vigilance: [], info: [], minor: [] });
    assert.deepEqual(collectOfficialChanges(undefined, NOW), { vigilance: [], info: [], minor: [] });
    assert.deepEqual(collectOfficialChanges(ch("pas une liste"), NOW).vigilance, []);
  });
  test("date lisible", () => {
    assert.match(formatChangeDate("2026-11-30T00:00:00Z", "fr"), /novembre 2026/);
  });
});

describe("composant OfficialChanges (source)", () => {
  const src = readFileSync(new URL("../app/sentinel/OfficialChanges.tsx", import.meta.url), "utf8");
  test("liens sans opener, aucun HTML injecte, formulation prudente", () => {
    assert.doesNotMatch(src, /dangerouslySetInnerHTML|innerHTML/);
    assert.equal((src.match(/target="_blank"/g) || []).length, (src.match(/rel="noopener noreferrer"/g) || []).length);
    assert.match(src, /tx\.seems/);
  });
  test("branche dans la page publique", () => {
    assert.match(readFileSync(new URL("../app/sentinel/SentinelClient.tsx", import.meta.url), "utf8"), /<OfficialChanges /);
  });
});
