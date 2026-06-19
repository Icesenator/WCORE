import { describe, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { gsheetPlugin } from "./gsheet.js";

describe("gsheetPlugin", () => {
  test("returns 401 without token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({ method: "GET", url: "/api/gsheet/cache/get?key=k" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("returns cached value with valid token", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, {
      token: "secret",
      cacheStore: { get: async (key) => (key === "k" ? "v" : null) },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get?key=k",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { found: true, value: "v" });
    await app.close();
  });

  test("returns found:false for missing key", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get?key=missing",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { found: false, value: null });
    await app.close();
  });

  test("returns 400 when key is missing", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    const res = await app.inject({
      method: "GET",
      url: "/api/gsheet/cache/get",
      headers: { "x-gsheet-token": "secret" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("does not block non-gsheet routes", async () => {
    const app = Fastify();
    await app.register(gsheetPlugin, { token: "secret", cacheStore: { get: async () => null } });
    app.get("/api/scan/foo", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/scan/foo" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    await app.close();
  });
});
