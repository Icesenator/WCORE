import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { analyticsPlugin, createPrismaAnalyticsStore, type AnalyticsAggregateStore } from "../src/plugins/analytics.js";

const upserts: Array<Record<string, unknown>> = [];
const store: AnalyticsAggregateStore = {
  increment: async (input) => {
    upserts.push(input);
  },
  query: async () => [
    { event: "scan_completed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=success", count: 7 },
    { event: "scan_failed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=failed", count: 3 },
  ],
};

let app: FastifyInstance;

before(async () => {
  app = Fastify({ logger: false });
  await analyticsPlugin(app, {
    store,
    isAdminAuthorized: (request) => request.headers["x-admin-token"] === "ok",
  });
  await app.ready();
});

after(async () => {
  await app.close();
});

describe("analytics plugin", () => {
  test("uses Prisma atomic aggregates for writes and reads", async () => {
    const calls: Array<{ method: string; args: unknown }> = [];
    const prisma = {
      funnelEventAggregate: {
        upsert: async (args: unknown) => {
          calls.push({ method: "upsert", args });
        },
        groupBy: async (args: unknown) => {
          calls.push({ method: "groupBy", args });
          return [{ event: "scan_completed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=success", _sum: { count: 7 } }];
        },
      },
    };
    const prismaStore = createPrismaAnalyticsStore(prisma);
    const bucketDate = new Date("2026-08-23T00:00:00.000Z");

    await prismaStore.increment({ bucketDate, event: "scan_started", campaign: "one_portfolio", surface: "home", variant: "control", dimensionKey: "none" });
    const rows = await prismaStore.query({ from: new Date("2026-08-01T00:00:00.000Z"), to: bucketDate, campaign: "one_portfolio" });

    assert.equal(calls[0]?.method, "upsert");
    assert.deepEqual((calls[0]?.args as { update: unknown }).update, { count: { increment: 1 } });
    assert.equal(calls[1]?.method, "groupBy");
    assert.deepEqual(rows, [{ event: "scan_completed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=success", count: 7 }]);
  });

  test("aggregates a valid event without request identifiers", async () => {
    upserts.length = 0;
    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      remoteAddress: "203.0.113.8",
      payload: {
        events: [{
          event: "scan_started",
          campaign: "one_portfolio",
          surface: "home",
          variant: "control",
          dimensions: { walletCount: "2_3", chainCount: "6_20", authState: "anonymous", scanMode: "standard" },
        }],
      },
    });

    assert.equal(response.statusCode, 202);
    assert.equal(upserts.length, 1);
    const serialized = JSON.stringify(upserts[0]);
    assert.match(serialized, /walletCount=2_3/);
    assert.doesNotMatch(serialized, /203\.0\.113\.8|user|session|walletAddress|pathname/i);
  });

  test("rejects unknown events and free-form dimensions", async () => {
    const unknownEvent = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      payload: { events: [{ event: "wallet_address_seen", campaign: "one_portfolio", surface: "home", variant: "control", dimensions: {} }] },
    });
    assert.equal(unknownEvent.statusCode, 400);

    const freeForm = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      payload: { events: [{ event: "scan_started", campaign: "one_portfolio", surface: "home", variant: "control", dimensions: { address: "0x1111111111111111111111111111111111111111" } }] },
    });
    assert.equal(freeForm.statusCode, 400);
  });

  test("bounds event batches", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      payload: { events: Array.from({ length: 6 }, () => ({ event: "campaign_landing_viewed", campaign: "one_portfolio", surface: "home", variant: "control", dimensions: {} })) },
    });
    assert.equal(response.statusCode, 400);
  });

  test("protects admin reads and suppresses low-volume groups", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/api/admin/analytics/funnel" });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({ method: "GET", url: "/api/admin/analytics/funnel", headers: { "x-admin-token": "ok" } });
    assert.equal(authorized.statusCode, 200);
    const body = authorized.json();
    assert.equal(body.rows.length, 1);
    assert.equal(body.rows[0].count, 7);
  });
});
