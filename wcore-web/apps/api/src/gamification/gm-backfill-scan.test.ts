// Run: tsx --test apps/api/src/gamification/gm-backfill-scan.test.ts
// Scan de rattrapage sur des RPC publics limites : historique elague, plafond de plage eth_getLogs,
// point d'acces mort, budget d'appels. Aucune base de donnees : le scan est teste seul.
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { GmBackfillRpcError, scanGmBackfillCandidates, type RebuildDeps } from "./gm-streak-rebuild.js";

const SIG = "0x" + "11".repeat(32);
const USER = "0x" + "a1".padStart(40, "0");
const PADDED = "0x" + USER.slice(2).padStart(64, "0");
const CONTRACT = "0x" + "b1".padStart(40, "0");
const A = "https://203.0.113.10";
const B = "https://203.0.113.11";
const HEAD = 1_000_000;
const BLOCK_S = 2;
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const FROM = Date.UTC(2026, 10, 18);
const TO = Date.UTC(2026, 10, 19);
const word = (n: number) => n.toString(16).padStart(64, "0");
const tsOf = (height: number) => Math.floor(NOW / 1000) - (HEAD - height) * BLOCK_S;
// GM a 10:00 UTC le 18/11 : bloc retrouve par le temps.
const GM_MS = Date.UTC(2026, 10, 18, 10);
const GM_BLOCK = HEAD - Math.round((NOW - GM_MS) / 1000 / BLOCK_S);
const gmLog = { address: CONTRACT, topics: [SIG, PADDED], data: "0x" + word(GM_MS / 1000) + word(1) + word(1),
  transactionHash: "0x" + "ab".repeat(32), blockNumber: "0x" + GM_BLOCK.toString(16) };

interface Behaviour {
  prunedBelow?: number; logCap?: number; dead?: boolean; calls: Record<string, number>; logCalls: number;
  silentFirst?: number;       // les N premieres requetes ne recoivent aucune reponse, puis le point d'acces repond
  refuseHeights?: number[];   // blocs refuses un par un
  logError?: boolean;         // refuse toute lecture de journaux
  lagSeconds?: number;        // chaine en retard : tous les horodatages sont plus anciens
  noLogs?: boolean;           // point d'acces de secours qui repond sans journaux (reponse incomplete)
  maxSpan: number;
}
let behaviour: Record<string, Behaviour>;
const fresh = (over: Partial<Behaviour> = {}): Behaviour => ({ calls: {}, logCalls: 0, maxSpan: 0, ...over });

type Body = { method: string; params: any[] };
// Reponse d'un point d'acces : null = aucune reponse (hors delai, connexion refusee), sinon objet JSON-RPC.
function answer(endpoint: string, body: Body): object | null {
  const b = behaviour[endpoint]!;
  b.calls[body.method] = (b.calls[body.method] ?? 0) + 1;
  const total = Object.values(b.calls).reduce((sum, n) => sum + n, 0);
  if (b.dead || (b.silentFirst !== undefined && total <= b.silentFirst)) return null;
  if (body.method === "eth_getBlockByNumber") {
    const height = body.params[0] === "latest" ? HEAD : Number(body.params[0]);
    if (b.prunedBelow !== undefined && height < b.prunedBelow) return { error: { message: "pruned history unavailable" } };
    if (b.refuseHeights?.includes(height)) return { error: { message: "block unavailable" } };
    return { result: { number: "0x" + height.toString(16), timestamp: "0x" + (tsOf(height) - (b.lagSeconds ?? 0)).toString(16) } };
  }
  if (body.method === "eth_getLogs") {
    b.logCalls++;
    const range = body.params[0] as { fromBlock: string; toBlock: string };
    const from = Number(range.fromBlock);
    const to = Number(range.toBlock);
    b.maxSpan = Math.max(b.maxSpan, to - from + 1);
    if (b.logError) return { error: { message: "limit exceeded" } };
    if (b.noLogs) return { result: [] };
    if (b.logCap !== undefined && to - from + 1 > b.logCap) return { error: { message: "block range too large" } };
    return { result: [gmLog].filter((log) => Number(log.blockNumber) >= from && Number(log.blockNumber) <= to) };
  }
  if (body.method === "eth_getTransactionReceipt") {
    return { result: { status: "0x1", from: USER, to: CONTRACT, logs: [gmLog] } };
  }
  throw new Error("methode RPC inattendue " + body.method);
}

function deps(endpoints: string[]): RebuildDeps {
  mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    const out = answer(String(url).replace(/\/$/, ""), JSON.parse(String(init?.body)) as Body);
    if (out === null) throw new Error("connexion refusee");
    return Response.json(out);
  });
  return {
    prisma: { gmContract: { findMany: async () => [{ id: "c1", contractAddress: CONTRACT }] } } as unknown as RebuildDeps["prisma"],
    getChainRpcs: () => endpoints,
    GM_EVENT_SIG: SIG,
    rpcJson: (async (rpcs: string[], body: object) => answer(rpcs[0]!, body as Body)) as RebuildDeps["rpcJson"],
  };
}

afterEach(() => mock.restoreAll());

test("une plage large acceptee : une seule requete de journaux", async () => {
  behaviour = { [A]: fresh() };
  const found = await scanGmBackfillCandidates(deps([A]), "BASE", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.createdAt.getTime(), GM_MS);
  assert.equal(behaviour[A]!.logCalls, 1);
});

test("historique elague : seuls les blocs recents sont lus, le GM est retrouve", async () => {
  // Les blocs plus vieux que 200 000 sont refuses (elagage) : l'ancienne dichotomie depuis le bloc 0 echouait.
  behaviour = { [A]: fresh({ prunedBelow: HEAD - 200_000 }) };
  const found = await scanGmBackfillCandidates(deps([A]), "SEI", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.txHash, gmLog.transactionHash);
});

test("plafond de plage a 100 blocs : la page refusee est divisee puis la taille retenue, le GM est retrouve", async () => {
  behaviour = { [A]: fresh({ logCap: 100 }) };
  const found = await scanGmBackfillCandidates(deps([A]), "BASE", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
  // 43 200 blocs par jour, pages de 62 apres deux divisions : de l'ordre de 700 requetes, pas de milliers.
  assert.ok(behaviour[A]!.logCalls > 400 && behaviour[A]!.logCalls < 900, String(behaviour[A]!.logCalls));
});

test("point d'acces mort : ecarte apres deux silences, le suivant sert", async () => {
  behaviour = { [A]: fresh({ dead: true }), [B]: fresh() };
  const found = await scanGmBackfillCandidates(deps([A, B]), "ASTAR", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
  const hits = Object.values(behaviour[A]!.calls).reduce((sum, n) => sum + n, 0);
  assert.ok(hits <= 4, "le point d'acces mort n'est plus interroge a chaque appel : " + hits);
});

test("un silence passager ne fait pas ecarter un point d'acces qui repond ensuite : les journaux restent lus chez lui", async () => {
  // A se tait deux fois puis repond ; B (secours) repond sans journaux. Le GM doit venir de A, pas d'un secours incomplet.
  behaviour = { [A]: fresh({ silentFirst: 2 }), [B]: fresh({ noLogs: true }) };
  const found = await scanGmBackfillCandidates(deps([A, B]), "BASE", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
});

test("plafond explicite sous 25 blocs : jamais releve, chaque page respecte le plafond", async () => {
  behaviour = { [A]: fresh({ logCap: 5 }) };
  const small = { ...deps([A]) };
  // Fenetre courte (80 blocs) pour rester sous le budget : 16 pages de 5 blocs.
  const from = Date.UTC(2026, 10, 21, 11, 58);
  const to = Date.UTC(2026, 10, 21, 12, 0) - 20_000;
  await scanGmBackfillCandidates(small, "TAC", USER, 5, from, to, NOW);
  assert.ok(behaviour[A]!.maxSpan <= 5, "page de " + behaviour[A]!.maxSpan + " blocs au-dela du plafond de 5");
});

test("tete en retard : le scan s'arrete (503) au lieu de prendre « aucun bloc » pour une absence", async () => {
  // La chaine annonce une tete vieille de 5 jours : la fenetre du 18/11 existe peut-etre ailleurs.
  behaviour = { [A]: fresh({ lagSeconds: 5 * 86_400 }) };
  await assert.rejects(
    scanGmBackfillCandidates(deps([A]), "BASE", USER, undefined, FROM, TO, NOW),
    (error: unknown) => error instanceof GmBackfillRpcError && error.message === "rpc_head_behind",
  );
  assert.equal(behaviour[A]!.logCalls, 0);
});

test("bloc de reference refuse : l'estimation est abandonnee, le GM est quand meme retrouve", async () => {
  behaviour = { [A]: fresh({ refuseHeights: [HEAD - 1024] }) };
  const found = await scanGmBackfillCandidates(deps([A]), "SOMNIA", USER, undefined, FROM, TO, NOW);
  assert.equal(found.length, 1);
});

test("le budget compte les requetes de chaque point d'acces, pas les pages", async () => {
  // A refuse toute lecture, B l'accepte par pages de 25 : 1 728 pages x 2 requetes depasseraient 1 500.
  behaviour = { [A]: fresh({ logError: true }), [B]: fresh({ logCap: 25 }) };
  await assert.rejects(
    scanGmBackfillCandidates(deps([A, B]), "MONAD", USER, undefined, FROM, TO, NOW),
    (error: unknown) => error instanceof GmBackfillRpcError && error.message === "rpc_budget_exceeded",
  );
  assert.ok(behaviour[A]!.logCalls + behaviour[B]!.logCalls <= 1500, String(behaviour[A]!.logCalls + behaviour[B]!.logCalls));
});

test("plafond sous le plus petit pas : le scan s'arrete (503), rien n'est lu a moitie", async () => {
  behaviour = { [A]: fresh({ logCap: 10 }) };
  await assert.rejects(
    scanGmBackfillCandidates(deps([A]), "BASE", USER, undefined, FROM, TO, NOW),
    (error: unknown) => error instanceof GmBackfillRpcError && error.message === "rpc_incomplete_logs",
  );
});

test("budget d'appels epuise : le scan s'arrete (503) au lieu de tourner indefiniment", async () => {
  // 43 200 blocs par jour a 25 blocs par page (le minimum) : 1 728 pages, au-dela du budget de 1 500 requetes.
  behaviour = { [A]: fresh({ logCap: 25 }) };
  await assert.rejects(
    scanGmBackfillCandidates(deps([A]), "MONAD", USER, undefined, FROM, TO, NOW),
    (error: unknown) => error instanceof GmBackfillRpcError && error.message === "rpc_budget_exceeded",
  );
  assert.ok(behaviour[A]!.logCalls <= 1500, "jamais plus de 1 500 requetes de journaux : " + behaviour[A]!.logCalls);
});
