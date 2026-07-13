import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { PrismaClient } from "@wcore/db";
import { cexPlugin, convertUsdPriceToEur } from "../plugins/cex.js";

test("converts one USD to EUR using the canonical FX rate", () => {
  assert.equal(convertUsdPriceToEur(1, 0.8), 0.8);
});

test("converts a USD price to EUR by multiplying by the FX rate", () => {
  assert.equal(convertUsdPriceToEur(10, 0.8), 8);
});

test("rejects zero and non-finite conversion inputs", () => {
  assert.equal(convertUsdPriceToEur(0, 0.8), null);
  assert.equal(convertUsdPriceToEur(10, 0), null);
  assert.equal(convertUsdPriceToEur(-1, 0.8), null);
  assert.equal(convertUsdPriceToEur(10, -0.8), null);
  assert.equal(convertUsdPriceToEur(Number.NaN, 0.8), null);
  assert.equal(convertUsdPriceToEur(10, Number.NaN), null);
  assert.equal(convertUsdPriceToEur(Number.POSITIVE_INFINITY, 0.8), null);
  assert.equal(convertUsdPriceToEur(10, Number.POSITIVE_INFINITY), null);
});

test("rejects overflow and underflow conversion results", () => {
  assert.equal(convertUsdPriceToEur(Number.MAX_VALUE, 2), null);
  assert.equal(convertUsdPriceToEur(Number.MIN_VALUE, 0.5), null);
});

test("GET /api/cex/prices requires the Google Sheets token and caps batches at 50", async () => {
  const app = Fastify();
  const originalToken = process.env.GSHEET_API_TOKEN;
  process.env.GSHEET_API_TOKEN = "secret";

  try {
    await cexPlugin(app, { prisma: {} as PrismaClient });
    await app.ready();
    const unauthorized = await app.inject({ method: "GET", url: "/api/cex/prices?symbols=BTC" });
    assert.equal(unauthorized.statusCode, 401);

    const missing = await app.inject({ method: "GET", url: "/api/cex/prices", headers: { "x-gsheet-token": "secret" } });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error, "missing_symbols");

    const symbols = Array.from({ length: 51 }, (_, i) => `S${i}`).join(",");
    const oversized = await app.inject({ method: "GET", url: `/api/cex/prices?symbols=${symbols}`, headers: { "x-gsheet-token": "secret" } });
    assert.equal(oversized.statusCode, 400);
    assert.deepEqual(oversized.json(), { error: "too_many_symbols", max: 50 });
  } finally {
    if (originalToken === undefined) delete process.env.GSHEET_API_TOKEN;
    else process.env.GSHEET_API_TOKEN = originalToken;
    await app.close();
  }
});

test("GET /api/cex/prices batches stock symbols into one relay request", async () => {
  const app = Fastify();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GSHEET_API_TOKEN;
  const originalRelayToken = process.env.RELAY_TOKEN;
  const originalRelayUrl = process.env.CEX_RELAY_URL;
  let relayRequests = 0;
  process.env.GSHEET_API_TOKEN = "secret";
  process.env.RELAY_TOKEN = "relay-secret";
  process.env.CEX_RELAY_URL = "https://relay.test";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://relay.test/stock/prices");
    assert.deepEqual(JSON.parse(String(init?.body)), { token: "relay-secret", symbols: ["HYXS", "SSU"] });
    relayRequests += 1;
    return new Response(JSON.stringify({ ok: true, prices: { HYXS: { priceEur: 1320, source: "yahoo:relay" } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await cexPlugin(app, { prisma: {} as PrismaClient });
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: "/api/cex/prices?symbols=HYXS,SSU&bucket=stocks&provider=bitpanda",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(relayRequests, 1);
    assert.deepEqual(response.json(), {
      prices: {
        HYXS: { priceEur: 1320, source: "yahoo:relay" },
        SSU: { priceEur: null, source: null },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["GSHEET_API_TOKEN", originalToken],
      ["RELAY_TOKEN", originalRelayToken],
      ["CEX_RELAY_URL", originalRelayUrl],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await app.close();
  }
});
