import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { healthPlugin } from "./health.js";

function buildApp(opts: { db: boolean; redis: boolean }) {
  const calls = { db: 0, redis: 0 };
  const app = Fastify();
  const registered = app.register(healthPlugin, {
    checkDb: async () => { calls.db += 1; return opts.db; },
    checkRedis: async () => { calls.redis += 1; return opts.redis; },
    coreVersion: "test-core",
    chainCount: 182,
  });
  return { app, calls, registered };
}

describe("readiness endpoint", () => {
  test("reports ready when both dependencies answer", async () => {
    const { app, registered } = buildApp({ db: true, redis: true });
    await registered;

    const res = await app.inject({ method: "GET", url: "/ready" });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
      status: "ready",
      service: "wcore-api",
      checks: { db: true, redis: true },
    });
    await app.close();
  });

  // Garde posee par le contre-audit du 2026-08-07: une panne Redis etait
  // rapportee saine. Rien ne verrouillait ce comportement jusqu'ici.
  test("refuses readiness when Redis is unavailable", async () => {
    const { app, registered } = buildApp({ db: true, redis: false });
    await registered;

    const res = await app.inject({ method: "GET", url: "/ready" });

    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body) as { status: string; checks: { db: boolean; redis: boolean } };
    assert.equal(body.status, "not_ready");
    assert.equal(body.checks.redis, false);
    assert.equal(body.checks.db, true);
    await app.close();
  });

  test("refuses readiness when the database is unavailable", async () => {
    const { app, registered } = buildApp({ db: false, redis: true });
    await registered;

    const res = await app.inject({ method: "GET", url: "/ready" });

    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body) as { status: string; checks: { db: boolean } };
    assert.equal(body.status, "not_ready");
    assert.equal(body.checks.db, false);
    await app.close();
  });
});

describe("liveness endpoint", () => {
  // /health est une sonde de liveness: Railway redemarre le conteneur quand
  // elle echoue. La faire dependre de Redis transformerait un hoquet Redis en
  // boucle de redemarrage. Elle doit rester statique.
  test("stays 200 and probes no dependency even when everything is down", async () => {
    const { app, calls, registered } = buildApp({ db: false, redis: false });
    await registered;

    const res = await app.inject({ method: "GET", url: "/health" });

    assert.equal(res.statusCode, 200);
    assert.equal((JSON.parse(res.body) as { status: string }).status, "ok");
    assert.equal(calls.db, 0, "liveness must not query the database");
    assert.equal(calls.redis, 0, "liveness must not query Redis");
    await app.close();
  });

  // SEC-10: /health est public et non authentifie. L'etat des disjoncteurs
  // appartient a /api/metrics/errors, derriere l'authentification admin.
  test("does not expose circuit breaker state on the public endpoint", async () => {
    const { app, registered } = buildApp({ db: true, redis: true });
    await registered;

    const res = await app.inject({ method: "GET", url: "/health" });

    const keys = Object.keys(JSON.parse(res.body) as Record<string, unknown>);
    assert.deepEqual(keys.filter((k) => /circuit|breaker/i.test(k)), []);
    assert.deepEqual(keys.sort(), ["chainCount", "coreVersion", "service", "status", "uptimeSec"]);
    await app.close();
  });
});
