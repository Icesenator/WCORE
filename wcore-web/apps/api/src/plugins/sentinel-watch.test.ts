// Run: tsx --test apps/api/src/plugins/sentinel-watch.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "@wcore/core";
import { runAnnouncementWatch, saveWatchState, keywordSnippets, visibleText, type WatchSource } from "./sentinel-watch.js";
import { runSentinelCheck, SENTINEL_KEYS, type Proposal } from "./sentinel.js";

const NOW = Date.parse("2026-07-01T09:00:00Z");
const SRC: WatchSource[] = [{ chainKey: "moonbeam", url: "https://example.test/news", publisher: "Moonbeam" }];
const page = (items: string[]) => `<html><head><script>var migrate=1</script></head><body><nav>Home</nav>${items.map((i) => `<article>${i}</article>`).join("")}</body></html>`;
const run = async (store: MemoryCacheStore, f: () => Promise<{ status: number; text: string }>, now: number) => { const r = await runAnnouncementWatch(store, f, now, SRC); await saveWatchState(store, r.state); return r; };
const fetchOf = (html: () => string) => async () => ({ status: 200, text: html() });

describe("veille des annonces", () => {
  test("texte visible : ignore scripts et balises", () => {
    assert.equal(visibleText("<script>migrate()</script><p>Hello&nbsp;<b>world</b></p>"), "| Hello world |");
  });

  test("passages : mot cle trouve avec son contexte, sans doublon", () => {
    const s = keywordSnippets("Moonbeam network relaunches on Base. All GLMR holders must migrate before July 31. Migrate now.");
    assert.ok(s.length >= 2);
    assert.ok(s.some((x) => /relaunches/i.test(x.snippet)));
  });

  test("premiere lecture = ligne de base : aucune proposition meme si des mots cles sont presents", async () => {
    const store = new MemoryCacheStore();
    const r = await run(store, fetchOf(() => page(["Migration guide for old users"])), NOW);
    assert.deepEqual({ checked: r.checked, failed: r.failed, n: r.proposals.length }, { checked: 1, failed: 0, n: 0 });
  });

  test("anticipation : une annonce de fermeture apparue apres la base cree une proposition a valider", async () => {
    const store = new MemoryCacheStore();
    let items = ["Weekly update: new grants"];
    const f = fetchOf(() => page(items));
    await run(store, f, NOW);
    items = ["Moonbeam strategic update: the network relaunches on Base, GLMR migration closes July 31", ...items];
    const r = await run(store, f, NOW + 3600_000);
    assert.ok(r.proposals.length >= 1);
    const p = r.proposals[0]!;
    assert.equal(p.status, "PENDING_ADMIN_REVIEW");
    assert.equal(p.kind, "ANNOUNCEMENT_KEYWORD");
    assert.equal(p.chainKey, "moonbeam");
    assert.match(p.snippet ?? "", /relaunches on Base/);
    // Pas de nouvelle proposition au passage suivant.
    const again = await run(store, f, NOW + 7200_000);
    assert.equal(again.proposals.length, 0);
  });

  test("echec reseau ou HTTP : compte en echec, aucune proposition, base conservee", async () => {
    const store = new MemoryCacheStore();
    await run(store, fetchOf(() => page(["stable"])), NOW);
    const down = await run(store, async () => { throw new Error("boom"); }, NOW + 1);
    const http = await run(store, async () => ({ status: 503, text: "" }), NOW + 2);
    assert.deepEqual([down.failed, down.proposals.length, http.failed, http.proposals.length], [1, 0, 1, 0]);
  });

  test("integre a la passe Sentinel : la proposition est stockee et comptee", async () => {
    const store = new MemoryCacheStore();
    let items = ["Weekly update"];
    const fetchText = async (url: string) => (url === SRC[0]!.url ? { status: 200, text: page(items) } : { status: 200, text: `stable:${url}` });
    await runSentinelCheck({ store, fetchText, now: () => NOW, watchSources: SRC });
    items = ["The network will sunset on August 15"];
    const r = await runSentinelCheck({ store, fetchText, now: () => NOW + 6 * 3600_000, watchSources: SRC });
    assert.ok((r.health?.proposalsCreated ?? 0) >= 1);
    const props = (await store.get<Proposal[]>(SENTINEL_KEYS.proposals)) || [];
    assert.ok(props.some((p) => p.kind === "ANNOUNCEMENT_KEYWORD" && /sunset/i.test(p.snippet ?? "")));
  });
});

describe("robustesse (relecture PR 182)", () => {
  test("compteurs, dates relatives et nouvel article voisin : aucune fausse proposition", async () => {
    const store = new MemoryCacheStore();
    let n = 3; let head = "";
    const f = fetchOf(() => page([...(head ? [head] : []), `Migration guide for builders 5 min read ${n} days ago, ${n * 100} views`]));
    await run(store, f, NOW);
    n = 9; head = "Brand new unrelated article about grants";
    const r = await run(store, f, NOW + 3600_000);
    assert.equal(r.proposals.length, 0);
  });

  test("plafond : une page coque lue en base puis refonte ne cree pas un flot de propositions", async () => {
    const store = new MemoryCacheStore();
    let items: string[] = [];
    const f = fetchOf(() => page(items));
    await run(store, f, NOW);
    items = Array.from({ length: 20 }, (_, i) => `Item ${"x".repeat(i + 1)} will be deprecated by vendor ${"y".repeat(i * 7)} and shut down`);
    const r = await run(store, f, NOW + 3600_000);
    assert.ok(r.proposals.length >= 1 && r.proposals.length <= 6);
    assert.ok(r.proposals.some((p) => p.id.includes(":watch:more:")), "le surplus est signale par une synthese");
    const again = await run(store, f, NOW + 7200_000);
    assert.equal(again.proposals.length, 0);
  });

  test("commentaire HTML ignore", () => {
    assert.equal(keywordSnippets(visibleText("<!-- migrate now --><p>Hello</p>")).length, 0);
  });

  test("etat non ecrit tant que l'appelant ne le sauve pas : une annonce n'est jamais perdue", async () => {
    const store = new MemoryCacheStore();
    let items = ["Weekly update"];
    const f = fetchOf(() => page(items));
    await run(store, f, NOW);
    items = ["The network will sunset on August 15"];
    const lost = await runAnnouncementWatch(store, f, NOW + 1, SRC); // persistance des propositions en panne : etat non sauve
    assert.ok(lost.proposals.length >= 1);
    const retry = await run(store, f, NOW + 2);
    assert.ok(retry.proposals.length >= 1);
  });
});