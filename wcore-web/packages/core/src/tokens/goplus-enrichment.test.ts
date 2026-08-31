import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGoPlusVerdicts, parseGoPlusResponse } from "./goplus-enrichment.js";

const SAMPLE = {
  code: 1, message: "OK",
  result: {
    "0xaaa0000000000000000000000000000000000001": {
      is_honeypot: "1", can_take_back_ownership: "0", is_blacklisted: "1",
      slippage_modifiable: "0", owner_percent: "62", is_open_source: "0", is_in_dex: "1",
    },
  },
};

function withFetch(impl: typeof fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

test("parseGoPlusResponse maps string booleans and percentages", () => {
  const m = parseGoPlusResponse(SAMPLE);
  const v = m.get("0xaaa0000000000000000000000000000000000001");
  assert.ok(v);
  assert.equal(v.available, true);
  assert.equal(v.isHoneypot, true);
  assert.equal(v.isBlacklisted, true);
  assert.equal(v.canTakeBackOwnership, false);
  assert.equal(v.ownerPercent, 62);
});

test("parseGoPlusResponse missing contract -> no entry (fetch layer fills UNAVAILABLE)", () => {
  const m = parseGoPlusResponse({ code: 1, message: "OK", result: {} });
  assert.equal(m.has("0xaaa0000000000000000000000000000000000001"), false);
});

test("fetchGoPlusVerdicts batches <=30 addresses per call", async () => {
  let calls = 0;
  const restore = withFetch((() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify(SAMPLE), { status: 200 }));
  }) as typeof fetch);
  try {
    const addrs = Array.from({ length: 35 }, (_, i) => `0x${String(i).padStart(40, "0")}`);
    const m = await fetchGoPlusVerdicts(1, addrs);
    assert.equal(calls, 2); // 30 + 5
    assert.equal(m.size >= 35, true);
  } finally { restore(); }
});

test("fetchGoPlusVerdicts falls back to api.gopluslabs.io when .com fails", async () => {
  const urls: string[] = [];
  const restore = withFetch(((url: string | URL | Request) => {
    urls.push(String(url));
    if (String(url).includes("api.gopluslabs.com")) return Promise.reject(new Error("TLS failed"));
    return Promise.resolve(new Response(JSON.stringify(SAMPLE), { status: 200 }));
  }) as typeof fetch);
  try {
    const addr = "0xaaa0000000000000000000000000000000000001";
    const m = await fetchGoPlusVerdicts(480, [addr]);
    assert.equal(m.get(addr)?.isHoneypot, true);
    assert.equal(urls.length, 2);
    assert.match(urls[1] ?? "", /api\.gopluslabs\.io/);
  } finally { restore(); }
});

test("fetchGoPlusVerdicts tolerates network failure (fail-graceful)", async () => {
  const restore = withFetch((() => Promise.reject(new Error("SSL/TLS dead"))) as typeof fetch);
  try {
    const m = await fetchGoPlusVerdicts(1, ["0xabc0000000000000000000000000000000000001"]);
    assert.equal(m.get("0xabc0000000000000000000000000000000000001")?.available, false);
  } finally { restore(); }
});

test("fetchGoPlusVerdicts times out (AbortController)", async () => {
  const restore = withFetch((_url: any, init?: any) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }) as typeof fetch);
  try {
    const m = await fetchGoPlusVerdicts(1, ["0xabc0000000000000000000000000000000000001"], { timeoutMs: 50 });
    assert.equal(m.get("0xabc0000000000000000000000000000000000001")?.available, false);
  } finally { restore(); }
});
