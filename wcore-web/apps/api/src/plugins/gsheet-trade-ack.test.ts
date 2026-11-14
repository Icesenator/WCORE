import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";
import { handleNotify, notifyHeaders, notifyKey } from "./gsheet-notify.js";
import { requiresCsrfOriginCheck } from "../server-helpers.js";
import {
  ackKey, ackToken, buildAckActionHeader, handleTradeAck, handleTradeAckTake, maskAckUrl, rebalanceNotifyKey, type AckCategory, type AckStore,
} from "./gsheet-trade-ack.js";

const TOPIC = "test-topic-abcdef123";
const OCC = "AY1-1794470000000";
const BASE = "https://api.example.test";
const TOKEN = "gsheet-test-token";

function memoryStore(clock: { now: number } = { now: 1_000_000 }, known: (notifyKey: string) => boolean = () => true): AckStore & { rows: Array<{ h: string; c: AckCategory; taken: boolean; at: number }> } {
  const rows: Array<{ h: string; c: AckCategory; taken: boolean; at: number }> = [];
  return {
    rows,
    record: async (key, category, nk) => {
      if (!known(nk)) return "unknown";
      if (rows.some((r) => r.h === key)) return "duplicate";
      rows.push({ h: key, c: category, taken: false, at: clock.now });
      return "recorded";
    },
    take: async () => {
      const cats = new Set<AckCategory>();
      for (const r of rows) {
        if (r.taken || clock.now - r.at > 2 * 60 * 60 * 1000) continue;
        r.taken = true;
        cats.add(r.c);
      }
      return [...cats];
    },
  };
}

const NOW = 1_794_470_000_000;
const EXP = Math.floor((NOW + 6 * 60 * 60 * 1000) / 1000);

function query(category: AckCategory = "crypto", occ = OCC, token?: string, expiry = EXP) {
  return { c: category, o: occ, e: String(expiry), t: token ?? ackToken(TOPIC, category, occ, expiry) };
}

test("the button header is one http action with a per-notification token and no secret", () => {
  const h = buildAckActionHeader(BASE, TOPIC, "crypto", OCC, NOW);
  assert.match(h, /^http, Trade fait, https:\/\/api\.example\.test\/api\/trade-ack\?c=crypto&o=AY1-1794470000000&e=1794491600&t=[0-9a-f]{32}, method=POST, clear=true$/);
  assert.ok(!h.includes(TOPIC));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC, EXP), ackToken(TOPIC, "action", OCC, EXP));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC, EXP), ackToken(TOPIC, "crypto", "AY1-1794470000001", EXP));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC, EXP), ackToken(TOPIC, "crypto", OCC, EXP + 1));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC, EXP), ackKey(TOPIC, "crypto", OCC));
});

test("notification headers carry the button only for a rebalancing event over https", () => {
  const body = { event: "strat_rebalance", category: "crypto", occurrence: OCC } as never;
  assert.ok(notifyHeaders(body, { topic: TOPIC, ackBaseUrl: BASE }).Actions);
  assert.equal(notifyHeaders(body, { topic: TOPIC }).Actions, undefined);
  assert.equal(notifyHeaders(body, { topic: TOPIC, ackBaseUrl: "http://insecure.test" }).Actions, undefined);
  assert.equal(notifyHeaders({ event: "test" } as never, { topic: TOPIC, ackBaseUrl: BASE }).Actions, undefined);
});

test("a rebalancing notification is sent with the Actions header", async () => {
  const calls: Array<{ init: RequestInit }> = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => { calls.push({ init }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const r = await handleNotify(
    { event: "strat_rebalance", category: "crypto", occurrence: OCC },
    { topic: TOPIC, fetchImpl, ackBaseUrl: BASE, admit: async () => ({ admission: "ok" as const }) },
  );
  assert.equal(r.status, 200);
  const headers = calls[0]!.init.headers as Record<string, string>;
  const url = new URL(String(headers.Actions).split(", ")[2]!);
  const expiry = Number(url.searchParams.get("e"));
  assert.ok(expiry * 1000 > Date.now() && expiry * 1000 <= Date.now() + 6 * 60 * 60 * 1000 + 1000);
  assert.equal(url.searchParams.get("t"), ackToken(TOPIC, "crypto", OCC, expiry));
});

test("a valid token records one acknowledgement, the second tap is a duplicate", async () => {
  const store = memoryStore();
  const a = await handleTradeAck(query(), { topic: TOPIC, store }, NOW);
  assert.deepEqual(a, { status: 200, body: { ok: true } });
  const b = await handleTradeAck(query(), { topic: TOPIC, store }, NOW);
  assert.deepEqual(b, { status: 200, body: { ok: true, duplicate: true } });
  assert.equal(store.rows.length, 1);
  assert.ok(!JSON.stringify(store.rows).includes(OCC), "the occurrence is stored hashed");
});

test("a wrong, truncated, swapped or forged token is refused and stores nothing", async () => {
  const store = memoryStore();
  const cases = [
    query("crypto", OCC, "0".repeat(32)),
    query("action", OCC, ackToken(TOPIC, "crypto", OCC, EXP)),
    query("crypto", "AY1-1794470000001", ackToken(TOPIC, "crypto", OCC, EXP)),
    query("crypto", OCC, ackToken("another-topic-xyz1234", "crypto", OCC, EXP)),
    query("crypto", OCC, ackToken(TOPIC, "crypto", OCC, EXP), EXP + 3600),
  ];
  for (const q of cases) assert.equal((await handleTradeAck(q, { topic: TOPIC, store }, NOW)).status, 403);
  for (const q of [{}, { ...query(), extra: "1" }, query("crypto", "bad id"), { ...query(), t: "short" }, { ...query(), c: "other" }, { c: "crypto", o: OCC, t: ackToken(TOPIC, "crypto", OCC, EXP) }]) {
    assert.equal((await handleTradeAck(q, { topic: TOPIC, store }, NOW)).status, 400);
  }
  assert.equal(store.rows.length, 0);
});

test("an expired link is refused for good, even after its stored acknowledgement was purged", async () => {
  const store = memoryStore();
  const late = NOW + 6 * 60 * 60 * 1000 + 2000;
  const r = await handleTradeAck(query(), { topic: TOPIC, store }, late);
  assert.deepEqual(r, { status: 403, body: { ok: false, error: "expired" } });
  assert.equal(store.rows.length, 0);
  const far = EXP + 7 * 24 * 3600;
  assert.equal((await handleTradeAck(query("crypto", OCC, undefined, far), { topic: TOPIC, store }, NOW)).status, 403);
});

test("the tap URL query never reaches the logs", () => {
  assert.equal(maskAckUrl("/api/trade-ack?c=crypto&o=AY1-1794470000000&e=1&t=" + "a".repeat(32)), "[masked]");
  assert.equal(maskAckUrl("/api/health"), "/api/health");
  assert.equal(maskAckUrl("/api/search?q=1"), "/api/search?q=1");
  assert.equal(maskAckUrl("http://localhost/api/search?q=1"), "http://localhost/api/search?q=1");
  assert.equal(maskAckUrl(undefined), "");
  assert.equal(maskAckUrl("/api/trade-ack%25253Ft=secret"), "[masked]");
  assert.equal(maskAckUrl("/api/trade-ack%25%33%46t=secret"), "[masked]");
  assert.equal(maskAckUrl("/api/health%zz"), "[masked]");
  assert.equal(maskAckUrl("/api/trade-ack%3Fc=crypto&t=secret"), "[masked]");
  assert.equal(maskAckUrl("/api/trade-ack%253Ft=secret"), "[masked]");
  assert.equal(maskAckUrl("/api/trade-ack%25253Ft=EXAMPLE_TOKEN?extra=1"), "[masked]");
  assert.equal(maskAckUrl("/api/trade-ack%3F?t=EXAMPLE_TOKEN"), "[masked]");
  for (const variant of ["http://localhost/api/trade-ack", "https://api.example.test:8080/%61pi/trade-%61ck", "/%61pi/trade-ack", "/api/trade-%61ck", "/API/Trade-Ack", "/api//trade-ack", "/api/trade-ack/", "/api/trade-ack%zz", "/api/x/../trade-ack", "/api%2Ftrade-ack", "http://localhost\\api\\trade-ack", "/%2574rade-ack"]) {
    assert.equal(maskAckUrl(variant + "?c=crypto&t=secret"), "[masked]", variant);
  }
  // Not the route, but an odd shape (dot segments, encoded slash or backslash): only the query goes.
  for (const variant of ["/api/./health", "/api/x%5Cy", "http://localhost/api/x%2Fy"]) {
    assert.equal(maskAckUrl(variant + "?c=crypto&t=secret"), variant + "?[masked]", variant);
  }
});

test("the CSRF origin guard does not block the native button (no Origin, no cookie), other POSTs stay guarded", () => {
  assert.equal(requiresCsrfOriginCheck("POST", "/api/trade-ack?c=crypto&o=x"), false);
  assert.equal(requiresCsrfOriginCheck("POST", "/api/trade-%61ck?c=crypto"), false);
  assert.equal(requiresCsrfOriginCheck("POST", "/api/trade-ack-other"), true);
  assert.equal(requiresCsrfOriginCheck("POST", "/api/trade-ack/extra"), true);
  assert.equal(requiresCsrfOriginCheck("POST", "/api/auth/logout"), true);
});

test("the ack notification key is the one of the sent rebalancing notification", () => {
  for (const category of ["crypto", "action"] as const) {
    assert.equal(rebalanceNotifyKey(TOPIC, category, OCC), notifyKey({ event: "strat_rebalance", category, occurrence: OCC } as never, TOPIC));
  }
});

test("a valid token for a notification that was never sent is refused and stores nothing", async () => {
  const sent = new Set([rebalanceNotifyKey(TOPIC, "crypto", OCC)]);
  const store = memoryStore({ now: 1_000_000 }, (k) => sent.has(k));
  assert.equal((await handleTradeAck(query("crypto"), { topic: TOPIC, store }, NOW)).status, 200);
  const forged = query("crypto", "AY1-1794470099999");
  assert.deepEqual(await handleTradeAck(forged, { topic: TOPIC, store }, NOW), { status: 403, body: { ok: false, error: "forbidden" } });
  assert.deepEqual(await handleTradeAck(query("action", OCC), { topic: TOPIC, store }, NOW), { status: 403, body: { ok: false, error: "forbidden" } });
  assert.equal(store.rows.length, 1);
});

test("a storage failure answers 503", async () => {
  const store: AckStore = { record: async () => "unavailable", take: async () => null };
  assert.equal((await handleTradeAck(query(), { topic: TOPIC, store }, NOW)).status, 503);
  assert.equal((await handleTradeAckTake(store)).status, 503);
});

test("the workbook takes each acknowledgement once, and not after two hours", async () => {
  const clock = { now: 1_000_000 };
  const store = memoryStore(clock);
  await handleTradeAck(query("crypto"), { topic: TOPIC, store }, NOW);
  await handleTradeAck(query("action", "BE1-1794470000000"), { topic: TOPIC, store }, NOW);
  const first = await handleTradeAckTake(store);
  assert.deepEqual(first.status === 200 ? first.body.categories.sort() : null, ["action", "crypto"]);
  const second = await handleTradeAckTake(store);
  assert.deepEqual(second.status === 200 ? second.body.categories : null, []);

  await handleTradeAck(query("crypto", "AY1-1794470009999"), { topic: TOPIC, store }, NOW);
  clock.now += 2 * 60 * 60 * 1000 + 1;
  const late = await handleTradeAckTake(store);
  assert.deepEqual(late.status === 200 ? late.body.categories : null, [], "an old acknowledgement is not replayed");
});

test("routes: the tap needs no workbook token, the take needs it, both are off without a store", async () => {
  const store = memoryStore();
  const app = Fastify();
  await app.register(gsheetPlugin, { token: TOKEN, ack: { topic: TOPIC, store } } as never);
  const liveExp = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
  const q = new URLSearchParams(query("crypto", OCC, undefined, liveExp) as Record<string, string>).toString();

  const tap = await app.inject({ method: "POST", url: "/api/trade-ack?" + q });
  assert.equal(tap.statusCode, 200);

  const noToken = await app.inject({ method: "POST", url: "/api/gsheet/trade-ack/take" });
  assert.equal(noToken.statusCode, 401);
  const take = await app.inject({ method: "POST", url: "/api/gsheet/trade-ack/take", headers: { "x-gsheet-token": TOKEN } });
  assert.equal(take.statusCode, 200);
  assert.deepEqual(take.json(), { ok: true, categories: ["crypto"] });
  const again = await app.inject({ method: "POST", url: "/api/gsheet/trade-ack/take", headers: { "x-gsheet-token": TOKEN } });
  assert.deepEqual(again.json(), { ok: true, categories: [] });
  await app.close();

  const off = Fastify();
  await off.register(gsheetPlugin, { token: TOKEN } as never);
  assert.equal((await off.inject({ method: "POST", url: "/api/trade-ack?" + q })).statusCode, 503);
  assert.equal((await off.inject({ method: "POST", url: "/api/gsheet/trade-ack/take", headers: { "x-gsheet-token": TOKEN } })).statusCode, 503);
  await off.close();
});
