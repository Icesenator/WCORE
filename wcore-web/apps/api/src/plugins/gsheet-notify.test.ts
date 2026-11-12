import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";
import { composeNotifyText, handleNotify, notifyHash, type NotifyReservation } from "./gsheet-notify.js";

const TOPIC = "test-topic-abcdef123";
const BODY = { event: "strat_rebalance", category: "crypto", sell: { symbol: "SOMI", eur: 21 }, buy: { symbol: "ETH", eur: 1235 } };

function deps(opts: { admission?: NotifyReservation["admission"]; status?: number; throws?: boolean } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let released = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (opts.throws) throw new Error("timeout");
    return new Response("{}", { status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
  return {
    calls,
    released: () => released,
    deps: {
      topic: TOPIC,
      fetchImpl,
      admit: async () => ({ admission: opts.admission ?? "ok", release: async () => { released++; } }),
    },
  };
}

test("the server composes the text from validated fields only", () => {
  assert.equal(composeNotifyText(BODY as never), "WCORE : rééquilibrage Crypto à faire : alléger SOMI de 21 €, renforcer ETH de 1 235 €.");
  assert.equal(composeNotifyText({ event: "strat_rebalance", category: "action" } as never), "WCORE : rééquilibrage Action à faire.");
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
});

test("free text, extra fields, bad symbols, decimals, unknown events are refused without sending", async () => {
  const bad = [
    { ...BODY, text: "hello" },
    { ...BODY, event: "anything" },
    { ...BODY, category: "bonds" },
    { ...BODY, sell: { symbol: "https://x", eur: 1 } },
    { ...BODY, sell: { symbol: "SOMI", eur: 1.5 } },
    { ...BODY, sell: { symbol: "SOMI", eur: 1, topic: "x" } },
    { ...BODY, buy: { symbol: "ETH", eur: -3 } },
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

test("daily cap: 429 and no send; duplicate: no send; admission down: 503", async () => {
  for (const [admission, status] of [["cap", 429], ["duplicate", 200], ["unavailable", 503]] as const) {
    const d = deps({ admission });
    const r = await handleNotify(BODY, d.deps);
    assert.equal(r.status, status, admission);
    assert.equal(d.calls.length, 0);
  }
});

test("a clear ntfy refusal frees the reservation; an ambiguous failure keeps it", async () => {
  const refused = deps({ status: 429 });
  const r1 = await handleNotify(BODY, refused.deps);
  assert.equal(r1.status, 502);
  assert.equal(refused.released(), 1);
  const lost = deps({ throws: true });
  const r2 = await handleNotify(BODY, lost.deps);
  assert.equal(r2.status, 502);
  assert.equal(lost.released(), 0);
});

test("a bad topic disables the relay", async () => {
  const d = deps();
  const r = await handleNotify(BODY, { ...d.deps, topic: "bad topic/x" });
  assert.equal(r.status, 503);
  assert.equal(d.calls.length, 0);
});

test("the hash depends on the text only and reveals no field", () => {
  const h = notifyHash(composeNotifyText(BODY as never));
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.ok(!h.includes("SOMI"));
});

test("the route needs the GSheet token, and answers 503 when the relay is off", async () => {
  const d = deps();
  const app = Fastify();
  await app.register(gsheetPlugin, { token: "tok", cacheStore: { get: async () => null }, notify: d.deps });
  const noTok = await app.inject({ method: "POST", url: "/api/gsheet/notify", payload: BODY });
  assert.equal(noTok.statusCode, 401);
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

test("the test event composes a fixed text and takes no field", async () => {
  assert.equal(composeNotifyText({ event: "test" } as never), "WCORE : essai depuis le classeur, rien à faire.");
  const d = deps();
  assert.equal((await handleNotify({ event: "test", category: "crypto" }, d.deps)).status, 400);
  assert.equal((await handleNotify({ event: "test" }, d.deps)).status, 200);
});
