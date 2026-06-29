import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { chainsPlugin } from "./chains.js";

test("/api/chains counts centralized RPC fallbacks", async () => {
  const app = Fastify();
  await app.register(chainsPlugin, {
    circuitBreakers: new Map(),
    cache: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
      clear: async () => {},
      mget: async (keys) => keys.map(() => undefined),
      add: async () => true,
    },
  });

  const res = await app.inject({ method: "GET", url: "/api/chains" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { chains: Array<{ key: string; rpcCount: number }> };
  const camp = body.chains.find((chain) => chain.key === "CAMP");
  assert.equal(camp?.rpcCount, 1);

  await app.close();
});
