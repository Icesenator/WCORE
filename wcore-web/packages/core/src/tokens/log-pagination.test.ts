// Run: node --import tsx --test packages/core/src/tokens/log-pagination.test.ts
// P2-CHAIN-LOG-RANGE-OPENLEDGER-ZKLINK (2026-11-09) : pagination bornée d'eth_getLogs.
// rpc.openledger.xyz et zklink-nova.api.pocket.network refusent plus de 1 000 blocs par appel
// (HTTP 400 -32602). La fenêtre de 5 000 blocs doit rester couverte, en segments contigus de
// 1 000 blocs au plus ; une couverture incomplète reste PARTIAL et ne fait jamais avancer le
// curseur au-delà du dernier bloc couvert sans trou.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRANSFER_EVENT_TOPIC } from "./abi.js";
import { discoverTokensByTransferLogs, topicForAddress } from "./log-discovery.js";
import { planLogChunks, nextDiscoveryCursor, resolveLogPagination, LOG_PAGINATION_MAX_CHUNKS_PER_DIRECTION } from "./log-pagination.js";
import { getChain } from "../chains/index.js";
import { effectiveLogScanWindow } from "../engines/evm-types.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const TOKEN_OLD = "0x1111111111111111111111111111111111111111";
const TOKEN_NEW = "0x2222222222222222222222222222222222222222";
const hex = (n: number) => `0x${n.toString(16)}`;

interface Call { from: number; to: number; dir: 1 | 2; endpoint: string }

/** Faux RPC : enregistre chaque eth_getLogs, refuse > maxSpan, peut échouer sur des segments donnés. */
function fakeRpc(opts: {
  maxSpan?: number;
  events?: Array<{ block: number; token: string; dir: 1 | 2 }>;
  failWhen?: (c: Call) => Error | null;
  delayMs?: number;
}) {
  const calls: Call[] = [];
  let active = 0;
  let maxActive = 0;
  const rpc = {
    async call(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
      assert.equal(method, "eth_getLogs");
      const f = params[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
      const from = parseInt(f.fromBlock, 16);
      const to = parseInt(f.toBlock, 16);
      const dir: 1 | 2 = f.topics[1] === null ? 2 : 1;
      const c: Call = { from, to, dir, endpoint };
      calls.push(c);
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        const injected = opts.failWhen?.(c);
        if (injected) throw injected;
        if (opts.maxSpan != null && to - from + 1 > opts.maxSpan) {
          throw new Error("HTTP 400: block range greater than 1000 max");
        }
        return (opts.events ?? [])
          .filter((e) => e.dir === dir && e.block >= from && e.block <= to)
          .map((e) => ({
            address: e.token,
            topics: dir === 1
              ? [TRANSFER_EVENT_TOPIC, topicForAddress(OWNER), topicForAddress("0x00000000000000000000000000000000000000b2")]
              : [TRANSFER_EVENT_TOPIC, topicForAddress("0x00000000000000000000000000000000000000b2"), topicForAddress(OWNER)],
          }));
      } finally {
        active--;
      }
    },
  };
  return { rpc, calls, maxActive: () => maxActive };
}

const dispatcher = { async run() { throw new Error("unused"); } };
const BASE = 1_000_000;

function discover(rpc: unknown, from: number, to: number, extra: Record<string, unknown> = {}, endpoints = ["https://rpc-a.example"]) {
  return discoverTokensByTransferLogs({
    address: OWNER, endpoints, dispatcher: dispatcher as never, rpc: rpc as never,
    fromBlock: hex(from), toBlock: hex(to), ...extra,
  });
}

/** Les segments d'une direction couvrent exactement [from, to], sans trou ni recouvrement. */
function assertExactCover(calls: Call[], dir: 1 | 2, from: number, to: number) {
  const segs = calls.filter((c) => c.dir === dir).sort((a, b) => a.from - b.from);
  assert.ok(segs.length > 0, "au moins un segment");
  assert.equal(segs[0]!.from, from, "commence à fromBlock");
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i]!.from, segs[i - 1]!.to + 1, `pas de trou ni de doublon au segment ${i}`);
  assert.equal(segs.at(-1)!.to, to, "finit à toBlock inclus");
}

// ── Planification des segments ───────────────────────────────────────────────

test("planLogChunks : 1 000 blocs = 1 segment, 1 001 = 2, 5 000 = 5, bornes inclusives", () => {
  assert.deepEqual(planLogChunks(BASE, BASE + 999, 1000), [[BASE, BASE + 999]]);
  assert.deepEqual(planLogChunks(BASE, BASE + 1000, 1000), [[BASE, BASE + 999], [BASE + 1000, BASE + 1000]]);
  const five = planLogChunks(BASE, BASE + 4999, 1000);
  assert.equal(five.length, 5);
  assert.deepEqual(five.at(-1), [BASE + 4000, BASE + 4999]);
});

test("planLogChunks : un écart multiple exact de la taille couvre aussi le dernier bloc (ancienne faille)", () => {
  // Avant le correctif, la boucle `chunkFrom < toNum` sautait toBlock quand to - from était un multiple de la taille.
  const plan = planLogChunks(0, 2000, 1000);
  assert.deepEqual(plan, [[0, 999], [1000, 1999], [2000, 2000]]);
});

test("négatif : planLogChunks refuse une taille nulle ou une plage inversée", () => {
  assert.deepEqual(planLogChunks(10, 5, 1000), []);
  assert.throws(() => planLogChunks(0, 10, 0));
});

// ── Pagination sur les nœuds bornés à 1 000 blocs ───────────────────────────

test("1 000 blocs : un seul appel par direction, accepté par le nœud", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 999, { maxBlockRange: 1000 });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(r.errors, []);
  assert.equal(r.coverage?.complete, true);
  assert.equal(r.coverage?.completeThrough, BASE + 999);
});

test("1 001 blocs : deux segments par direction, aucun refus", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 1000, { maxBlockRange: 1000 });
  assert.equal(f.calls.length, 4);
  assertExactCover(f.calls, 1, BASE, BASE + 1000);
  assertExactCover(f.calls, 2, BASE, BASE + 1000);
  assert.equal(r.coverage?.complete, true);
});

test("5 000 blocs : couverture fonctionnelle complète, 5 segments contigus par direction", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000 });
  assert.equal(f.calls.length, 10, "5 segments x 2 directions");
  assertExactCover(f.calls, 1, BASE, BASE + 4999);
  assertExactCover(f.calls, 2, BASE, BASE + 4999);
  assert.ok(f.calls.every((c) => c.to - c.from + 1 <= 1000), "aucun segment > 1 000 blocs");
  assert.deepEqual(r.errors, []);
  assert.equal(r.coverage?.complete, true);
  assert.equal(r.coverage?.completeThrough, BASE + 4999);
  assert.equal(r.coverage?.pendingFrom, null);
});

test("un événement dans le segment le plus ancien est découvert", async () => {
  const f = fakeRpc({ maxSpan: 1000, events: [
    { block: BASE + 3, token: TOKEN_OLD, dir: 2 },
    { block: BASE + 4998, token: TOKEN_NEW, dir: 1 },
  ] });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000 });
  assert.deepEqual([...r.contracts].sort(), [TOKEN_OLD, TOKEN_NEW].sort());
});

test("comparaison : sans pagination, le nœud refuse la fenêtre de 5 000 blocs (comportement LIVE)", async () => {
  const f = fakeRpc({ maxSpan: 1000, events: [{ block: BASE + 3, token: TOKEN_OLD, dir: 2 }] });
  const r = await discover(f.rpc, BASE, BASE + 4999);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(r.contracts, []);
  assert.equal(r.errors.length, 2);
  assert.equal(r.coverage, undefined, "aucune couverture déclarée hors pagination");
});

test("comparaison : le plafond seul (1 000 derniers blocs) manque l'événement ancien", async () => {
  const f = fakeRpc({ maxSpan: 1000, events: [{ block: BASE + 3, token: TOKEN_OLD, dir: 2 }] });
  const r = await discover(f.rpc, BASE + 4000, BASE + 4999);
  assert.deepEqual(r.contracts, [], "la troncature silencieuse perd le token");
  assert.deepEqual(r.errors, []);
});

// ── Échecs RPC : PARTIAL explicite, jamais OK ────────────────────────────────

for (const [label, err] of [
  ["HTTP 400", new Error("HTTP 400: request is too complex/large")],
  ["HTTP 429", new Error("HTTP 429: Too Many Requests")],
  ["HTTP 502", new Error("HTTP 502: Bad Gateway")],
  ["timeout", new Error("RPC timeout after 2500ms")],
] as const) {
  test(`${label} sur le 3e segment : couverture PARTIAL, curseur borné au segment 2, erreur explicite`, async () => {
    const failFrom = BASE + 2000;
    const f = fakeRpc({ maxSpan: 1000, events: [{ block: BASE + 10, token: TOKEN_OLD, dir: 1 }],
      failWhen: (c) => (c.from === failFrom ? err : null) });
    const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, chunkConcurrency: 1 });
    assert.equal(r.coverage?.complete, false);
    assert.equal(r.coverage?.completeThrough, BASE + 1999, "dernier bloc couvert sans trou");
    assert.equal(r.coverage?.pendingFrom, failFrom);
    assert.ok(r.errors.some((e) => e.includes(label.replace("HTTP ", "")) || e.includes("timeout")), "erreur RPC conservée");
    assert.ok(r.errors.some((e) => e.startsWith("[logs] PARTIAL")), "marqueur PARTIAL non bénin");
    assert.ok(r.contracts.includes(TOKEN_OLD), "les tokens déjà trouvés sont conservés");
    // Arrêt borné : aucun segment lancé après le groupe en échec.
    assert.ok(f.calls.every((c) => c.from <= failFrom), "aucun segment postérieur lancé après l'échec");
  });
}

test("repli d'endpoint : 429 sur le premier, succès sur le second = segment couvert", async () => {
  const f = fakeRpc({ maxSpan: 1000, failWhen: (c) => (c.endpoint === "https://rpc-a.example" ? new Error("HTTP 429") : null) });
  const r = await discover(f.rpc, BASE, BASE + 1999, { maxBlockRange: 1000 }, ["https://rpc-a.example", "https://rpc-b.example"]);
  assert.equal(r.coverage?.complete, true);
  assert.deepEqual(r.errors, []);
});

test("échec du tout premier segment : completeThrough null, rien de déclaré couvert", async () => {
  const f = fakeRpc({ maxSpan: 1000, failWhen: (c) => (c.from === BASE ? new Error("HTTP 502") : null) });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, chunkConcurrency: 1 });
  assert.equal(r.coverage?.completeThrough, null);
  assert.equal(r.coverage?.pendingFrom, BASE);
  assert.ok(r.errors.some((e) => e.startsWith("[logs] PARTIAL")));
});

test("une seule direction en échec suffit à rendre la couverture PARTIAL (minimum des deux)", async () => {
  const f = fakeRpc({ maxSpan: 1000, failWhen: (c) => (c.dir === 2 && c.from === BASE + 1000 ? new Error("HTTP 429") : null) });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, chunkConcurrency: 1 });
  assert.equal(r.coverage?.complete, false);
  assert.equal(r.coverage?.completeThrough, BASE + 999);
});

// ── Budget, arrêt et reprise ─────────────────────────────────────────────────

test("budget de segments atteint : arrêt, curseur vérifiable, suite reportée", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, maxChunksPerDirection: 2 });
  assert.equal(f.calls.length, 4, "2 segments x 2 directions, pas plus");
  assert.equal(r.coverage?.complete, false);
  assert.equal(r.coverage?.completeThrough, BASE + 1999);
  assert.equal(r.coverage?.pendingFrom, BASE + 2000);
  assert.ok(r.errors.some((e) => e.startsWith("[logs] PARTIAL")));
});

test("arrêt puis reprise : la reprise depuis pendingFrom complète la fenêtre sans trou ni doublon", async () => {
  const events = [
    { block: BASE + 500, token: TOKEN_OLD, dir: 2 as const },
    { block: BASE + 4500, token: TOKEN_NEW, dir: 1 as const },
  ];
  const first = fakeRpc({ maxSpan: 1000, events });
  const r1 = await discover(first.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, maxChunksPerDirection: 2 });
  const resumeFrom = r1.coverage!.pendingFrom!;
  const second = fakeRpc({ maxSpan: 1000, events });
  const r2 = await discover(second.rpc, resumeFrom, BASE + 4999, { maxBlockRange: 1000 });
  assert.equal(r2.coverage?.complete, true);
  const all = [...first.calls, ...second.calls];
  assertExactCover(all, 1, BASE, BASE + 4999);
  assertExactCover(all, 2, BASE, BASE + 4999);
  assert.deepEqual([...new Set([...r1.contracts, ...r2.contracts])].sort(), [TOKEN_OLD, TOKEN_NEW].sort());
});

test("concurrence bornée : jamais plus de chunkConcurrency segments par direction en vol", async () => {
  const f = fakeRpc({ maxSpan: 1000, delayMs: 5 });
  await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, chunkConcurrency: 2 });
  assert.ok(f.maxActive() <= 4, `au plus 2 par direction (vu ${f.maxActive()})`);
});

test("régression : sans pagination, un écart multiple de 10 000 blocs couvre aussi toBlock", async () => {
  const f = fakeRpc({ events: [{ block: BASE + 20_000, token: TOKEN_NEW, dir: 1 }] });
  const r = await discover(f.rpc, BASE, BASE + 20_000);
  assertExactCover(f.calls, 1, BASE, BASE + 20_000);
  assert.deepEqual(r.contracts, [TOKEN_NEW], "le bloc de tête n'est plus sauté");
});

test("négatif : sans pagination, les grandes fenêtres gardent les segments de 10 000 blocs", async () => {
  const f = fakeRpc({});
  await discover(f.rpc, BASE, BASE + 19_999);
  assert.equal(f.calls.length, 4);
  assertExactCover(f.calls, 1, BASE, BASE + 19_999);
});

// ── Coexistence avec RPC.LOG_CHUNK_BLOCKS (taille de découpage par chaîne) ───

test("coexistence : pagination + chunkBlocks plus petit, le plus petit des deux gagne", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 999, { maxBlockRange: 1000, chunkBlocks: 500 });
  assert.equal(f.calls.length, 4, "2 segments de 500 par direction");
  assertExactCover(f.calls, 1, BASE, BASE + 999);
  assert.equal(r.coverage?.chunkSize, 500);
  assert.equal(r.coverage?.complete, true);
});

test("coexistence : pagination + chunkBlocks plus grand, le nœud n'est jamais dépassé", async () => {
  const f = fakeRpc({ maxSpan: 1000 });
  const r = await discover(f.rpc, BASE, BASE + 4999, { maxBlockRange: 1000, chunkBlocks: 1_000_000 });
  assert.equal(f.calls.length, 10, "5 segments de 1 000 par direction");
  assertExactCover(f.calls, 2, BASE, BASE + 4999);
  assert.equal(r.coverage?.complete, true);
  assert.deepEqual(r.errors, []);
});

test("coexistence : sans pagination, chunkBlocks garde le comportement de master (un appel par direction)", async () => {
  const f = fakeRpc({});
  const r = await discover(f.rpc, BASE, BASE + 499_999, { chunkBlocks: 1_000_000 });
  assert.equal(f.calls.length, 2);
  assert.equal(r.coverage, undefined, "pas de couverture hors pagination");
});

// ── Curseur incrémental ──────────────────────────────────────────────────────

const cov = (over: Partial<NonNullable<Awaited<ReturnType<typeof discover>>["coverage"]>>) => ({
  fromBlock: BASE, toBlock: BASE + 4999, chunkSize: 1000, chunksPlanned: 10, chunksAttempted: 10, chunksSucceeded: 10,
  completeThrough: BASE + 4999, complete: true, pendingFrom: null, ...over,
});

test("curseur : chaîne non paginée, comportement inchangé (tête de fenêtre)", () => {
  assert.equal(nextDiscoveryCursor({ paginated: false, currentBlock: BASE + 4999 }), BASE + 4999);
  assert.equal(nextDiscoveryCursor({ paginated: false, currentBlock: 0 }), undefined);
});

test("curseur : couverture complète, avance jusqu'à toBlock", () => {
  assert.equal(nextDiscoveryCursor({ paginated: true, currentBlock: BASE + 4999, coverage: cov({}) }), BASE + 4999);
});

test("curseur : couverture PARTIAL, avance seulement jusqu'au dernier bloc couvert sans trou", () => {
  assert.equal(nextDiscoveryCursor({ paginated: true, currentBlock: BASE + 4999,
    coverage: cov({ complete: false, completeThrough: BASE + 1999, pendingFrom: BASE + 2000 }) }), BASE + 1999);
});

test("négatif : rien de couvert, le curseur n'est pas écrit (l'ancien est conservé)", () => {
  assert.equal(nextDiscoveryCursor({ paginated: true, currentBlock: BASE + 4999, cachedLastBlock: BASE - 10,
    coverage: cov({ complete: false, completeThrough: null, pendingFrom: BASE }) }), undefined);
});

test("négatif : le curseur ne recule jamais", () => {
  assert.equal(nextDiscoveryCursor({ paginated: true, currentBlock: BASE + 4999, cachedLastBlock: BASE + 3000,
    coverage: cov({ complete: false, completeThrough: BASE + 1999, pendingFrom: BASE + 2000 }) }), undefined);
});

test("curseur : chaîne paginée sans parcours de logs (explorateur suffisant), comportement inchangé", () => {
  assert.equal(nextDiscoveryCursor({ paginated: true, currentBlock: BASE + 4999 }), BASE + 4999);
});

// ── Configuration ciblée ─────────────────────────────────────────────────────

test("seules OpenLedger et zkLink Nova sont paginées, en segments de 1 000 blocs", () => {
  assert.deepEqual(resolveLogPagination("OPENLEDGER"), { paginate: true, chunkSize: 1000 });
  assert.deepEqual(resolveLogPagination("ZKLINKNOVA"), { paginate: true, chunkSize: 1000 });
});

test("coexistence : fenêtre des chaînes paginées (plancher MIN_LOG_SCAN_BLOCKS) tenue par le budget de segments", () => {
  for (const key of ["OPENLEDGER", "ZKLINKNOVA"]) {
    const chain = getChain(key);
    assert.ok(chain, key);
    const window = effectiveLogScanWindow(chain as never, undefined);
    const { chunkSize } = resolveLogPagination(key);
    assert.ok(window <= LOG_PAGINATION_MAX_CHUNKS_PER_DIRECTION * chunkSize!, `${key} : ${window} blocs couverts en un scan`);
  }
});

test("négatif : les autres chaînes, bornées ou non, ne changent pas de mode", () => {
  for (const key of ["ETHEREUM", "BASE", "CITREA", "HYPEREVM", "MONAD", "MOONBEAM", "SWAN", "NOT_A_CHAIN"]) {
    assert.equal(resolveLogPagination(key).paginate, false, key);
  }
});
