import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";
import { composeNotifyText, handleNotify, notifyKey, type NotifyReservation } from "./gsheet-notify.js";

const TOPIC = "test-topic-abcdef123";
const BODY = {
  event: "strat_rebalance", category: "crypto", occurrence: "AY1-1794470000000",
  sell: { symbol: "SOMI", eur: 21 }, buy: { symbol: "ETH", eur: 1235 },
};

function deps(opts: { admission?: NotifyReservation["admission"]; status?: number; throws?: boolean } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const keys: string[] = [];
  let released = 0;
  let sent = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (opts.throws) throw new Error("timeout");
    return new Response("{}", { status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
  return {
    calls,
    keys,
    released: () => released,
    sent: () => sent,
    deps: {
      topic: TOPIC,
      fetchImpl,
      admit: async (key: string) => {
        keys.push(key);
        return { admission: opts.admission ?? "ok", release: async () => { released++; }, markSent: async () => { sent++; } };
      },
    },
  };
}

test("the server composes the text from validated fields only", () => {
  assert.equal(composeNotifyText(BODY as never), "WCORE : rééquilibrage Crypto à faire : alléger SOMI de 21 €, renforcer ETH de 1 235 €.");
  assert.equal(composeNotifyText({ event: "strat_rebalance", category: "action", occurrence: "BE1-123456789" } as never), "WCORE : rééquilibrage Action à faire.");
  assert.equal(composeNotifyText({ event: "test" } as never), "WCORE : essai depuis le classeur, rien à faire.");
});

test("a valid event is sent to the fixed ntfy URL with fixed headers", async () => {
  const d = deps();
  const r = await handleNotify(BODY, d.deps);
  assert.equal(r.status, 200);
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0]!.url, "https://ntfy.sh/" + TOPIC);
  assert.equal(d.calls[0]!.init.body, composeNotifyText(BODY as never));
  assert.equal(d.calls[0]!.init.redirect, "error");
  assert.deepEqual(d.calls[0]!.init.headers, { Title: "WCORE", Priority: "high", Tags: "warning" });
  assert.equal(d.sent(), 1);
});

test("free text, extra fields, bad symbols or occurrences, decimals, unknown events are refused", async () => {
  const bad = [
    { ...BODY, text: "hello" },
    { ...BODY, event: "anything" },
    { ...BODY, category: "bonds" },
    { ...BODY, occurrence: undefined },
    { ...BODY, occurrence: "short" },
    { ...BODY, occurrence: "AY1 1794470000000/../x" },
    { ...BODY, sell: { symbol: "https://x", eur: 1 } },
    { ...BODY, sell: { symbol: "SOMI", eur: 1.5 } },
    { ...BODY, sell: { symbol: "SOMI", eur: 1, topic: "x" } },
    { ...BODY, buy: { symbol: "ETH", eur: -3 } },
    { event: "test", category: "crypto" },
    "WCORE : texte libre",
    null,
  ];
  for (const b of bad) {
    const d = deps();
    const r = await handleNotify(b, d.deps);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(d.calls.length, 0);
  }
});

test("the dedup key follows the occurrence, not the amounts, and reveals nothing", () => {
  const k1 = notifyKey(BODY as never, TOPIC);
  const k2 = notifyKey({ ...BODY, sell: { symbol: "SOMI", eur: 22 } } as never, TOPIC);
  const k3 = notifyKey({ ...BODY, occurrence: "AY1-1794470999999" } as never, TOPIC);
  assert.equal(k1, k2, "same occurrence, moved amounts: same key");
  assert.notEqual(k1, k3, "new transition: new key");
  assert.notEqual(notifyKey(BODY as never, "other-topic-1234"), k1, "keyed by a server secret");
  assert.match(k1, /^[0-9a-f]{32}$/);
  assert.notEqual(notifyKey({ event: "test" } as never, TOPIC), notifyKey({ event: "test" } as never, TOPIC), "tests never dedupe");
});

test("daily cap: 429; duplicate: 200 without send; pending: 409; admission down: 503", async () => {
  for (const [admission, status] of [["cap", 429], ["duplicate", 200], ["pending", 409], ["unavailable", 503]] as const) {
    const d = deps({ admission });
    const r = await handleNotify(BODY, d.deps);
    assert.equal(r.status, status, admission);
    assert.equal(d.calls.length, 0);
  }
});

test("429/408 from ntfy free the reservation; other refusals and 5xx keep it; a timeout keeps it", async () => {
  for (const [status, freed] of [[429, 1], [408, 1], [400, 0], [403, 0], [413, 0], [500, 0], [504, 0]] as const) {
    const d = deps({ status });
    assert.equal((await handleNotify(BODY, d.deps)).status, 502, String(status));
    assert.equal(d.released(), freed, String(status));
    assert.equal(d.sent(), 0);
  }
  const lost = deps({ throws: true });
  assert.equal((await handleNotify(BODY, lost.deps)).status, 502);
  assert.equal(lost.released(), 0);
});

test("a bad topic disables the relay", async () => {
  const d = deps();
  const r = await handleNotify(BODY, { ...d.deps, topic: "bad topic/x" });
  assert.equal(r.status, 503);
  assert.equal(d.calls.length, 0);
});

test("the route needs the GSheet token, and answers 503 when the relay is off", async () => {
  const d = deps();
  const app = Fastify();
  await app.register(gsheetPlugin, { token: "tok", cacheStore: { get: async () => null }, notify: d.deps });
  const noTok = await app.inject({ method: "POST", url: "/api/gsheet/notify", payload: BODY });
  assert.equal(noTok.statusCode, 401);
  const badTok = await app.inject({ method: "POST", url: "/api/gsheet/notify", headers: { "x-gsheet-token": "nope" }, payload: BODY });
  assert.equal(badTok.statusCode, 401);
  assert.equal(d.calls.length, 0);
  const ok = await app.inject({ method: "POST", url: "/api/gsheet/notify", headers: { "x-gsheet-token": "tok" }, payload: BODY });
  assert.equal(ok.statusCode, 200);
  assert.equal(d.calls.length, 1);
  await app.close();
  const off = Fastify();
  await off.register(gsheetPlugin, { token: "tok", cacheStore: { get: async () => null } });
  const r = await off.inject({ method: "POST", url: "/api/gsheet/notify", headers: { "x-gsheet-token": "tok" }, payload: BODY });
  assert.equal(r.statusCode, 503);
  await off.close();
});
