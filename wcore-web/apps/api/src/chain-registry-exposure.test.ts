import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { chainList, MemoryCacheStore } from "@wcore/core";
import { chainsPlugin } from "./plugins/chains.js";
import { ChainKey, NativePriceQuerySchema } from "./schemas.js";

test("GET /api/chains exposes the registry derived counts, without Superseed and with Ancient8 disabled", async () => {
  const app = Fastify();
  await chainsPlugin(app, { circuitBreakers: new Map(), cache: new MemoryCacheStore() });
  try {
    const res = await app.inject({ method: "GET", url: "/api/chains" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { count: number; chains: { key: string; chainId?: number; disabled: boolean }[] };
    assert.equal(body.count, chainList.length);
    assert.equal(body.chains.length, chainList.length);
    assert.equal(body.chains.filter((c) => c.disabled).length, chainList.filter((c) => c.FLAGS?.DISABLE_CHAIN === true).length);
    assert.equal(body.chains.some((c) => c.key === "SUPERSEED" || Number(c.chainId) === 5330), false);
    assert.deepEqual(body.chains.find((c) => c.key === "ANCIENT8")?.disabled, true);
  } finally {
    await app.close();
  }
});

test("schemas refuse Superseed but still accept the disabled-but-registered Ancient8", () => {
  assert.equal(ChainKey.safeParse("superseed").success, false);
  assert.equal(NativePriceQuerySchema.safeParse({ chain: "SUPERSEED" }).success, false);
  assert.equal(ChainKey.safeParse("ancient8").success, true);
});
