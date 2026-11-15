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
  assert.equal(t, "WCORE : rééquilibrage Crypto à faire : alléger AAVE, renforcer CRO : trade de 21 €. Vendre depuis : CEX - OKX (suffit seule). Renforcer sur : CEX - OKX, Ledger - Cronos.");
  // "suffit seule" is the first line's only; the others are named as alternatives, never lumped together.
  const several = composeNotifyText({ ...BASE_BODY, sellLines: ["CEX - OKX", "Ledger - Base"], sellEnough: true, buyLines: [] } as never);
  assert.match(several, /Vendre depuis : CEX - OKX \(suffit seule\), ou Ledger - Base\. /);
  const partial = composeNotifyText({ ...BASE_BODY, sellLines: ["CEX - OKX", "Ledger - Base"], buyLines: ["CEX - OKX"] } as never);
  assert.match(partial, /Vendre depuis : CEX - OKX, Ledger - Base\. Renforcer sur : CEX - OKX\.$/);
});

test("no line holding a symbol is said plainly, and absent lines change nothing", () => {
  assert.match(composeNotifyText({ ...BASE_BODY, sellLines: [], buyLines: [] } as never), /Aucune ligne ne détient AAVE\. Aucune ligne ne détient CRO\.$/);
  assert.equal(
    composeNotifyText(BASE_BODY as never),
    "WCORE : rééquilibrage Crypto à faire : alléger AAVE, renforcer CRO : trade de 21 €.",
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

test("one trade amount only: the smaller side, whichever side it is, or the only known one, or none", () => {
  const text = (sell: object, buy: object) => composeNotifyText({ ...BASE_BODY, sell, buy } as never);
  assert.match(text({ symbol: "AAVE", eur: 21 }, { symbol: "CRO", eur: 1235 }), /alléger AAVE, renforcer CRO : trade de 21 €\.$/);
  assert.match(text({ symbol: "AAVE", eur: 1235 }, { symbol: "CRO", eur: 21 }), /alléger AAVE, renforcer CRO : trade de 21 €\.$/);
  assert.match(text({ symbol: "AAVE", eur: 50 }, { symbol: "CRO", eur: 50 }), /: trade de 50 €\.$/, "equal amounts");
  assert.match(text({ symbol: "AAVE" }, { symbol: "CRO", eur: 7 }), /: trade de 7 €\.$/, "only the buy side known");
  assert.match(text({ symbol: "AAVE", eur: 9 }, { symbol: "CRO" }), /: trade de 9 €\.$/, "only the sell side known");
  assert.equal(text({ symbol: "AAVE" }, { symbol: "CRO" }), "WCORE : rééquilibrage Crypto à faire : alléger AAVE, renforcer CRO.", "no amount known");
  assert.match(text({ symbol: "AAVE", eur: 0 }, { symbol: "CRO", eur: 1235 }), /: trade de 0 €\.$/, "a zero side is the smaller side");
  assert.match(text({ symbol: "AAVE", eur: 1234567 }, { symbol: "CRO", eur: 2345678 }), /: trade de 1 234 567 €\.$/, "large amounts keep the thousands spacing");
  assert.ok(!/ de \d[\d ]* € .*de \d/.test(text({ symbol: "AAVE", eur: 21 }, { symbol: "CRO", eur: 1235 })), "never two amounts");
});
