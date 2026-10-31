import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { RpcCallError } from "./types.js";
import { RpcDispatcher } from "./dispatcher.js";
import { discoverTokensByTransferLogs } from "../tokens/log-discovery.js";
import { parseRpcOverrides, getRpcOverride, validateRpcOverridesAtStartup } from "./rpc-override.js";

test("configuration invalide : aucun repli silencieux vers un quorum historique", () => {
  const env = { WCORE_RPC_OVERRIDES: "private-key invalid JSON" };
  assert.throws(() => getRpcOverride("B3", env), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /private-key/);
    return true;
  });
  assert.throws(() => validateRpcOverridesAtStartup(env, () => {}));
});

const endpoint = "https://secret-account.provider.test/private-key";

test("un message RPC distant ne divulgue pas les secrets qu'il reflète", () => {
  const error = new RpcCallError(`unauthorized private-key at ${endpoint}`, endpoint, { url: endpoint });
  assert.doesNotMatch(inspect(error), /private-key|secret-account/);
  assert.doesNotMatch(JSON.stringify(error), /private-key|secret-account/);
});

test("le code JSON-RPC numérique reste diagnostiquable, sans le texte du fournisseur", () => {
  const error = new RpcCallError("RPC error -32005: limit exceeded for private-key", endpoint);
  assert.equal(error.message, "RPC error -32005");
});

test("la découverte ne retransmet aucun texte d'erreur fournisseur arbitraire", async () => {
  const result = await discoverTokensByTransferLogs({
    address: "0x00000000000000000000000000000000000000a1", endpoints: [endpoint],
    dispatcher: new RpcDispatcher(),
    rpc: { call: async () => { throw new Error(`private-key ${endpoint}`); } } as never,
  });
  assert.ok(result.errors.length > 0);
  assert.doesNotMatch(JSON.stringify(result), /private-key|secret-account/);
});

test("une clé JSON mal placée ne paraît pas dans le diagnostic", () => {
  const result = parseRpcOverrides(JSON.stringify({ SECRET_KEY_ABC123: [endpoint] }));
  assert.ok(result.error);
  assert.doesNotMatch(result.error!, /SECRET_KEY_ABC123/);
});

test("deux comptes chez le même fournisseur ne doublent pas sa voix", () => {
  assert.ok(parseRpcOverrides(JSON.stringify({ B3: [
    "https://a.provider.test/key", "https://b.provider.test/key", "https://other.independent.test/key",
  ] })).error);
});

test("refuse aussi les hôtes privés nommés et fragments", () => {
  for (const url of ["https://rpc.internal/key", "https://rpc.local/key", "https://rpc.test./key", "https://rpc.example.test/#key"]) {
    assert.ok(parseRpcOverrides(JSON.stringify({ B3: [url, "https://other.provider.test/key"] })).error, url);
  }
});
