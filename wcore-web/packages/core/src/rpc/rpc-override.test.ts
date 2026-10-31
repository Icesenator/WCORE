import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRpcOverrides, consensusConfigFor, redactRpcEndpoint } from "./rpc-override.js";
import { getStaticRpcEndpoints } from "./endpoints.js";
import { RpcDispatcher } from "./dispatcher.js";
import { RpcHealth } from "./health.js";
import { getChain } from "../chains/index.js";

const A = "https://a.example-provider-one.test/key-aaa";
const B = "https://b.example-provider-two.test/?secret=key-bbb";

test("override : JSON valide par clé de chaîne, https uniquement", () => {
  const r = parseRpcOverrides(JSON.stringify({ b3: [A, B] }));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.overrides, { B3: [A, B] });
});

test("override invalide : refus complet, jamais de remplacement partiel", () => {
  for (const raw of [
    "{not json",
    JSON.stringify([A]),
    JSON.stringify({ B3: A }),
    JSON.stringify({ B3: ["http://plain.example.test"] }),
    JSON.stringify({ B3: [] }),
    JSON.stringify({ B3: [A, A] }),
    JSON.stringify({ B3: [A, B, A + "1", A + "2", A + "3", A + "4"] }),
    JSON.stringify({ B3: ["https://bad host.test"] }),
  ]) {
    const r = parseRpcOverrides(raw);
    assert.deepEqual(r.overrides, {}, raw);
    assert.equal(typeof r.error, "string", raw);
    assert.equal(r.error!.includes("key-"), false, "le message d'erreur ne contient jamais l'URL");
  }
});

test("override absent : configuration statique inchangée", () => {
  assert.deepEqual(parseRpcOverrides(undefined), { overrides: {} });
  assert.deepEqual(parseRpcOverrides("  "), { overrides: {} });
});

test("override actif : remplace les endpoints statiques de la chaîne, et seulement d'elle", () => {
  const before = getStaticRpcEndpoints("B3");
  assert.ok(before.every((e) => e.includes("wcore-rpc-relay")), "B3 utilise par défaut les relais thirdweb");
  const env = { WCORE_RPC_OVERRIDES: JSON.stringify({ B3: [A, B] }) };
  assert.deepEqual(getStaticRpcEndpoints("B3", env), [A, B]);
  assert.deepEqual(getStaticRpcEndpoints("BASE", env), getStaticRpcEndpoints("BASE"));
});

test("override actif : quorum strict, au moins deux voix, jamais réduit par le filtre de santé", () => {
  const chain = getChain("B3")!;
  const cfg = consensusConfigFor("B3", chain, { WCORE_RPC_OVERRIDES: JSON.stringify({ B3: [A, B] }) });
  assert.equal(cfg.strictMinRpcs, true);
  assert.ok(cfg.minRpcs >= 2);
  const def = consensusConfigFor("B3", chain, {});
  assert.equal(def.strictMinRpcs, false, "comportement historique conservé sans override");
});

test("libellé d'endpoint : ni chemin, ni requête, ni clé", () => {
  assert.equal(redactRpcEndpoint(A), "rpc-provider");
  assert.equal(redactRpcEndpoint(B), "rpc-provider");
  assert.equal(redactRpcEndpoint("not a url"), "invalid-endpoint");
});

function blockedHealth(blocked: string[]): RpcHealth {
  const h = new RpcHealth();
  for (const ep of blocked) { h.recordFailure(ep); h.recordFailure(ep); }
  return h;
}

test("quorum strict : une seule voix saine restante ne fait pas consensus", async () => {
  const strict = new RpcDispatcher(blockedHealth([B]), { minRpcs: 2, maxRpcs: 3, strictMinRpcs: true });
  const r = await strict.run([A, B], async (ep) => { if (ep === B) throw new Error("down"); return "0x10"; });
  assert.equal(r.attempts.length, 2, "le fournisseur écarté est réinterrogé");
  assert.equal(r.consensus, false);
  assert.equal(r.value, null);
  const legacy = new RpcDispatcher(blockedHealth([B]), { minRpcs: 2, maxRpcs: 3 });
  assert.equal((await legacy.run([A, B], async () => "0x10")).consensus, true, "comportement historique documenté");
});

test("solde natif sous quorum strict : une voix seule ne remplace pas le cache, aucun faux zéro", async () => {
  const { readNativeBalance } = await import("../engines/evm-balances.js");
  const store = new Map<string, unknown>([["native:b3:0x00000000000000000000000000000000000000a1", { balance: "5000", ts: Date.now() - 7 * 3600_000, source: "rpc", confidence: 0.9 }]]);
  const cache = { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); } } as never;
  const strict = new RpcDispatcher(blockedHealth([B]), { minRpcs: 2, maxRpcs: 3, strictMinRpcs: true });
  const rpc = { getBalance: async (ep: string) => { if (ep === B) throw new Error("down"); return 0n; } } as never;
  const decision = await readNativeBalance(strict, rpc, [A, B], "0x00000000000000000000000000000000000000a1", "B3", cache);
  assert.notEqual(decision.source, "rpc", "une voix isolée n'est pas une source rpc fiable");
  assert.equal(decision.degraded, true);
  assert.equal(decision.raw, 5000n, "le cache est conservé, pas de zéro inventé");
  assert.deepEqual(store.get("native:b3:0x00000000000000000000000000000000000000a1"), { balance: "5000", ts: (store.get("native:b3:0x00000000000000000000000000000000000000a1") as { ts: number }).ts, source: "rpc", confidence: 0.9 }, "le cache n'est pas réécrit");
});

test("quorum strict : deux voix concordantes, oui ; une erreur ou un désaccord, non", async () => {
  const d = () => new RpcDispatcher(new RpcHealth(), { minRpcs: 2, maxRpcs: 3, strictMinRpcs: true });
  assert.equal((await d().run([A, B], async () => "0x10")).consensus, true);
  assert.equal((await d().run([A, B], async (ep) => { if (ep === B) throw new Error("down"); return "0x10"; })).consensus, false);
  assert.equal((await d().run([A, B], async (ep) => (ep === A ? "0x10" : "0x11"))).consensus, false);
  assert.equal((await d().run([A, B], async () => { throw new Error("down"); })).consensus, false);
});
