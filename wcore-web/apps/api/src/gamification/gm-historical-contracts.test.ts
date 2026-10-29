// Discriminating access-control tests for GET /api/gm/historical-contracts.
//
// Uses a mocked Prisma client and Fastify `inject` — no database, no network,
// no RPC, no write. Proves the route scopes by the AUTHENTICATED identity only,
// so a client-supplied address can never widen another user's view.
//
// Run: pnpm exec tsx --test apps/api/src/gamification/gm-historical-contracts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { PrismaClient } from "@wcore/db";
import { registerGmHistoricalContractsRoute } from "./gm-contracts.js";

type Row = {
  id: string;
  chainKey: string;
  contractAddress: string;
  createdAt: Date;
  creatorAddress: string | null;
  ownerId: string | null;
};

const ALICE = { id: "user-alice", address: "0xAAAA000000000000000000000000000000000001" };
const BOB = { id: "user-bob", address: "0xBBBB000000000000000000000000000000000002" };
const EMPTY_USER = { id: "user-empty", address: "0xCCCC000000000000000000000000000000000003" };

const ROWS: Row[] = [
  // Alice owns two historical rows (one degen lower-case, one SUPERPOSITION upper-case)
  { id: "a-degen", chainKey: "degen", contractAddress: "0x1111111111111111111111111111111111111111", createdAt: new Date("2026-01-03"), creatorAddress: ALICE.address.toLowerCase(), ownerId: ALICE.id },
  { id: "a-super", chainKey: "SUPERPOSITION", contractAddress: "0x2222222222222222222222222222222222222222", createdAt: new Date("2026-01-02"), creatorAddress: ALICE.address.toLowerCase(), ownerId: ALICE.id },
  // Alice also has an ACTIVE-chain row that must NOT appear in the historical view
  { id: "a-moca", chainKey: "MOCA", contractAddress: "0x3333333333333333333333333333333333333333", createdAt: new Date("2026-01-01"), creatorAddress: ALICE.address.toLowerCase(), ownerId: ALICE.id },
  // Bob owns a historical row owned through the User relation (no creatorAddress match)
  { id: "b-degen", chainKey: "degen", contractAddress: "0x4444444444444444444444444444444444444444", createdAt: new Date("2026-01-04"), creatorAddress: null, ownerId: BOB.id },
  // A user with no address at all — matched by ownerId fallback
  { id: "noaddr-degen", chainKey: "degen", contractAddress: "0x5555555555555555555555555555555555555555", createdAt: new Date("2026-01-05"), creatorAddress: null, ownerId: "user-noaddr" },
];

// Minimal Prisma double: honours the exact `where` shapes the route builds.
function makeFakePrisma(): PrismaClient {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = [ALICE, BOB, EMPTY_USER, { id: "user-noaddr", address: null }].find((x) => x.id === where.id);
        return u ? { address: u.address } : null;
      },
    },
    gmContract: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        let out = ROWS;
        if (where && "ownerId" in where) {
          out = ROWS.filter((r) => r.ownerId === where.ownerId);
        } else if (where && "OR" in where) {
          const ors = where.OR as Array<Record<string, unknown>>;
          out = ROWS.filter((r) =>
            ors.some((clause) => {
              if ("creatorAddress" in clause) return r.creatorAddress === clause.creatorAddress;
              const owner = clause.owner as { address?: string } | undefined;
              if (owner?.address) return r.ownerId != null && r.ownerId !== "" && [ALICE, BOB, EMPTY_USER].some((u) => u.id === r.ownerId && u.address.toLowerCase() === owner.address);
              return false;
            }),
          );
        }
        return out.map((r) => ({ id: r.id, chainKey: r.chainKey, contractAddress: r.contractAddress, createdAt: r.createdAt, creatorAddress: r.creatorAddress }));
      },
    },
  } as unknown as PrismaClient;
}

// Build an app whose identity comes from a test-only header (mirrors the auth plugin
// setting req.user from the signed JWT cookie). The app itself never reads the header.
async function buildApp() {
  const app = Fastify();
  app.decorateRequest("user", undefined);
  app.addHook("onRequest", async (req) => {
    const as = (req.headers["x-test-user"] as string | undefined) ?? "";
    if (as === "alice") req.user = { id: ALICE.id, address: ALICE.address.toLowerCase() };
    else if (as === "bob") req.user = { id: BOB.id, address: BOB.address.toLowerCase() };
    else if (as === "empty") req.user = { id: EMPTY_USER.id, address: EMPTY_USER.address.toLowerCase() };
    else if (as === "noaddr") req.user = { id: "user-noaddr", address: "" };
  });
  registerGmHistoricalContractsRoute(app, makeFakePrisma());
  await app.ready();
  return app;
}

test("unauthenticated request is refused (401)", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/historical-contracts" });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.body), { error: "not_authenticated" });
  await app.close();
});

test("user A sees only A's historical contracts (active chains excluded)", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/historical-contracts", headers: { "x-test-user": "alice" } });
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body) as Array<{ id: string; isHistorical: boolean; chainKey: string }>;
  assert.deepEqual(data.map((d) => d.id).sort(), ["a-degen", "a-super"]);
  assert.ok(data.every((d) => d.isHistorical === true));
  // Moca (active) is never in the historical view
  assert.equal(data.some((d) => d.chainKey.toLowerCase() === "moca"), false);
  await app.close();
});

test("user B sees only B's historical contract, and never A's", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/historical-contracts", headers: { "x-test-user": "bob" } });
  assert.equal(res.statusCode, 200);
  const ids = (JSON.parse(res.body) as Array<{ id: string }>).map((d) => d.id);
  assert.deepEqual(ids, ["b-degen"]);
  assert.equal(ids.includes("a-degen"), false);
  assert.equal(ids.includes("a-super"), false);
  await app.close();
});

test("A cannot read B's contracts by passing an address in query/body/header", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: `/api/gm/historical-contracts?address=${encodeURIComponent(BOB.address)}`,
    headers: { "x-test-user": "alice", "x-address": BOB.address },
    payload: { address: BOB.address },
  });
  assert.equal(res.statusCode, 200);
  const ids = (JSON.parse(res.body) as Array<{ id: string }>).map((d) => d.id);
  assert.deepEqual(ids.sort(), ["a-degen", "a-super"]);
  assert.equal(ids.includes("b-degen"), false);
  await app.close();
});

test("ownership without a wallet address falls back to ownerId (no cross-user leak)", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/historical-contracts", headers: { "x-test-user": "noaddr" } });
  assert.equal(res.statusCode, 200);
  const ids = (JSON.parse(res.body) as Array<{ id: string }>).map((d) => d.id);
  assert.deepEqual(ids, ["noaddr-degen"]);
  await app.close();
});

test("empty result is a valid 200 (unknown history is not an error)", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/historical-contracts", headers: { "x-test-user": "empty" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), []);
  await app.close();
});
