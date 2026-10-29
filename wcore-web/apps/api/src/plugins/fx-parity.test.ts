import { test, type TestContext } from "node:test";
import { cacheKey } from "@wcore/shared";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";
import { chainsPlugin } from "./chains.js";
import { _resetFxCacheForTests, type CacheStore } from "@wcore/core";

const NOW = 1_800_000_000_000;
const TTL = 3_600_000;
function report(runtime = "web", rate = 0.9): any {
  return { runtime, rate, ts: NOW - 100, sources: ["frankfurter"], fxMetadata: {
    version: 1, rate, unit: "EUR_PER_USD", available: true, applied: "UNKNOWN",
    sources: [{ source: "frankfurter", rate, ts: NOW - 1000 }],
    sourceCollectedAt: NOW - 1000, cacheWrittenAt: NOW - 500, ttlMs: TTL,
    selection: "SINGLE", freshness: "FRESH",
  } };
}
async function fixture(t: TestContext) {
  t.mock.method(Date, "now", () => NOW);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network forbidden"); });
  const entries = new Map<string, unknown>();
  const cache: CacheStore = {
    get: async <T>(key: string) => entries.get(key) as T | undefined,
    set: async (key, value) => { entries.set(key, value); },
    delete: async () => {}, clear: async () => {},
    mget: async <T>(keys: string[]) => keys.map(key => entries.get(key) as T | undefined),
    add: async () => true,
  };
  const app = Fastify();
  t.after(() => app.close());
  await app.register(gsheetPlugin, { token: "test-token", cacheStore: { get: async () => null }, cacheWriter: cache });
  return { app, entries, cache };
}

for (const [label, mutate] of Object.entries<(r: any) => void>({
  legacy: r => { delete r.fxMetadata; },
  stale: r => { r.fxMetadata.sourceCollectedAt = NOW - TTL; r.fxMetadata.sources[0].ts = NOW - TTL; },
  "expired cache": r => { r.fxMetadata.cacheWrittenAt = NOW - TTL; },
  "unknown unit": r => { r.fxMetadata.unit = "UNKNOWN"; },
  "inverse unit": r => { r.fxMetadata.unit = "USD_PER_EUR"; },
  "missing provenance": r => { r.fxMetadata.sources = []; },
  "invalid source time": r => { r.fxMetadata.sources[0].ts = null; },
  "future source": r => { r.fxMetadata.sources[0].ts = NOW + 1; },
  "future report": r => { r.ts = NOW + 1; },
  "invalid report": r => { r.ts = 0; },
  "incomparable clock order": r => { r.fxMetadata.cacheWrittenAt = NOW - 2000; },
  "mismatched aggregate time": r => { r.fxMetadata.sourceCollectedAt -= 1; },
  "invalid TTL": r => { r.fxMetadata.ttlMs = 0; },
  "future cache": r => { r.fxMetadata.cacheWrittenAt = NOW + 1; },
  "future aggregate time": r => { r.fxMetadata.sourceCollectedAt = NOW + 1; },
  "missing source name": r => { r.fxMetadata.sources[0].source = ""; },
  "invalid source rate": r => { r.fxMetadata.sources[0].rate = 0; },
  "runtime mismatch": r => { r.runtime = "other"; },
  "unknown freshness": r => { r.fxMetadata.freshness = "UNKNOWN"; },
  "zero rate": r => { r.rate = 0; },
  "nonfinite rate": r => { r.rate = Infinity; },
  "mismatched rate": r => { r.fxMetadata.rate = 0.8; },
})) {
  for (const runtime of ["web", "gsheet"]) test(`parity fails closed: ${runtime} ${label}`, async t => {
    const { app, entries } = await fixture(t);
    const web = report(); const gsheet = report("gsheet");
    mutate(runtime === "web" ? web : gsheet);
    entries.set("fx_telemetry:web", web); entries.set("fx_telemetry:gsheet", gsheet);
    const res = await app.inject("/api/diag/fx-parity");
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().drift, null);
    assert.equal(res.json().ok, false);
  });
}
for (const absent of ["web", "gsheet", "both"]) test(`parity missing ${absent} is not zero drift`, async t => {
  const { app, entries } = await fixture(t);
  if (absent === "gsheet") entries.set("fx_telemetry:web", report());
  if (absent === "web") entries.set("fx_telemetry:gsheet", report("gsheet"));
  const body = (await app.inject("/api/diag/fx-parity")).json();
  assert.equal(body.drift, null); assert.equal(body.ok, false);
});
for (const rate of [0.9, 0.89, 0.8]) test(`attested ingestion retains metadata and compares rate ${rate} at an explicit instant`, async t => {
  const { app, entries } = await fixture(t);
  entries.set("fx_telemetry:web", report());
  const payload = report("gsheet", rate);
  const post = await app.inject({ method: "POST", url: "/api/gsheet/fx-telemetry", headers: { "x-gsheet-token": "test-token" }, payload });
  assert.equal(post.statusCode, 200);
  assert.deepEqual((entries.get("fx_telemetry:gsheet") as any).fxMetadata, payload.fxMetadata);
  const body = (await app.inject("/api/diag/fx-parity")).json();
  const drift = (0.9 - rate) / 0.9;
  assert.equal(body.now, NOW); assert.equal(body.ok, drift <= 0.02);
  assert.equal(body.drift, drift);
});
test("legacy ingestion remains accepted without inventing an observation time", async t => {
  const { app, entries } = await fixture(t);
  entries.set("fx_telemetry:web", report());
  const post = await app.inject({ method: "POST", url: "/api/gsheet/fx-telemetry", headers: { "x-gsheet-token": "test-token" }, payload: { rate: 0.9, sources: ["frankfurter"] } });
  assert.equal(post.statusCode, 200);
  assert.equal((entries.get("fx_telemetry:gsheet") as any).ts, null);
  const body = (await app.inject("/api/diag/fx-parity")).json();
  assert.equal(body.drift, null);
  assert.equal(body.gsheet.rate, 0.9);
  assert.deepEqual(body.gsheet.sources, ["frankfurter"]);
});
test("telemetry projects metadata and source fields before storage and public diagnostics", async t => {
  const { app, entries } = await fixture(t);
  const web = report(); web.privateTop = "secretSentinel";
  web.fxMetadata.privateField = { nested: "secretSentinel" };
  web.fxMetadata.sources[0].privateField = "secretSentinel";
  entries.set("fx_telemetry:web", web);
  const payload = report("gsheet");
  payload.privateTop = "secretSentinel";
  payload.fxMetadata.privateField = { nested: "secretSentinel" };
  payload.fxMetadata.sources[0].privateField = "secretSentinel";
  const post = await app.inject({ method: "POST", url: "/api/gsheet/fx-telemetry", headers: { "x-gsheet-token": "test-token" }, payload });
  assert.equal(post.statusCode, 200);
  assert.equal(JSON.stringify(entries.get("fx_telemetry:gsheet")).includes("secretSentinel"), false);
  const res = await app.inject("/api/diag/fx-parity");
  assert.equal(res.body.includes("secretSentinel"), false);
  assert.equal(res.json().drift, 0);
});
for (const [label, mutate] of Object.entries<(r: any) => void>({
  "excess sources": r => { r.fxMetadata.sources = Array(17).fill(r.fxMetadata.sources[0]); },
  "excess name": r => { r.fxMetadata.sources[0].source = "x".repeat(129); },
  "nested rate": r => { r.fxMetadata.rate = { secretSentinel: "private" }; },
})) test(`malformed metadata projection fails closed: ${label}`, async t => {
  const { app, entries } = await fixture(t);
  entries.set("fx_telemetry:web", report());
  const payload = report("gsheet"); mutate(payload);
  const post = await app.inject({ method: "POST", url: "/api/gsheet/fx-telemetry", headers: { "x-gsheet-token": "test-token" }, payload });
  assert.equal(post.statusCode, 200);
  const res = await app.inject("/api/diag/fx-parity");
  assert.equal(res.json().drift, null);
  assert.equal(res.body.includes("secretSentinel"), false);
});

test("FX public route retains original cache provenance, without fetching or rejuvenating it", async t => {
  const { app, entries, cache } = await fixture(t);
  _resetFxCacheForTests(); t.after(_resetFxCacheForTests);
  const cached = { rate: 0.9, ts: NOW - 500, sources: [{ source: "frankfurter", rate: 0.9, ts: NOW - 1000 }] };
  entries.set(cacheKey("fxEurUsd", {}), cached);
  await app.register(chainsPlugin, { cache, circuitBreakers: new Map() });
  const res = await app.inject("/api/price/fx");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().eurUsd, 0.9);
  const telemetry = entries.get("fx_telemetry:web") as any;
  assert.deepEqual(telemetry.sources, ["frankfurter"]);
  assert.equal(telemetry.fxMetadata.cacheWrittenAt, cached.ts);
  assert.equal(telemetry.fxMetadata.sourceCollectedAt, NOW - 1000);
  assert.equal(telemetry.fxMetadata.ttlMs, TTL);
});
