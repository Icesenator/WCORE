import assert from "node:assert/strict";
import { test } from "node:test";

import type { ZerionEnrichmentConfig } from "../../config.js";
import type { PortfolioEnrichmentInput } from "./types.js";
import { DISABLED_PROVIDER_IDS } from "./types.js";
import { createConfiguredPortfolioEnrichment } from "./factory.js";

const BASE: ZerionEnrichmentConfig = {
  enabled: true,
  apiKey: "test-key-not-a-secret",
  timeoutMs: 500,
  cacheTtlMs: 600_000,
  lastGoodTtlMs: 86_400_000,
  dailyBudget: 10,
  maxResponseBytes: 2_000_000,
  maxPositions: 1_000,
};

const EMPTY_ENVELOPE = {
  links: { self: "https://api.zerion.io/v1/wallets/x/positions/", next: null, prev: null },
  meta: { total: 0 },
  data: [] as unknown[],
};

function okFetch(track: { n: number }): typeof fetch {
  return (async () => {
    track.n += 1;
    return new Response(JSON.stringify(EMPTY_ENVELOPE));
  }) as unknown as typeof fetch;
}

const input = (address = "0xABCDEF0123456789012345678901234567890123"): PortfolioEnrichmentInput => ({
  address,
  requestedChains: ["ETHEREUM"],
  assetsByChain: new Map(),
});

test("config gate: enabled=false registers no provider and never touches the network", async () => {
  const track = { n: 0 };
  const svc = createConfiguredPortfolioEnrichment({ zerion: { ...BASE, enabled: false }, fetchImpl: okFetch(track) });
  const out = await svc.run(input());
  assert.equal(out.length, 0);
  assert.equal(track.n, 0);
});

test("config gate: enabled=true without apiKey stays disabled (no call)", async () => {
  const track = { n: 0 };
  const svc = createConfiguredPortfolioEnrichment({ zerion: { ...BASE, apiKey: "   " }, fetchImpl: okFetch(track) });
  const out = await svc.run(input());
  assert.equal(out.length, 0, "blank apiKey must not activate the provider");
  assert.equal(track.n, 0);
});

test("config gate: enabled=true + apiKey runs Zerion and returns EMPTY for an empty wallet", async () => {
  const track = { n: 0 };
  const svc = createConfiguredPortfolioEnrichment({ zerion: BASE, fetchImpl: okFetch(track) });
  const [o] = await svc.run(input());
  assert.equal(o?.provider, "zerion");
  assert.equal(o?.status, "EMPTY");
  assert.equal(track.n, 1);
});

test("providers disabled by design are never enabled by config", async () => {
  const track = { n: 0 };
  const svc = createConfiguredPortfolioEnrichment({ zerion: BASE, fetchImpl: okFetch(track) });
  const out = await svc.run(input());
  const ids = new Set(out.map((o) => o.provider));
  for (const disabled of DISABLED_PROVIDER_IDS) assert.equal(ids.has(disabled), false);
  assert.deepEqual([...ids], ["zerion"]);
});

test("dailyBudget is enforced by the independent per-provider budget", async () => {
  const track = { n: 0 };
  const svc = createConfiguredPortfolioEnrichment({ zerion: { ...BASE, dailyBudget: 1 }, fetchImpl: okFetch(track) });
  const first = await svc.run(input("0x1111111111111111111111111111111111111111"));
  assert.equal(first[0]?.status, "EMPTY");
  const second = await svc.run(input("0x2222222222222222222222222222222222222222"));
  assert.equal(second[0]?.status, "DISABLED");
  assert.equal(second[0]?.errorKind, "budget_exhausted");
  assert.equal(track.n, 1, "no second network call once the daily budget is exhausted");
});
