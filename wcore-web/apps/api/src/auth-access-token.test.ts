// Run: node --import ./apps/api/set-test-env.js --import tsx --test apps/api/src/auth-access-token.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { MemoryCacheStore } from "@wcore/core";
import { TEST_JWT_SECRET as JWT_SECRET } from "./test-secret.js";
import { authPlugin } from "./auth.js";

test("auth hook rejects a revoked access token jti", async () => {
  const app = Fastify();
  const cache = new MemoryCacheStore();
  const jti = "revoked-access-test-jti";

  await cache.set(`revoked:${jti}`, "1", 60_000);
  await authPlugin(app, {} as never, cache);
  app.get("/whoami", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    return { id: req.user.id };
  });
  await app.ready();

  const token = jwt.sign(
    { sub: "user_1", address: "0x4200000000000000000000000000000000000004", type: "access", jti },
    JWT_SECRET,
    { expiresIn: "15m" },
  );
  const res = await app.inject({
    method: "GET",
    url: "/whoami",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.payload), { error: "not_authenticated" });

  await app.close();
});
