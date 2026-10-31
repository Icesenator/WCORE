import { test } from "node:test";
import assert from "node:assert/strict";
import { getWalletAssets } from "../index.js";

let run = 0;
let A = "";
let B = "";
function freshEndpoints() {
  run += 1;
  A = `https://acct.b3.provider-alpha.test/key-a-${run}`;
  B = `https://edge.provider-beta.test/evm/8333?secret=key-b-${run}`;
}
const WALLET = "0x00000000000000000000000000000000000000a1";
const ONE_ETH = "0xde0b6b3a7640000";

type Answer = (method: string) => unknown;

function stubFetch(byEndpoint: Record<string, Answer | "down">) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const plan = byEndpoint[url];
    if (!plan) return new Response("{}", { status: 404 });
    if (plan === "down") throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body ?? "{}"));
    const one = (req: { id: number; method: string }) => {
      const result = plan(req.method);
      return result instanceof Error
        ? { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: result.message } }
        : { jsonrpc: "2.0", id: req.id, result };
    };
    return Response.json(Array.isArray(body) ? body.map(one) : one(body));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function healthy(balance: string): Answer {
  return (method) => {
    if (method === "eth_chainId") return "0x208d";
    if (method === "eth_blockNumber") return "0x100";
    if (method === "eth_getBalance") return balance;
    if (method === "eth_getLogs") return [];
    return new Error("unsupported");
  };
}

async function scanB3(plan: () => Record<string, Answer | "down">, override: boolean) {
  freshEndpoints();
  const byEndpoint = plan();
  const before = process.env.WCORE_RPC_OVERRIDES;
  if (override) process.env.WCORE_RPC_OVERRIDES = JSON.stringify({ B3: [A, B] });
  else delete process.env.WCORE_RPC_OVERRIDES;
  const restore = stubFetch(byEndpoint);
  try {
    return await getWalletAssets(WALLET, "B3", { fxRate: 0.9, forceRefresh: true, strictTokens: true }) as {
      native?: { balance?: number }; errors?: string[];
    };
  } finally {
    restore();
    if (before === undefined) delete process.env.WCORE_RPC_OVERRIDES; else process.env.WCORE_RPC_OVERRIDES = before;
  }
}

const degraded = (r: { errors?: string[] }) => (r.errors ?? []).some((e) => /DEGRADED|unavailable|no chain-verified/i.test(e));

test("B3 sans fournisseur fonctionnel : dégradé, jamais un solde attesté", async () => {
  const r = await scanB3(() => ({}), false).catch((e: Error) => ({ errors: [e.message] }));
  assert.ok(degraded(r), JSON.stringify(r.errors));
});

test("B3, un seul fournisseur : dégradé, aucun solde présenté comme frais", async () => {
  const r = await scanB3(() => ({ [A]: healthy(ONE_ETH), [B]: "down" }), true);
  assert.ok(degraded(r), JSON.stringify(r.errors));
  assert.notEqual(r.native?.balance, 1, "une voix isolée ne fixe pas le solde");
});

test("B3, deux fournisseurs concordants : solde attesté", async () => {
  const r = await scanB3(() => ({ [A]: healthy(ONE_ETH), [B]: healthy(ONE_ETH) }), true);
  assert.equal(r.native?.balance, 1);
  assert.equal((r.errors ?? []).some((e) => /DEGRADED.*balance/i.test(e)), false, JSON.stringify(r.errors));
});

test("B3, réponses divergentes : dégradé, aucun des deux soldes retenu", async () => {
  const r = await scanB3(() => ({ [A]: healthy(ONE_ETH), [B]: healthy("0x0") }), true);
  assert.ok(degraded(r), JSON.stringify(r.errors));
  assert.notEqual(r.native?.balance, 1);
});

test("B3 : aucune URL ni clé de fournisseur dans le résultat", async () => {
  const r = await scanB3(() => ({ [A]: healthy(ONE_ETH), [B]: "down" }), true);
  assert.doesNotMatch(JSON.stringify(r), /key-a|key-b|provider-alpha|provider-beta/);
});
