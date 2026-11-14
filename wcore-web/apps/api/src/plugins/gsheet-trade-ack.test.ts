import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";
import { handleNotify, notifyHeaders } from "./gsheet-notify.js";
import {
  ackKey, ackToken, buildAckActionHeader, handleTradeAck, handleTradeAckTake, type AckCategory, type AckStore,
} from "./gsheet-trade-ack.js";

const TOPIC = "test-topic-abcdef123";
const OCC = "AY1-1794470000000";
const BASE = "https://api.example.test";
const TOKEN = "gsheet-test-token";

function memoryStore(clock: { now: number } = { now: 1_000_000 }): AckStore & { rows: Array<{ h: string; c: AckCategory; taken: boolean; at: number }> } {
  const rows: Array<{ h: string; c: AckCategory; taken: boolean; at: number }> = [];
  return {
    rows,
    record: async (key, category) => {
      if (rows.some((r) => r.h === key)) return "duplicate";
      rows.push({ h: key, c: category, taken: false, at: clock.now });
      return "recorded";
    },
    take: async () => {
      const cats = new Set<AckCategory>();
      for (const r of rows) {
        if (r.taken || clock.now - r.at > 6 * 60 * 60 * 1000) continue;
        r.taken = true;
        cats.add(r.c);
      }
      return [...cats];
    },
  };
}

function query(category: AckCategory = "crypto", occ = OCC, token?: string) {
  return { c: category, o: occ, t: token ?? ackToken(TOPIC, category, occ) };
}

test("the button header is one http action with a per-notification token and no secret", () => {
  const h = buildAckActionHeader(BASE, TOPIC, "crypto", OCC);
  assert.match(h, /^http, Trade fait, https:\/\/api\.example\.test\/api\/trade-ack\?c=crypto&o=AY1-1794470000000&t=[0-9a-f]{32}, method=POST, clear=true$/);
  assert.ok(!h.includes(TOPIC));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC), ackToken(TOPIC, "action", OCC));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC), ackToken(TOPIC, "crypto", "AY1-1794470000001"));
  assert.notEqual(ackToken(TOPIC, "crypto", OCC), ackKey(TOPIC, "crypto", OCC));
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
  assert.equal(headers.Actions, buildAckActionHeader(BASE, TOPIC, "crypto", OCC));
});

test("a valid token records one acknowledgement, the second tap is a duplicate", async () => {
  const store = memoryStore();
  const a = await handleTradeAck(query(), { topic: TOPIC, store });
  assert.deepEqual(a, { status: 200, body: { ok: true } });
  const b = await handleTradeAck(query(), { topic: TOPIC, store });
  assert.deepEqual(b, { status: 200, body: { ok: true, duplicate: true } });
  assert.equal(store.rows.length, 1);
  assert.ok(!JSON.stringify(store.rows).includes(OCC), "the occurrence is stored hashed");
});

test("a wrong, truncated, swapped or forged token is refused and stores nothing", async () => {
  const store = memoryStore();
  const cases = [
    query("crypto", OCC, "0".repeat(32)),
    query("action", OCC, ackToken(TOPIC, "crypto", OCC)),
    query("crypto", "AY1-1794470000001", ackToken(TOPIC, "crypto", OCC)),
    query("crypto", OCC, ackToken("another-topic-xyz1234", "crypto", OCC)),
  ];
  for (const q of cases) assert.equal((await handleTradeAck(q, { topic: TOPIC, store })).status, 403);
  for (const q of [{}, { ...query(), extra: "1" }, query("crypto", "bad id"), { ...query(), t: "short" }, { ...query(), c: "other" }]) {
    assert.equal((await handleTradeAck(q, { topic: TOPIC, store })).status, 400);
  }
  assert.equal(store.rows.length, 0);
});

test("a storage failure answers 503", async () => {
  const store: AckStore = { record: async () => "unavailable", take: async () => null };
  assert.equal((await handleTradeAck(query(), { topic: TOPIC, store })).status, 503);
  assert.equal((await handleTradeAckTake(store)).status, 503);
});

test("the workbook takes each acknowledgement once, and not after six hours", async () => {
  const clock = { now: 1_000_000 };
  const store = memoryStore(clock);
  await handleTradeAck(query("crypto"), { topic: TOPIC, store });
  await handleTradeAck(query("action", "BE1-1794470000000"), { topic: TOPIC, store });
  const first = await handleTradeAckTake(store);
  assert.deepEqual(first.status === 200 ? first.body.categories.sort() : null, ["action", "crypto"]);
  const second = await handleTradeAckTake(store);
  assert.deepEqual(second.status === 200 ? second.body.categories : null, []);

  await handleTradeAck(query("crypto", "AY1-1794470009999"), { topic: TOPIC, store });
  clock.now += 6 * 60 * 60 * 1000 + 1;
  const late = await handleTradeAckTake(store);
  assert.deepEqual(late.status === 200 ? late.body.categories : null, [], "an old acknowledgement is not replayed");
});

test("routes: the tap needs no workbook token, the take needs it, both are off without a store", async () => {
  const store = memoryStore();
  const app = Fastify();
  await app.register(gsheetPlugin, { token: TOKEN, ack: { topic: TOPIC, store } } as never);
  const q = new URLSearchParams(query() as Record<string, string>).toString();

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
