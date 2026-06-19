import test from "node:test";
import assert from "node:assert/strict";
import { fetchStockPricesViaRelay } from "./stock-relay.js";

test("fetchStockPricesViaRelay posts symbols and returns the relay price map", async () => {
  let captured: { url: string; body: unknown } | null = null;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
    return {
      ok: true,
      json: async () => ({ ok: true, prices: { AAPL: { priceEur: 250, source: "yahoo:usd:AAPL" } } }),
    } as Response;
  };

  const prices = await fetchStockPricesViaRelay(["AAPL", "MSFT"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });

  assert.equal(prices.AAPL?.priceEur, 250);
  assert.equal(captured!.url, "https://relay.example/stock/prices");
  assert.deepEqual((captured!.body as { symbols: string[] }).symbols, ["AAPL", "MSFT"]);
  assert.equal((captured!.body as { token: string }).token, "secret");
});

test("fetchStockPricesViaRelay returns empty map on relay error without throwing", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({ ok: false }) } as Response);
  const prices = await fetchStockPricesViaRelay(["AAPL"], {
    fetchImpl,
    relayUrl: "https://relay.example",
    relayToken: "secret",
  });
  assert.deepEqual(prices, {});
});

test("fetchStockPricesViaRelay returns empty map when no symbols", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return {} as Response; };
  const prices = await fetchStockPricesViaRelay([], { fetchImpl, relayUrl: "https://relay.example", relayToken: "secret" });
  assert.deepEqual(prices, {});
  assert.equal(called, false);
});
