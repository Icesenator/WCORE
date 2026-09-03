// Run: node --import tsx --test packages/core/src/tokens/gt-enrichment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGtVerdicts, gtNetworkForChain } from "./gt-enrichment.js";

function withFetch(impl: typeof fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

function gtInfoPayload(score: number): string {
  return JSON.stringify({ data: { attributes: { gt_score: score, is_honeypot: false } } });
}

test("GT network slugs match the /v2/networks registry (verified 2026-08-27)", () => {
  assert.equal(gtNetworkForChain(1), "eth");
  assert.equal(gtNetworkForChain(56), "bsc");
  assert.equal(gtNetworkForChain(137), "polygon_pos");
  assert.equal(gtNetworkForChain(10), "optimism");
  assert.equal(gtNetworkForChain(42161), "arbitrum");
  assert.equal(gtNetworkForChain(43114), "avax");
  assert.equal(gtNetworkForChain(8453), "base");
  assert.equal(gtNetworkForChain(480), "world-chain");
});

test("unknown chains return undefined so callers stay fail-graceful", () => {
  assert.equal(gtNetworkForChain(999999), undefined);
  assert.equal(gtNetworkForChain(0), undefined);
});

test("fetchGtVerdicts retries 429s and resolves every verdict despite rate limiting", async () => {
  const responsesByAddr = new Map<string, { status: number; body: string }[]>();
  const addrs = Array.from({ length: 12 }, (_, i) => `0x${(i + 1).toString().padStart(40, "0")}`);
  for (const addr of addrs) {
    responsesByAddr.set(addr, [
      { status: 429, body: "" },
      { status: 429, body: "" },
      { status: 200, body: gtInfoPayload(26.3) },
    ]);
  }
  const attemptsPerAddr = new Map<string, number>();
  const restore = withFetch(((url: string | URL | Request) => {
    const m = String(url).match(/tokens\/(0x[0-9a-f]+)\/info/);
    const addr = m ? m[1] : "";
    const n = (attemptsPerAddr.get(addr) ?? 0) + 1;
    attemptsPerAddr.set(addr, n);
    const plan = responsesByAddr.get(addr) ?? [];
    const next = plan[n - 1] ?? plan[plan.length - 1] ?? { status: 500, body: "" };
    return Promise.resolve(new Response(next.body, { status: next.status }));
  }) as typeof fetch);
  try {
    const m = await fetchGtVerdicts(8453, addrs, 200, { maxRetries: 3, backoffBaseMs: 5, backoffMaxMs: 50 });
    assert.equal(m.size, addrs.length);
    for (const addr of addrs) {
      const v = m.get(addr);
      assert.ok(v, `${addr} must have a verdict`);
      assert.equal(v.available, true, `${addr} must be resolved despite initial 429s`);
      assert.equal(v.gtScore, 26.3);
    }
    // Each address was retried until success, not abandoned after one 429.
    for (const addr of addrs) assert.equal(attemptsPerAddr.get(addr), 3, `${addr} retried to success`);
  } finally { restore(); }
}, { timeout: 20000 });

test("fetchGtVerdicts gives up after bounded retries and stays fail-graceful", async () => {
  let calls = 0;
  const restore = withFetch((() => {
    calls += 1;
    return Promise.resolve(new Response("", { status: 429 }));
  }) as typeof fetch);
  try {
    const m = await fetchGtVerdicts(8453, ["0x9999999999999999999999999999999999999999"], 200, { maxRetries: 3, backoffBaseMs: 5, backoffMaxMs: 50 });
    const v = m.get("0x9999999999999999999999999999999999999999");
    assert.ok(v);
    assert.equal(v.available, false, "persistent 429 must degrade to UNAVAILABLE, not hang");
    assert.ok(calls <= 3, `bounded retry budget respected (calls=${calls})`);
  } finally { restore(); }
}, { timeout: 20000 });

test("fetchGtVerdicts respects the cumulative time budget and leaves unprocessed addresses UNAVAILABLE", async () => {
  const served = new Set<string>();
  let index = 0;
  const addrs = Array.from({ length: 8 }, () => `0x${(++index).toString().padStart(40, "0")}`);
  const restore = withFetch(((url: string | URL | Request) => {
    const m = String(url).match(/tokens\/(0x[0-9a-f]+)\/info/);
    const addr = m ? m[1] : "";
    served.add(addr);
    return new Promise((resolve) => {
      setTimeout(() => resolve(new Response(gtInfoPayload(30), { status: 200 })), 300);
    });
  }) as typeof fetch);
  try {
    const BUDGET_MS = 1_000;
    const t0 = Date.now();
    const m = await fetchGtVerdicts(8453, addrs, 200, { maxRetries: 1, timeBudgetMs: BUDGET_MS });
    const elapsed = Date.now() - t0;
    assert.equal(m.size, addrs.length, "every address must have a verdict entry");
    const resolved = addrs.filter((a) => m.get(a)?.available);
    const unresolved = addrs.filter((a) => !m.get(a)?.available);
    assert.ok(resolved.length > 0, "at least one address must resolve within the budget");
    assert.ok(unresolved.length > 0, "budget must cut the sequential queue before the last address");
    assert.ok(elapsed < BUDGET_MS + 2_000, `elapsed=${elapsed}ms must stay near the budget, not scale with queue length`);
    for (const a of unresolved) {
      assert.equal(served.has(a), false, `${a} must not be fetched after the budget expired`);
      assert.equal(m.get(a)?.available, false, `${a} must be UNAVAILABLE`);
    }
  } finally { restore(); }
}, { timeout: 20000 });
