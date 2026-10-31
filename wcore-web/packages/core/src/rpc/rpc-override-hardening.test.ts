import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverTokensByTransferLogs } from "../tokens/log-discovery.js";
import { getRpcEndpoints, refreshDynamicRpcEndpoints } from "./endpoints.js";
import { RpcDispatcher } from "./dispatcher.js";
import { validateRpcOverridesAtStartup } from "./rpc-override.js";

const KEYED = "https://keyed.example-provider.test/v2/secret-key-123";
const KEYED_2 = "https://other.second-provider.test/?apikey=secret-key-456";

test("découverte de logs : l'erreur remontée ne contient ni chemin ni clé de l'endpoint", async () => {
  const rpc = { call: async () => { throw new Error("upstream unavailable"); } } as never;
  const res = await discoverTokensByTransferLogs({
    address: "0x00000000000000000000000000000000000000a1",
    endpoints: [KEYED, KEYED_2],
    dispatcher: new RpcDispatcher(),
    rpc,
    fromBlock: "0x1",
    toBlock: "0x10",
  });
  assert.ok(res.errors.length > 0, "l'échec reste signalé");
  for (const e of res.errors) {
    assert.equal(/secret-key|\/v2\/|apikey/.test(e), false, e);
  }
  assert.ok(res.errors.every((e) => e.startsWith("rpc-provider:")), "aucun hôte ne divulgue un compte");
});

test("surcharge active : le cache dynamique Chainlist ne réintroduit pas d'autres endpoints", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("chainid.network")) return new Response(JSON.stringify([{ chainId: 8333, rpc: ["https://dynamic.example.test"] }]), { status: 200 });
    if (init?.method === "POST") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x208d" }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const before = process.env.WCORE_RPC_OVERRIDES;
  try {
    assert.deepEqual(await refreshDynamicRpcEndpoints("B3"), ["https://dynamic.example.test"]);
    assert.ok(getRpcEndpoints("B3", { useHealth: false }).includes("https://dynamic.example.test"), "sans surcharge, le dynamique est fusionné");
    process.env.WCORE_RPC_OVERRIDES = JSON.stringify({ B3: [KEYED, KEYED_2] });
    assert.deepEqual(getRpcEndpoints("B3", { useHealth: false }), [KEYED, KEYED_2]);
  } finally {
    globalThis.fetch = original;
    if (before === undefined) delete process.env.WCORE_RPC_OVERRIDES; else process.env.WCORE_RPC_OVERRIDES = before;
  }
});

test("validation au démarrage : surcharge invalide signalée sans URL, valide sans message", () => {
  const warnings: string[] = [];
  assert.throws(() => validateRpcOverridesAtStartup({ WCORE_RPC_OVERRIDES: JSON.stringify({ B3: ["http://plain.test/secret-key-789"] }) }, (m) => warnings.push(m)));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes("secret-key"), false);
  const ok: string[] = [];
  validateRpcOverridesAtStartup({ WCORE_RPC_OVERRIDES: JSON.stringify({ B3: [KEYED, KEYED_2] }) }, (m) => ok.push(m));
  validateRpcOverridesAtStartup({}, (m) => ok.push(m));
  assert.deepEqual(ok, []);
});
