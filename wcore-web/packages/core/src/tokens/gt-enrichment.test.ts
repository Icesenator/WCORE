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
  const BACKOFF_MS = 200;
  const attemptsPerAddr = new Map<string, number>();
  const restore = withFetch(((url: string | URL | Request) => {
    const m = String(url).match(/tokens\/(0x[0-9a-f]+)\/info/);
    const addr = m ? m[1] : "";
    const n = (attemptsPerAddr.get(addr) ?? 0) + 1;
    attemptsPerAddr.set(addr, n);
    const plan = responsesByAddr.get(addr);
    const next = plan && plan[n - 1] ? plan[n - 1] : plan?.[plan.length - 1]!;
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
