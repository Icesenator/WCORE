import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { CacheStore } from "@wcore/core";
import { gsheetPlugin, type GsheetPluginOptions } from "./gsheet.js";

// No real cache, credentials, provider or listener: every request uses inject.
const token = "local-auth-test-token";
const routes = [
  { method: "GET", path: "cache/get?key=sentinel", status: 200, effect: "read" },
  { method: "GET", path: "crypto/portfolio?fresh=true", status: 200, effect: "crypto" },
  { method: "GET", path: "stocks/portfolio?fresh=true", status: 200, effect: "stocks" },
  { method: "DELETE", path: "cache/price?chain=ETHEREUM&contract=sentinel", status: 200, effect: "delete" },
  { method: "POST", path: "fx-telemetry", payload: { rate: 0.9 }, status: 200, effect: "write" },
  // Invalid bodies avoid scan/pricing work even with a valid test token.
  { method: "POST", path: "scan", payload: {}, status: 400, effect: undefined },
  { method: "POST", path: "prices", payload: {}, status: 400, effect: undefined },
] as const;
const prefixes = ["/api/gsheet/", "/%61pi/gsheet/", "/api/%67sheet/", "/%61%70%69/%67%73%68%65%65%74/"];

for (const registration of ["registered", "direct"] as const) {
  for (const prefix of prefixes) {
    for (const auth of ["absent", "invalid", "valid"] as const) {
      test(`${registration}: ${prefix} ${auth} protects all GSheet handlers`, async (t) => {
        const app = Fastify();
        t.after(() => app.close());
        const effects: string[] = [];
        app.get("/public-before", async () => ({ public: true }));
        const opts: GsheetPluginOptions = {
          token,
          cacheStore: { get: async () => { effects.push("read"); return "synthetic-sentinel"; } },
          cache: {
            get: async () => { assert.fail("unexpected cache read"); },
            set: async () => { assert.fail("unexpected cache write"); },
            clear: async () => { assert.fail("unexpected cache clear"); },
            mget: async () => { assert.fail("unexpected cache mget"); },
            add: async () => { assert.fail("unexpected cache add"); },
            delete: async () => { effects.push("delete"); },
          } satisfies CacheStore,
          cacheWriter: {
            get: async () => null,
            set: async () => { effects.push("write"); },
          },
          cryptoPortfolioProvider: async () => {
            effects.push("crypto");
            return { ok: true, generatedAt: "", rows: [], stats: { ranked: 0, unpriced: 0 } };
          },
          stockPortfolioProvider: async () => {
            effects.push("stocks");
            return { ok: true, generatedAt: "", ownerAddress: "", dynamicLimit: 0, holdingsStale: false, rows: [], stats: { ranked: 0, held: 0, heldOutsideRankedUniverse: 0, pricedFresh: 0, pricedStale: 0, unpriced: 0 } };
          },
          scanRunner: async () => { assert.fail("scan must not run"); },
          priceBatcher: async () => { assert.fail("pricing must not run"); },
        };
        if (registration === "registered") await app.register(gsheetPlugin, opts);
        else await gsheetPlugin(app, opts);
        app.get("/public-sentinel", async () => ({ public: true }));
        const headers = auth === "absent" ? {} : { "x-gsheet-token": auth === "valid" ? token : "invalid-test-token" };
        for (const route of routes) {
          await t.test(`${route.method} ${route.path}`, async () => {
            effects.length = 0;
            const response = await app.inject({ method: route.method, url: prefix + route.path, headers, ...("payload" in route ? { payload: route.payload } : {}) });
            assert.equal(response.statusCode, auth === "valid" ? route.status : 401, `${route.method} ${prefix}${route.path}`);
            if (auth !== "valid") assert.deepEqual(response.json(), { error: "unauthorized" });
            assert.deepEqual(effects, auth === "valid" && route.effect ? [route.effect] : [], "unauthorized requests must have no side effects");
          });
        }
        assert.equal((await app.inject("/public-before")).statusCode, 200);
        assert.equal((await app.inject("/public-sentinel")).statusCode, 200);
        assert.equal((await app.inject("/api/diag/fx-parity")).statusCode, 200);
      });
    }
  }
}

test("encoded query values remain legitimate and normalized paths remain protected", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const keys: string[] = [];
  await gsheetPlugin(app, { token, cacheStore: { get: async (key) => { keys.push(key); return "sentinel"; } } });
  const response = await app.inject({ url: "/api/gsheet/cache/get?key=path%2Fpercent%25space%20value", headers: { "x-gsheet-token": token } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(keys, ["path/percent%space value"]);
  keys.length = 0;
  for (const path of ["/api/gsheet/../gsheet/cache/get?key=k", "/api/gsheet/cache%2Fget?key=k", "/api/gsheet%2Fcache/get?key=k", "/%ZZpi/gsheet/cache/get?key=k", "/api/%2567sheet/cache/get?key=k"]) {
    const res = await app.inject({ url: path });
    assert.ok([400, 401, 404].includes(res.statusCode), `${path}: ${res.statusCode}`);
  }
  assert.deepEqual(keys, [], "noncanonical paths cannot read the cache without authentication");
});
