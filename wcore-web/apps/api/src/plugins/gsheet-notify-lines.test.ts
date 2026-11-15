import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNotifyText, handleNotify, notifyBodySchema } from "./gsheet-notify.js";
import { handleTradeAck, handleTradeAckTake, ackToken, type AckEntry, type AckStore } from "./gsheet-trade-ack.js";

const TOPIC = "test-topic-abcdef123";
const BASE_BODY = {
  event: "strat_rebalance", category: "crypto", occurrence: "AY1-1794470000000",
  sell: { symbol: "AAVE", eur: 21 }, buy: { symbol: "CRO", eur: 1235 },
};

test("the text names the Recap lines proposed for the rebalancing", () => {
  const t = composeNotifyText({ ...BASE_BODY, sellLines: ["CEX - OKX"], sellEnough: true, buyLines: ["CEX - OKX", "Ledger - Cronos"] } as never);
  assert.equal(t, "WCORE : rééquilibrage Crypto à faire : alléger AAVE de 21 €, renforcer CRO de 1 235 €. Vendre depuis : CEX - OKX (suffit seule). Renforcer sur : CEX - OKX, Ledger - Cronos.");
  const partial = composeNotifyText({ ...BASE_BODY, sellLines: ["CEX - OKX", "Ledger - Base"], buyLines: ["CEX - OKX"] } as never);
  assert.match(partial, /Vendre depuis : CEX - OKX, Ledger - Base\. Renforcer sur : CEX - OKX\.$/);
});

test("no line holding a symbol is said plainly, and absent lines change nothing", () => {
  assert.match(composeNotifyText({ ...BASE_BODY, sellLines: [], buyLines: [] } as never), /Aucune ligne ne détient AAVE\. Aucune ligne ne détient CRO\.$/);
  assert.equal(
    composeNotifyText(BASE_BODY as never),
    "WCORE : rééquilibrage Crypto à faire : alléger AAVE de 21 €, renforcer CRO de 1 235 €.",
  );
});

test("the lines are a closed shape: at most three names of plain characters, nothing else", () => {
  const ok = (extra: object) => notifyBodySchema.safeParse({ ...BASE_BODY, ...extra }).success;
  assert.equal(ok({ sellLines: ["CEX - OKX"], buyLines: [] }), true);
  assert.equal(ok({ sellLines: ["Binance Web3 Wallet - zkLink Nova", "Ledger - Base (Crypto)", "CEX - Bitpanda Stocks"] }), true);
  assert.equal(ok({ sellLines: ["a", "b", "c", "d"] }), false, "more than three");
  assert.equal(ok({ sellLines: ["x".repeat(61)] }), false, "too long");
  assert.equal(ok({ sellLines: ["bad\nline"] }), false, "control character");
  assert.equal(ok({ sellLines: ["http://evil.test"] }), false, "slash and colon");
  assert.equal(ok({ sellLines: ["<b>x</b>"] }), false, "markup");
  assert.equal(ok({ sellLines: [" leading"] }), false, "leading space");
  assert.equal(ok({ buyLines: "CEX - OKX" }), false, "not an array");
  assert.equal(ok({ sellEnough: "yes" }), false, "not a boolean");
  assert.equal(ok({ text: "free text" }), false, "no free text");
});

test("a notification with lines is sent with that text", async () => {
  const calls: Array<{ body: unknown }> = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => { calls.push({ body: init.body }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const r = await handleNotify(
    { ...BASE_BODY, sellLines: ["CEX - OKX"], sellEnough: false, buyLines: ["Ledger - Cronos"] },
    { topic: TOPIC, fetchImpl, admit: async () => ({ admission: "ok" as const }) },
  );
  assert.equal(r.status, 200);
  assert.match(String(calls[0]!.body), /Vendre depuis : CEX - OKX\. Renforcer sur : Ledger - Cronos\.$/);
});

test("the take returns each acknowledgement with its occurrence, categories kept for older workbooks", async () => {
  const entries: AckEntry[] = [
    { category: "crypto", occurrence: "AY1-1794470000000" },
    { category: "action", occurrence: "BE1-1794470000001" },
    { category: "crypto", occurrence: "AY1-1794470000002" },
  ];
  const store: AckStore = { record: async () => "recorded", take: async () => entries };
  const r = await handleTradeAckTake(store);
  assert.equal(r.status, 200);
  if (r.status === 200) {
    assert.deepEqual(r.body.acks, entries);
    assert.deepEqual(r.body.categories.sort(), ["action", "crypto"]);
  }
});

test("the occurrence reaches the store when the button is tapped", async () => {
  const seen: string[] = [];
  const store: AckStore = {
    record: async (_k, _c, _nk, occurrence) => { seen.push(occurrence); return "recorded"; },
    take: async () => [],
  };
  const now = 1_794_470_000_000;
  const expiry = Math.floor((now + 6 * 3600 * 1000) / 1000);
  const q = { c: "crypto", o: "AY1-1794470000000", e: String(expiry), t: ackToken(TOPIC, "crypto", "AY1-1794470000000", expiry) };
  assert.equal((await handleTradeAck(q, { topic: TOPIC, store }, now)).status, 200);
  assert.deepEqual(seen, ["AY1-1794470000000"]);
});
