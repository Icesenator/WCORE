import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { getRpcOverride, parseRpcOverrides, redactRpcEndpoint, validateRpcOverridesAtStartup } from "./rpc-override.js";
import { RpcCallError } from "./types.js";
import { RpcDispatcher } from "./dispatcher.js";
import { canServeEmptyCache, readErc20Balance } from "../engines/evm-balances.js";
import { RpcHealth } from "./health.js";
import { consensusConfigFor } from "./rpc-override.js";
import { getChain } from "../chains/index.js";

const KEYED = "https://acct-name.b3-mainnet.provider-one.test/token-abc123/";
const KEYED_2 = "https://edge.provider-two.test/evm/8333?secret=token-def456";
const ENV = { WCORE_RPC_OVERRIDES: JSON.stringify({ B3: [KEYED, KEYED_2] }) };

test("diagnostic d'un endpoint surchargé : identifiant opaque, ni hôte ni clé", () => {
  assert.equal(redactRpcEndpoint(KEYED, ENV), "override:B3#1");
  assert.equal(redactRpcEndpoint(KEYED_2, ENV), "override:B3#2");
  assert.equal(redactRpcEndpoint("https://public-rpc.example.test/path", ENV), "public-rpc.example.test");
});

test("configuration invalide : le message ne recopie jamais une clé de la variable", () => {
  const raw = JSON.stringify({ [KEYED]: [KEYED_2] });
  const res = parseRpcOverrides(raw);
  assert.deepEqual(res.overrides, {});
  assert.ok(res.error);
  assert.equal(/token-|provider-|https/.test(res.error ?? ""), false, res.error);
});

test("surcharge refusée pour une chaîne inconnue ou non EVM", () => {
  const warnings: string[] = [];
  const env = { WCORE_RPC_OVERRIDES: JSON.stringify({ NOT_A_CHAIN: [KEYED, KEYED_2] }) };
  validateRpcOverridesAtStartup(env, (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
  assert.equal(getRpcOverride("NOT_A_CHAIN", env), undefined);
  assert.equal(consensusConfigFor("NOT_A_CHAIN", undefined, env).strictMinRpcs, false);
});

test("surcharge refusée pour un hôte local, une IP littérale ou des identifiants dans l'URL", () => {
  for (const bad of ["https://127.0.0.1/x", "https://localhost/x", "https://[::1]/x", "https://user:pass@rpc.example.test/x", "https://intranet/x"]) {
    const res = parseRpcOverrides(JSON.stringify({ B3: [bad, KEYED] }));
    assert.deepEqual(res.overrides, {}, bad);
    assert.ok(res.error, bad);
  }
});

test("surcharge refusée si elle ne compte pas deux fournisseurs distincts", () => {
  for (const list of [
    [KEYED],
    [KEYED, "https://other-acct.b3-mainnet.provider-one.test/token-xyz/"],
    ["https://a.same-provider.test/k1", "https://b.same-provider.test/k2"],
  ]) {
    const res = parseRpcOverrides(JSON.stringify({ B3: list }));
    assert.deepEqual(res.overrides, {}, list.join(" "));
    assert.equal(/token-|https/.test(res.error ?? "token-"), false, res.error);
  }
  assert.deepEqual(parseRpcOverrides(ENV.WCORE_RPC_OVERRIDES).overrides, { B3: [KEYED, KEYED_2] });
});

test("quorum strict : un fournisseur écarté par la santé est réintégré plutôt que de voter seul", async () => {
  const health = new RpcHealth();
  health.recordFailure(KEYED_2);
  health.recordFailure(KEYED_2);
  const dispatcher = new RpcDispatcher(health, { minRpcs: 2, maxRpcs: 3, strictMinRpcs: true });
  assert.deepEqual(dispatcher.pickEndpoints([KEYED, KEYED_2]), [KEYED, KEYED_2]);
  const legacy = new RpcDispatcher(health, { minRpcs: 2, maxRpcs: 3 });
  assert.deepEqual(legacy.pickEndpoints([KEYED, KEYED_2]), [KEYED], "comportement historique inchangé");
});

test("quorum strict : le revert d'un seul fournisseur ne marque pas le jeton non-ERC20 pendant 24 h", async () => {
  const health = new RpcHealth();
  health.recordFailure(KEYED_2);
  health.recordFailure(KEYED_2);
  const dispatcher = new RpcDispatcher(health, { minRpcs: 2, maxRpcs: 3, strictMinRpcs: true });
  const rpc = { ethCall: async (endpoint: string) => {
    if (endpoint === KEYED) throw new RpcCallError("execution reverted", endpoint);
    throw new RpcCallError("upstream unavailable", endpoint);
  } } as never;
  const writes: string[] = [];
  const cache = { get: async () => null, set: async (k: string) => { writes.push(k); }, delete: async () => {} } as never;
  const res = await readErc20Balance(dispatcher, rpc, [KEYED, KEYED_2], "0x00000000000000000000000000000000000000b2", "0x00000000000000000000000000000000000000a1", "B3", cache);
  assert.equal(res.skipped, false);
  assert.equal(writes.some((k) => k.startsWith("meta:skip:")), false, writes.join(","));
});

test("RpcCallError : l'endpoint n'apparaît ni à l'inspection ni en JSON", () => {
  const err = new RpcCallError("HTTP 500", KEYED);
  assert.equal(err.endpoint, KEYED);
  assert.equal(inspect(err).includes("token-abc123"), false);
  assert.equal(JSON.stringify(err).includes("token-abc123"), false);
});

test("quorum strict sans cache : un zéro isolé ne permet pas de servir un cache vide", async () => {
  const before = process.env.WCORE_RPC_OVERRIDES;
  process.env.WCORE_RPC_OVERRIDES = ENV.WCORE_RPC_OVERRIDES;
  try {
    const rpc = { getBalance: async (endpoint: string) => {
      if (endpoint === KEYED) return 0n;
      throw new Error("upstream unavailable");
    } } as never;
    const dispatcher = new RpcDispatcher(undefined, consensusConfigFor("B3", getChain("B3")));
    assert.equal(await canServeEmptyCache(dispatcher, rpc, [KEYED, KEYED_2], "0x00000000000000000000000000000000000000a1", "B3", undefined, false), false);
  } finally {
    if (before === undefined) delete process.env.WCORE_RPC_OVERRIDES; else process.env.WCORE_RPC_OVERRIDES = before;
  }
});
