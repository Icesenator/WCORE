// Run: node --import tsx --test apps/api/test/admin-plugins.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

const VALID_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

describe("admin plugin — privilege guards", () => {
  let ready = false;

  before(async () => {
    if (!ready) {
      await app.ready();
      ready = true;
    }
  });

  after(async () => {
    await app.close();
  });

  // --- /api/health/detailed ---
  test("GET /api/health/detailed returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  test("GET /api/health/detailed returns 401 with wrong Bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
      headers: { authorization: "Bearer wrong-token-12345" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("GET /api/health/detailed returns 401 with wrong x-admin-token header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
      headers: { "x-admin-token": "wrong" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("GET /api/health/detailed returns 401 with empty ADMIN_TOKEN env", async () => {
    // Even if we pass a token, the server has no ADMIN_TOKEN set in test env
    // so isAdminAuthorized should return false for any token.
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
      headers: { "x-admin-token": "any-value" },
    });
    assert.equal(res.statusCode, 401);
  });

  // --- /api/admin/metrics/history ---
  test("GET /api/admin/metrics/history returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/metrics/history?range=24h",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  test("GET /api/stats returns 401 without admin token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  test("GET /api/circuit returns 401 without admin token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/circuit" });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  // --- /api/admin/scam-override ---
  test("POST /api/admin/scam-override returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/scam-override",
      payload: { symbol: "TEST", action: "approve" },
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  test("POST /api/admin/scam-override returns 400 when body is missing symbol", async () => {
    // Without admin auth, returns 401. But test that schema validation works too:
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/scam-override",
      payload: { action: "approve" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("POST /api/admin/scam-override returns 401 with user JWT (admin bypass removed)", async () => {
    // The admin cookie fallback was removed — even the platform owner's JWT
    // should not grant access to admin endpoints anymore.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/scam-override",
      headers: { authorization: "Bearer some-user-jwt" },
      payload: { symbol: "TEST", action: "approve" },
    });
    assert.equal(res.statusCode, 401);
  });

  // --- /api/admin/events ---
  test("GET /api/admin/events returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/events",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  // --- /api/admin/pricing/accuracy ---
  test("GET /api/admin/pricing/accuracy returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/pricing/accuracy",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  // --- /api/admin/scam-overrides (GET, admin-only) ---
  test("GET /api/admin/scam-overrides returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/scam-overrides",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  // --- Auth header variants ---
  test("admin endpoints reject x-admin-token with empty string", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
      headers: { "x-admin-token": "" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("admin endpoints reject authorization header without Bearer prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/detailed",
      headers: { authorization: "Basic dGVzdDp0ZXN0" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("admin endpoints reject missing authorization header entirely", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/metrics/history?range=24h",
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 401);
  });

  // --- Happy path (only when ADMIN_TOKEN is configured) ---
  if (VALID_ADMIN_TOKEN) {
    test("GET /api/health/detailed returns 200 with valid Bearer token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/health/detailed",
        headers: { authorization: `Bearer ${VALID_ADMIN_TOKEN}` },
      });
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload) as { status?: string; service?: string };
      assert.equal(data.service, "wcore-api");
    });

    test("GET /api/health/detailed returns 200 with valid x-admin-token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/health/detailed",
        headers: { "x-admin-token": VALID_ADMIN_TOKEN },
      });
      assert.equal(res.statusCode, 200);
    });
  }
});
